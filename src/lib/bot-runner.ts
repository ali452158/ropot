/**
 * ALFA Reports — Bot Runner (Trailing Strategy + Wick fallback)
 *
 * Manages the live trading loop for each active session. The runner is an
 * in-process singleton: one setInterval per session, ticking every 500ms in
 * HF mode or 1s in standard mode.
 *
 * =====================================================================
 *  TWO STRATEGY MODES
 * =====================================================================
 *
 * 1. strategyType = "trailing"  (DEFAULT — recommended)
 *    Auto-pair scan + auto entry + auto trailing exit.
 *    Each tick the bot evaluates every symbol in `scanSymbols`, picks the
 *    highest-scoring candidate, opens a trade with an ATR-based stop loss,
 *    then trails the stop upward (BUY) / downward (SELL) on every tick.
 *    Exit fires when the trailing stop is hit OR the hard time-stop expires.
 *
 * 2. strategyType = "wick"  (legacy)
 *    Original Wick-to-Wick Rejection / HF wick logic from the earlier build.
 *    Kept for backward compatibility — newly created sessions default to
 *    "trailing".
 *
 * =====================================================================
 *  AUTO-RESUME ON CONTAINER RESTART
 * =====================================================================
 * See instrumentation.ts — on process start it queries the DB for every
 * session whose `botRunning = true` and calls `startBot(token)` for each.
 * This survives container restarts and deploys.
 */
import { db } from "./db";
import { getSessionByToken, getSessionIdByToken } from "./session";
import {
  getCandles,
  getCurrentPrice,
  createMarketOrder,
  closePosition,
  getOpenPositions,
  getAccountInfo,
  isSimulationMode,
  getMasterMetaApiAccountId,
  getMasterLogin,
} from "./metaapi";
import {
  evaluateEntry,
  evaluateHighFrequencyEntry,
  pickNewClosedCandle,
  checkExit,
  calculateProfitPips,
  PIP_VALUE_XAUUSD,
  evaluateTrailingEntry,
  evaluateTrailingExit,
  detectPipValue,
  type Candle,
  type TrailingConfig,
} from "./strategy";
import { sendMessage } from "./telegram";

type ActiveSession = {
  sessionToken: string;       // public token (used by API)
  internalId: string;         // MT5Session.id (used as FK)
  mt5Login: string;
  symbol: string;             // fallback symbol (used when autoPairScan is off)
  timeframe: string;
  highFrequencyMode: boolean;
  // Trailing-engine runtime state:
  trailingAtr: number | null;   // last ATR for the open trailing position
  scanInterval: NodeJS.Timeout | null; // separate (slower) scan loop for pair selection
  interval: NodeJS.Timeout;
  currentPosition: {
    tradeId: string;
    positionId: string;
    direction: "BUY" | "SELL";
    openPrice: number;
    tpPrice: number | null;
    slPrice: number | null;     // current live trailing SL (moves over time)
    initialSl: number | null;   // original SL at entry (for diagnostics)
    atr: number | null;         // ATR captured at entry (drives trailing distance)
    wickTip: number | null;
    openedAt: string;
    symbol: string;             // the actual symbol the trade was opened on
  } | null;
};

const activeSessions = new Map<string, ActiveSession>();

/**
 * Send a Telegram notification to the admin chat about a trade event.
 * Best-effort: failures are logged but never throw.
 */
async function notifyTrade(
  event: "OPEN" | "CLOSE" | "TRAIL" | "ERROR" | "SCAN",
  ctx: ActiveSession,
  details: {
    direction?: "BUY" | "SELL";
    symbol?: string;
    openPrice?: number | null;
    exitPrice?: number | null;
    profitPips?: number | null;
    profitUsd?: number | null;
    reason?: string;
    errorMessage?: string;
    lotSize?: number;
    newSl?: number | null;
    score?: number | null;
  }
): Promise<void> {
  try {
    const adminIds = (process.env.TELEGRAM_ADMIN_IDS || "")
      .split(/[,\s]+/)
      .filter(Boolean);
    if (adminIds.length === 0) return;

    const emoji =
      event === "OPEN" ? "🟢" :
      event === "CLOSE" ? (details.profitPips != null && details.profitPips >= 0 ? "✅" : "🔴") :
      event === "TRAIL" ? "↗️" :
      event === "SCAN" ? "🔍" :
      "⚠️";

    const labels: Record<string, string> = {
      OPEN: "صفقة جديدة",
      CLOSE: "إغلاق صفقة",
      TRAIL: "تحديث وقف متحرك",
      SCAN: "اختيار زوج",
      ERROR: "خطأ في صفقة",
    };

    const lines: string[] = [];
    lines.push(`${emoji} <b>${labels[event]}</b>`);
    lines.push("");
    if (details.direction) lines.push(`النوع: <b>${details.direction === "BUY" ? "شراء BUY" : "بيع SELL"}</b>`);
    if (details.symbol) lines.push(`الزوج: <code>${details.symbol}</code>`);
    if (details.lotSize) lines.push(`حجم اللوت: <code>${details.lotSize}</code>`);
    if (details.openPrice != null) lines.push(`سعر الدخول: <code>${details.openPrice.toFixed(4)}</code>`);
    if (details.exitPrice != null) lines.push(`سعر الخروج: <code>${details.exitPrice.toFixed(4)}</code>`);
    if (details.newSl != null) lines.push(`وقف متحرك جديد: <code>${details.newSl.toFixed(4)}</code>`);
    if (details.score != null) lines.push(`قوة الإشارة: <code>${details.score.toFixed(2)}</code>`);
    if (details.profitPips != null) {
      const sign = details.profitPips >= 0 ? "+" : "";
      lines.push(`النقاط: <b>${sign}${details.profitPips.toFixed(1)} pip</b>`);
    }
    if (details.profitUsd != null) {
      const sign = details.profitUsd >= 0 ? "+" : "";
      lines.push(`الربح: <b>${sign}$${details.profitUsd.toFixed(2)}</b>`);
    }
    if (details.reason) lines.push(`السبب: ${details.reason}`);
    if (details.errorMessage) lines.push(`الخطأ: <code>${details.errorMessage.slice(0, 120)}</code>`);
    lines.push("");
    lines.push(`حساب MT5: <code>${ctx.mt5Login}</code>`);

    const text = lines.join("\n");

    for (const id of adminIds) {
      await sendMessage({
        chat_id: id,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });
    }
  } catch (e: any) {
    console.warn(`[notifyTrade] failed:`, e?.message || e);
  }
}

export function isBotRunning(sessionToken: string): boolean {
  return activeSessions.has(sessionToken);
}

export function getActiveSessionCount(): number {
  return activeSessions.size;
}

export function listActiveSessions(): Array<{
  sessionToken: string;
  mt5Login: string;
  symbol: string;
  timeframe: string;
  highFrequencyMode: boolean;
  hasOpenPosition: boolean;
  strategyType: string;
  openSymbol?: string;
}> {
  return Array.from(activeSessions.values()).map((s) => ({
    sessionToken: s.sessionToken,
    mt5Login: s.mt5Login,
    symbol: s.symbol,
    timeframe: s.timeframe,
    highFrequencyMode: s.highFrequencyMode,
    hasOpenPosition: !!s.currentPosition,
    strategyType: "trailing", // runner is now trailing-first
    openSymbol: s.currentPosition?.symbol,
  }));
}

export async function startBot(sessionToken: string): Promise<{ ok: boolean; error?: string }> {
  if (activeSessions.has(sessionToken)) {
    return { ok: true };
  }
  const session = await getSessionByToken(sessionToken);
  if (!session) return { ok: false, error: "session not found" };
  const internalId = session.id;
  const cfg = await db.botConfig.findUnique({ where: { sessionId: internalId } });
  if (!cfg) return { ok: false, error: "bot config not found" };

  // Warm up the master account (market-data source) on first bot start.
  if (!isSimulationMode()) {
    const masterLogin = getMasterLogin();
    if (masterLogin) {
      const masterId = await getMasterMetaApiAccountId();
      if (masterId) {
        console.log(`[BotRunner] Master account warmed up: login=${masterLogin} id=${masterId}`);
      } else {
        console.warn(
          `[BotRunner] Master account ${masterLogin} could not be resolved. ` +
            `Market data will fall back to first cached account or simulation.`
        );
      }
    }
  }

  await db.botConfig.update({
    where: { sessionId: internalId },
    data: { botRunning: true, botStartedAt: new Date() },
  });

  const ctx: ActiveSession = {
    sessionToken,
    internalId,
    mt5Login: session.mt5Login,
    symbol: cfg.symbol,
    timeframe: cfg.timeframe,
    highFrequencyMode: cfg.highFrequencyMode,
    trailingAtr: null,
    scanInterval: null,
    interval: null as any,
    currentPosition: null,
  };

  // Tick faster in HF mode so the trailing stop reacts within ~500ms.
  const tickMs = cfg.highFrequencyMode ? 500 : 1000;
  ctx.interval = setInterval(async () => {
    try {
      await tickOnce(ctx);
    } catch (e) {
      console.error(`[bot:${sessionToken}] tick error:`, e);
    }
  }, tickMs);

  activeSessions.set(sessionToken, ctx);
  console.log(
    `[bot:${sessionToken}] started (strategy=trailing, mode=${isSimulationMode() ? "SIM" : "LIVE"}, ` +
    `hf=${cfg.highFrequencyMode ? "ON" : "OFF"}, tick=${tickMs}ms, autoScan=${cfg.autoPairScan})`
  );
  return { ok: true };
}

export async function stopBot(sessionToken: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = activeSessions.get(sessionToken);
  if (!ctx) {
    await db.botConfig.updateMany({
      where: { botRunning: true },
      data: { botRunning: false },
    });
    return { ok: true };
  }
  clearInterval(ctx.interval);
  if (ctx.scanInterval) clearInterval(ctx.scanInterval);

  if (ctx.currentPosition) {
    const cp = ctx.currentPosition;
    await closePosition(ctx.mt5Login, cp.positionId);
    const price = await getCurrentPrice(cp.symbol, ctx.mt5Login);
    if (price) {
      const exitPrice = cp.direction === "BUY" ? price.bid : price.ask;
      const pipValue = detectPipValue(exitPrice);
      const profitPips = (cp.direction === "BUY"
        ? exitPrice - cp.openPrice
        : cp.openPrice - exitPrice) / pipValue;
      await db.trade.update({
        where: { id: cp.tradeId },
        data: {
          status: "CLOSED_MANUAL",
          exitPrice,
          profitPips,
          profitUsd: profitPips * (0.01 * 100), // approx for non-gold pairs
          closedAt: new Date(),
          durationSeconds: Math.round(
            (Date.now() - new Date(cp.openedAt).getTime()) / 1000
          ),
        },
      });
      await notifyTrade("CLOSE", ctx, {
        direction: cp.direction,
        symbol: cp.symbol,
        lotSize: 0.01,
        openPrice: cp.openPrice,
        exitPrice,
        profitPips,
        profitUsd: profitPips * (0.01 * 100),
        reason: "MANUAL_STOP",
      });
    }
    ctx.currentPosition = null;
  }

  await db.botConfig.update({
    where: { sessionId: ctx.internalId },
    data: { botRunning: false },
  });
  activeSessions.delete(sessionToken);
  console.log(`[bot:${sessionToken}] stopped`);
  return { ok: true };
}

/**
 * Pick the trailing config from the BotConfig row.
 */
function buildTrailingConfig(cfg: any): TrailingConfig {
  return {
    atrPeriod: cfg.atrPeriod ?? 14,
    atrMultiplier: cfg.atrMultiplier ?? 1.5,
    emaFast: cfg.emaFast ?? 9,
    emaSlow: cfg.emaSlow ?? 21,
    minAtrPrice: cfg.minAtrPrice ?? 0.1,
    maxSpreadPips: cfg.maxSpreadPips ?? 3,
    breakevenAtr: cfg.breakevenAtr ?? 0.8,
    maxTradeMinutes: cfg.maxTradeMinutes ?? 30,
    lotSize: cfg.lotSize ?? 0.01,
  };
}

/**
 * Scan candidate symbols in parallel and return the strongest BUY/SELL signal.
 * Returns null if no symbol passes the volatility / spread / trend filters.
 */
async function scanBestTrailingOpportunity(
  ctx: ActiveSession,
  cfg: any
): Promise<{ symbol: string; signal: ReturnType<typeof evaluateTrailingEntry> } | null> {
  const symbols: string[] = cfg.autoPairScan
    ? (cfg.scanSymbols || "XAUUSD,EURUSD,GBPUSD,USDJPY,AUDUSD,USDCAD,XAGUSD")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean)
    : [cfg.symbol];

  // Fetch candles + tick for every candidate in parallel.
  const results = await Promise.all(
    symbols.map(async (sym) => {
      try {
        const [candles, tick] = await Promise.all([
          getCandles(sym, cfg.timeframe, 50, ctx.mt5Login),
          getCurrentPrice(sym, ctx.mt5Login),
        ]);
        if (!candles.length || !tick) return null;
        const tcfg = buildTrailingConfig(cfg);
        const signal = evaluateTrailingEntry(
          sym,
          candles,
          tick.bid,
          tick.ask,
          tcfg
        );
        return { symbol: sym, signal };
      } catch {
        return null;
      }
    })
  );

  // Pick the highest-scoring actionable signal.
  const actionable = results
    .filter((r): r is { symbol: string; signal: any } => !!r && r.signal.action !== "HOLD")
    .sort((a, b) => Math.abs(b.signal.score) - Math.abs(a.signal.score));

  if (actionable.length === 0) return null;
  return actionable[0];
}

async function tickOnce(ctx: ActiveSession) {
  const cfg = await db.botConfig.findUnique({ where: { sessionId: ctx.internalId } });
  if (!cfg || !cfg.botRunning) {
    await stopBot(ctx.sessionToken);
    return;
  }
  // Sync runtime config changes:
  if (cfg.symbol !== ctx.symbol || cfg.timeframe !== ctx.timeframe) {
    ctx.symbol = cfg.symbol;
    ctx.timeframe = cfg.timeframe;
    ctx.currentPosition = null;
  }
  ctx.highFrequencyMode = cfg.highFrequencyMode;

  // ============================================================
  //  TRAILING STRATEGY (default path)
  // ============================================================
  if ((cfg.strategyType || "trailing") === "trailing") {
    return tickTrailing(ctx, cfg);
  }

  // ============================================================
  //  LEGACY WICK STRATEGY (kept for backward compatibility)
  // ============================================================
  return tickWick(ctx, cfg);
}

/**
 * Trailing-strategy tick: manage open position OR scan for new entry.
 */
async function tickTrailing(ctx: ActiveSession, cfg: any) {
  // 1) If we have an open position, manage it (trailing stop).
  if (ctx.currentPosition) {
    const cp = ctx.currentPosition;
    const price = await getCurrentPrice(cp.symbol, ctx.mt5Login);
    if (!price) return;

    // Refresh ATR occasionally so the trailing distance adapts to volatility.
    let atr = cp.atr;
    if (atr == null || Math.random() < 0.1) {
      const candles = await getCandles(cp.symbol, ctx.timeframe, 50, ctx.mt5Login);
      const tcfg = buildTrailingConfig(cfg);
      const fresh = await import("./strategy").then((m) => m.computeATR(candles, tcfg.atrPeriod));
      if (fresh && fresh > 0) {
        atr = fresh;
        cp.atr = fresh;
        ctx.trailingAtr = fresh;
      }
    }

    const tcfg = buildTrailingConfig(cfg);
    const decision = evaluateTrailingExit(
      {
        direction: cp.direction,
        openPrice: cp.openPrice,
        currentStopLoss: cp.slPrice ?? cp.initialSl ?? 0,
        atr: atr ?? 0.1,
        openedAt: cp.openedAt,
      },
      price.bid,
      price.ask,
      tcfg
    );

    if (decision.exit) {
      // Close at broker.
      await closePosition(ctx.mt5Login, cp.positionId);
      const exitPrice =
        decision.exitPrice ?? (cp.direction === "BUY" ? price.bid : price.ask);
      const pipValue = detectPipValue(exitPrice);
      const profitPips =
        (cp.direction === "BUY"
          ? exitPrice - cp.openPrice
          : cp.openPrice - exitPrice) / pipValue;
      // Approximate USD profit (uses 0.01 lot × 100 multiplier — good enough
      // for notification; the DB stores the precise number for gold pairs).
      const profitUsd = profitPips * (cfg.lotSize * 100);
      const status =
        decision.reason === "SL_HIT"
          ? "CLOSED_SL"
          : decision.reason === "TIME"
          ? "CLOSED_TIME"
          : "CLOSED_MANUAL";
      await db.trade.update({
        where: { id: cp.tradeId },
        data: {
          status,
          exitPrice,
          profitPips,
          profitUsd,
          slPrice: cp.slPrice ?? cp.initialSl,
          closedAt: new Date(),
          durationSeconds: Math.round(
            (Date.now() - new Date(cp.openedAt).getTime()) / 1000
          ),
        },
      });
      ctx.currentPosition = null;
      await notifyTrade("CLOSE", ctx, {
        direction: cp.direction,
        symbol: cp.symbol,
        lotSize: cfg.lotSize,
        openPrice: cp.openPrice,
        exitPrice,
        profitPips,
        profitUsd,
        reason: decision.reason ?? "TRAILING",
      });
      return;
    }

    // Move the trailing SL upward (BUY) / downward (SELL).
    if (decision.newStopLoss != null) {
      const prevSl = cp.slPrice ?? cp.initialSl;
      cp.slPrice = decision.newStopLoss;
      // Persist the new SL on the trade row (best-effort).
      try {
        await db.trade.update({
          where: { id: cp.tradeId },
          data: { slPrice: decision.newStopLoss },
        });
      } catch {
        /* ignore */
      }
      // Only notify when the move is meaningful (>= 0.1 pip).
      if (prevSl == null || Math.abs(decision.newStopLoss - prevSl) > 0.0001) {
        await notifyTrade("TRAIL", ctx, {
          direction: cp.direction,
          symbol: cp.symbol,
          lotSize: cfg.lotSize,
          openPrice: cp.openPrice,
          newSl: decision.newStopLoss,
          reason: `Trail update: ${prevSl?.toFixed(4) ?? "—"} → ${decision.newStopLoss.toFixed(4)}`,
        });
      }
    }
    return;
  }

  // 2) No open position — scan for the best entry opportunity.
  //    Throttle scans to once every ~3 seconds to avoid hammering the API.
  const now = Date.now();
  const lastScanTs = (ctx as any)._lastScanTs || 0;
  if (now - lastScanTs < 3000) return;
  (ctx as any)._lastScanTs = now;

  const best = await scanBestTrailingOpportunity(ctx, cfg);
  if (!best) {
    // No actionable signal — log occasionally (every ~30s).
    if (Math.random() < 0.05) {
      console.log(`[bot:${ctx.sessionToken}] scan: no actionable signal this tick`);
    }
    return;
  }
  await executeTrailingEntry(ctx, cfg, best.signal);
}

/**
 * Open a trailing-strategy trade.
 */
async function executeTrailingEntry(
  ctx: ActiveSession,
  cfg: any,
  signal: ReturnType<typeof evaluateTrailingEntry>
) {
  if (signal.action === "HOLD" || signal.entryPrice == null || signal.stopLoss == null) {
    return;
  }
  const sym = signal.symbol;
  const direction = signal.action;
  const entry = signal.entryPrice;
  const sl = signal.stopLoss;
  const atr = signal.atr ?? 0.1;

  // Persist the scan winner for UI / debugging.
  await db.botConfig.update({
    where: { sessionId: ctx.internalId },
    data: { lastScanWinner: sym },
  });

  const order = await createMarketOrder(
    ctx.mt5Login,
    sym,
    direction,
    cfg.lotSize,
    sl,         // initial stop loss
    undefined   // no take profit — trailing engine handles exit
  );

  if (!order.ok) {
    await db.trade.create({
      data: {
        sessionId: ctx.internalId,
        symbol: sym,
        direction,
        lotSize: cfg.lotSize,
        entryPrice: entry,
        tpPips: 0,
        slPips: 0,
        tpPrice: null,
        slPrice: sl,
        wickPrice: null,
        status: "ERROR",
        errorMessage: order.error || "order failed",
      },
    });
    await notifyTrade("ERROR", ctx, {
      direction,
      symbol: sym,
      lotSize: cfg.lotSize,
      openPrice: entry,
      errorMessage: order.error || "order failed",
    });
    return;
  }

  const trade = await db.trade.create({
    data: {
      sessionId: ctx.internalId,
      symbol: sym,
      direction,
      lotSize: cfg.lotSize,
      entryPrice: entry,
      tpPips: 0,
      slPips: 0,
      tpPrice: null,
      slPrice: sl,
      wickPrice: null,
      status: "OPEN",
    },
  });

  ctx.currentPosition = {
    tradeId: trade.id,
    positionId: order.orderId!,
    direction,
    openPrice: entry,
    tpPrice: null,
    slPrice: sl,
    initialSl: sl,
    atr,
    wickTip: null,
    openedAt: new Date().toISOString(),
    symbol: sym,
  };

  console.log(
    `[bot:${ctx.sessionToken}] OPEN ${direction} ${sym} @ ${entry.toFixed(4)} ` +
    `SL=${sl.toFixed(4)} ATR=${atr.toFixed(4)} score=${signal.score.toFixed(2)} reason="${signal.reason}"`
  );

  await notifyTrade("OPEN", ctx, {
    direction,
    symbol: sym,
    lotSize: cfg.lotSize,
    openPrice: entry,
    score: signal.score,
    reason: signal.reason,
  });
}

/**
 * Legacy Wick-strategy tick (kept for backward compatibility — used only
 * when `strategyType === "wick"`).
 */
async function tickWick(ctx: ActiveSession, cfg: any) {
  const candles: Candle[] = await getCandles(cfg.symbol, cfg.timeframe, 30, ctx.mt5Login);
  const price = await getCurrentPrice(cfg.symbol, ctx.mt5Login);
  if (!candles.length || !price) return;

  // 1) Manage open position first.
  if (ctx.currentPosition) {
    const cp = ctx.currentPosition;
    const exit = checkExit(
      {
        direction: cp.direction,
        openPrice: cp.openPrice,
        tpPrice: cfg.autoTpSl ? cp.tpPrice : null,
        slPrice: cfg.autoTpSl ? cp.slPrice : null,
        openedAt: cp.openedAt,
      },
      price.bid,
      price.ask,
      cfg.timeExitMinutes
    );
    if (exit.exit) {
      await closePosition(ctx.mt5Login, cp.positionId);
      const exitPrice =
        exit.exitPrice ?? (cp.direction === "BUY" ? price.bid : price.ask);
      const profitPips = calculateProfitPips(cp.direction, cp.openPrice, exitPrice);
      const status =
        exit.reason === "TP" ? "CLOSED_TP"
        : exit.reason === "SL" ? "CLOSED_SL"
        : exit.reason === "TIME" ? "CLOSED_TIME"
        : "CLOSED_MANUAL";
      await db.trade.update({
        where: { id: cp.tradeId },
        data: {
          status,
          exitPrice,
          profitPips,
          profitUsd: profitPips * (cfg.lotSize * 100),
          closedAt: new Date(),
          durationSeconds: Math.round(
            (Date.now() - new Date(cp.openedAt).getTime()) / 1000
          ),
        },
      });
      ctx.currentPosition = null;
      await notifyTrade("CLOSE", ctx, {
        direction: cp.direction,
        symbol: cfg.symbol,
        lotSize: cfg.lotSize,
        openPrice: cp.openPrice,
        exitPrice,
        profitPips,
        profitUsd: profitPips * (cfg.lotSize * 100),
        reason: exit.reason ?? "WICK",
      });
    }
    return;
  }

  // 2) Look for a new entry signal.
  if (cfg.highFrequencyMode) {
    const closedCandle = pickNewClosedCandle(candles, cfg.lastHfCandleTime);
    if (!closedCandle) return;
    const hfSignal = evaluateHighFrequencyEntry(closedCandle, price.bid, price.ask, {
      minWickRatio: cfg.minWickRatio,
      tpPips: cfg.tpPips,
      slPips: cfg.slPips,
      maxSpreadPips: cfg.maxSpreadPips,
      pipValue: PIP_VALUE_XAUUSD,
    });
    await db.botConfig.update({
      where: { sessionId: ctx.internalId },
      data: { lastHfCandleTime: closedCandle.time },
    });
    if (hfSignal.action === "HOLD") return;
    await executeWickEntry(ctx, cfg, {
      action: hfSignal.action,
      reason: hfSignal.reason,
      wickTip: hfSignal.wickTip,
      entryPrice: hfSignal.entryPrice,
      tpPrice: hfSignal.tpPrice,
      slPrice: hfSignal.slPrice,
    });
    return;
  }
  const signal = evaluateEntry(candles, price.bid, price.ask, {
    minWickRatio: cfg.minWickRatio,
    tpPips: cfg.tpPips,
    slPips: cfg.slPips,
    maxSpreadPips: cfg.maxSpreadPips,
    pipValue: PIP_VALUE_XAUUSD,
  });
  if (signal.action === "HOLD") return;
  await executeWickEntry(ctx, cfg, {
    action: signal.action as "BUY" | "SELL",
    reason: signal.reason,
    wickTip: signal.wickTip,
    entryPrice: signal.entryPrice,
    tpPrice: signal.tpPrice,
    slPrice: signal.slPrice,
  });
}

async function executeWickEntry(
  ctx: ActiveSession,
  cfg: any,
  signal: {
    action: "BUY" | "SELL";
    reason: string;
    wickTip: number | null;
    entryPrice: number | null;
    tpPrice: number | null;
    slPrice: number | null;
  }
) {
  const order = await createMarketOrder(
    ctx.mt5Login,
    cfg.symbol,
    signal.action,
    cfg.lotSize,
    cfg.autoTpSl ? signal.slPrice ?? undefined : undefined,
    cfg.autoTpSl ? signal.tpPrice ?? undefined : undefined
  );
  if (!order.ok) {
    await db.trade.create({
      data: {
        sessionId: ctx.internalId,
        symbol: cfg.symbol,
        direction: signal.action,
        lotSize: cfg.lotSize,
        entryPrice: signal.entryPrice ?? 0,
        tpPips: cfg.tpPips,
        slPips: cfg.slPips,
        tpPrice: signal.tpPrice,
        slPrice: signal.slPrice,
        wickPrice: signal.wickTip,
        status: "ERROR",
        errorMessage: order.error || "order failed",
      },
    });
    await notifyTrade("ERROR", ctx, {
      direction: signal.action,
      symbol: cfg.symbol,
      lotSize: cfg.lotSize,
      openPrice: signal.entryPrice,
      errorMessage: order.error || "order failed",
    });
    return;
  }
  const trade = await db.trade.create({
    data: {
      sessionId: ctx.internalId,
      symbol: cfg.symbol,
      direction: signal.action,
      lotSize: cfg.lotSize,
      entryPrice: signal.entryPrice ?? 0,
      tpPips: cfg.tpPips,
      slPips: cfg.slPips,
      tpPrice: signal.tpPrice,
      slPrice: signal.slPrice,
      wickPrice: signal.wickTip,
      status: "OPEN",
    },
  });
  ctx.currentPosition = {
    tradeId: trade.id,
    positionId: order.orderId!,
    direction: signal.action,
    openPrice: signal.entryPrice!,
    tpPrice: signal.tpPrice,
    slPrice: signal.slPrice,
    initialSl: signal.slPrice,
    atr: null,
    wickTip: signal.wickTip,
    openedAt: new Date().toISOString(),
    symbol: cfg.symbol,
  };
  console.log(
    `[bot:${ctx.sessionToken}] OPEN ${signal.action} ${cfg.symbol} @ ${signal.entryPrice} ` +
    `TP=${signal.tpPrice} SL=${signal.slPrice} reason="${signal.reason}"`
  );
  await notifyTrade("OPEN", ctx, {
    direction: signal.action,
    symbol: cfg.symbol,
    lotSize: cfg.lotSize,
    openPrice: signal.entryPrice,
    reason: signal.reason,
  });
}

/** Periodically sync open positions from the broker (catch-up safety net). */
export async function reconcilePositions() {
  for (const [, ctx] of activeSessions) {
    try {
      const positions = await getOpenPositions(ctx.mt5Login);
      if (positions.length === 0 && ctx.currentPosition) {
        const cp = ctx.currentPosition;
        const price = await getCurrentPrice(cp.symbol, ctx.mt5Login);
        const exitPrice = price
          ? cp.direction === "BUY"
            ? price.bid
            : price.ask
          : cp.openPrice;
        const pipValue = detectPipValue(exitPrice);
        const profitPips =
          (cp.direction === "BUY"
            ? exitPrice - cp.openPrice
            : cp.openPrice - exitPrice) / pipValue;
        await db.trade.update({
          where: { id: cp.tradeId },
          data: {
            status: "CLOSED_MANUAL",
            exitPrice,
            profitPips,
            profitUsd: profitPips * (0.01 * 100),
            closedAt: new Date(),
            durationSeconds: Math.round(
              (Date.now() - new Date(cp.openedAt).getTime()) / 1000
            ),
          },
        });
        ctx.currentPosition = null;
      }
    } catch {
      // ignore
    }
  }
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    reconcilePositions().catch(() => {});
  }, 30_000);
}
