/**
 * ALFA Reports — Bot Runner (Simplified High-Frequency Trailing)
 *
 * Manages the live trading loop for each active session. The runner is an
 * in-process singleton: one setInterval per session, ticking every 1000ms
 * (or 500ms when high-frequency mode is on).
 *
 * =====================================================================
 *  STRATEGY (simplified — only ONE mode)
 * =====================================================================
 *
 * HIGH-FREQUENCY TRAILING STRATEGY
 *
 * Each tick the bot:
 *   1. Refreshes its list of currently-open positions from the broker
 *      (reconcile against in-memory state).
 *   2. Closes any open trade whose elapsed time >= timeExitMinutes (1 minute
 *      by default) — the hard time-stop.
 *   3. Trails each open trade's stop-loss upward (BUY) / downward (SELL)
 *      using an ATR-based trailing distance.
 *   4. If the number of open positions is below `maxOpenPositions` (3 by
 *      default) AND a NEW closed M1 candle is available that wasn't yet
 *      traded on AND price touched that candle's tail (wick), evaluate an
 *      entry:
 *        - Trend direction is computed on the 1-minute timeframe using
 *          EMA(9) vs EMA(21). If they disagree with the user-selected
 *          direction, the entry is skipped ("filter out against-trend
 *          trades").
 *        - If `tradeDirection` is "BUY" or "SELL" (user override), only
 *          that direction is allowed.
 *        - If `tradeDirection` is "AUTO", direction follows the trend.
 *   5. On any closed trade, the bot updates `lastLossStreak`:
 *        - Win  → reset to 0
 *        - Loss → increment by 1
 *      When `lastLossStreak >= maxLossStreak` (5 by default), the bot
 *      auto-stops itself and emits the Telegram message
 *      "السوق غير مستقر الآن".
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
  isSimulationMode,
  getMasterMetaApiAccountId,
  getMasterLogin,
  ensureAccountCached,
} from "./metaapi";
import {
  evaluateTrailingExit,
  computeATR,
  computeEMA,
  detectPipValue,
  pickNewClosedCandle,
  detectWick,
  type Candle,
  type TrailingConfig,
} from "./strategy";
import { sendMessage } from "./telegram";

type OpenTrade = {
  tradeId: string;
  positionId: string;
  direction: "BUY" | "SELL";
  openPrice: number;
  slPrice: number | null;     // current live trailing SL (moves over time)
  initialSl: number | null;   // original SL at entry (for diagnostics)
  atr: number | null;         // ATR captured at entry
  openedAt: string;           // ISO time
  symbol: string;
};

type ActiveSession = {
  sessionToken: string;
  internalId: string;
  mt5Login: string;
  metaApiAccountId?: string;
  symbol: string;
  timeframe: string;
  highFrequencyMode: boolean;
  interval: NodeJS.Timeout;
  openPositions: OpenTrade[];
};

const activeSessions = new Map<string, ActiveSession>();

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Send a Telegram notification to the admin chat about a trade event.
 * Best-effort: failures are logged but never throw.
 */
async function notifyTrade(
  kind: "OPEN" | "CLOSE" | "TRAIL" | "ERROR",
  ctx: ActiveSession,
  data: {
    direction: "BUY" | "SELL";
    symbol: string;
    lotSize: number;
    openPrice?: number | null;
    exitPrice?: number | null;
    newSl?: number | null;
    profitPips?: number | null;
    profitUsd?: number | null;
    reason?: string | null;
    errorMessage?: string | null;
  }
) {
  try {
    const adminChatId = getAdminChatId();
    if (!adminChatId) return;
    const arrow = data.direction === "BUY" ? "📈" : "📉";
    let text: string;
    if (kind === "OPEN") {
      text =
        `${arrow} <b>صفقة جديدة</b>\n` +
        `النوع: <b>${data.direction === "BUY" ? "شراء" : "بيع"}</b>\n` +
        `الزوج: <code>${escapeHtml(data.symbol)}</code>\n` +
        `الحجم: <code>${data.lotSize}</code> لوت\n` +
        `سعر الدخول: <code>${data.openPrice?.toFixed(4) ?? "—"}</code>\n` +
        (data.reason ? `السبب: ${escapeHtml(data.reason)}` : "");
    } else if (kind === "CLOSE") {
      const profitEmoji =
        (data.profitPips ?? 0) > 0
          ? "✅"
          : (data.profitPips ?? 0) < 0
          ? "❌"
          : "➖";
      text =
        `${profitEmoji} <b>إغلاق صفقة</b>\n` +
        `النوع: <b>${data.direction === "BUY" ? "شراء" : "بيع"}</b>\n` +
        `الزوج: <code>${escapeHtml(data.symbol)}</code>\n` +
        `سعر الدخول: <code>${data.openPrice?.toFixed(4) ?? "—"}</code>\n` +
        `سعر الخروج: <code>${data.exitPrice?.toFixed(4) ?? "—"}</code>\n` +
        `النتيجة: <code>${(data.profitPips ?? 0).toFixed(1)} pip</code> ` +
        `(<code>${(data.profitUsd ?? 0).toFixed(2)} USD</code>)\n` +
        `السبب: ${escapeHtml(data.reason ?? "—")}`;
    } else if (kind === "TRAIL") {
      text =
        `🔄 <b>تحديث التريلينغ</b>\n` +
        `الزوج: <code>${escapeHtml(data.symbol)}</code> (${data.direction})\n` +
        `SL جديد: <code>${data.newSl?.toFixed(4) ?? "—"}</code>`;
    } else {
      text =
        `⚠️ <b>خطأ في صفقة</b>\n` +
        `النوع: ${data.direction}\n` +
        `الزوج: <code>${escapeHtml(data.symbol)}</code>\n` +
        `الخطأ: ${escapeHtml(data.errorMessage ?? "—")}`;
    }
    await sendMessage({ chat_id: adminChatId, text, parse_mode: "HTML" });
  } catch {
    /* silent */
  }
}

/** Return the first admin Telegram chat ID from env, or null. */
function getAdminChatId(): string | null {
  const raw = [process.env.TELEGRAM_ADMIN_IDS, process.env.ADMIN_TELEGRAM_ID]
    .filter(Boolean)
    .join(",");
  const ids = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return ids[0] ?? null;
}

/** Send a Telegram notification to the admin chat. */
async function notifyAdmin(text: string) {
  const adminChatId = getAdminChatId();
  if (!adminChatId) return;
  try {
    await sendMessage({ chat_id: adminChatId, text, parse_mode: "HTML" });
  } catch {
    /* silent */
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
  openCount: number;
  highFrequencyMode: boolean;
}> {
  return Array.from(activeSessions.values()).map((s) => ({
    sessionToken: s.sessionToken,
    mt5Login: s.mt5Login,
    symbol: s.symbol,
    timeframe: s.timeframe,
    openCount: s.openPositions.length,
    highFrequencyMode: s.highFrequencyMode,
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

  // CRITICAL: populate the in-memory accountCache from the DB-persisted
  // metaApiAccountId. After a container restart, accountCache is empty —
  // without this, every createMarketOrder / closePosition / getOpenPositions
  // call would fail with "Account not provisioned".
  if (session.metaApiAccountId) {
    ensureAccountCached(session.mt5Login, session.metaApiAccountId);
  }

  // Clear any prior instability-stop flag on a fresh manual start.
  await db.botConfig.update({
    where: { sessionId: internalId },
    data: { botRunning: true, botStartedAt: new Date(), instabilityStop: false },
  });

  const ctx: ActiveSession = {
    sessionToken,
    internalId,
    mt5Login: session.mt5Login,
    metaApiAccountId: session.metaApiAccountId || undefined,
    symbol: cfg.symbol,
    timeframe: cfg.timeframe,
    highFrequencyMode: cfg.highFrequencyMode,
    interval: null as any,
    openPositions: [],
  };

  // Tick every 1000ms — the strategy reacts to closed M1 candles, so we don't
  // need 500ms granularity. Keeps API usage low and CPU steady.
  const tickMs = 1000;
  ctx.interval = setInterval(async () => {
    try {
      await tickOnce(ctx);
    } catch (e) {
      console.error(`[bot:${sessionToken}] tick error:`, e);
    }
  }, tickMs);

  activeSessions.set(sessionToken, ctx);
  console.log(
    `[bot:${sessionToken}] started (mode=${isSimulationMode() ? "SIM" : "LIVE"}, ` +
    `symbol=${cfg.symbol}, hf=${cfg.highFrequencyMode ? "ON" : "OFF"}, ` +
    `dir=${cfg.tradeDirection}, maxOpen=${cfg.maxOpenPositions}, ` +
    `maxLoss=${cfg.maxLossStreak}, timeExit=${cfg.timeExitMinutes}min)`
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
  // Don't auto-close open positions on stop — let them expire by their
  // timeExitMinutes. This is safer than market-closing in a possibly
  // illiquid moment.
  activeSessions.delete(sessionToken);
  await db.botConfig.update({
    where: { sessionId: ctx.internalId },
    data: { botRunning: false },
  });
  console.log(`[bot:${sessionToken}] stopped (kept ${ctx.openPositions.length} open positions alive)`);
  return { ok: true };
}

// =========================================================================
//  TICK ENGINE
// =========================================================================

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
  }
  ctx.highFrequencyMode = cfg.highFrequencyMode;

  // 1) Reconcile in-memory openPositions against broker state.
  await reconcileOpenPositions(ctx, cfg);

  // 2) Manage each open position (trailing + hard time-stop).
  await manageOpenPositions(ctx, cfg);

  // 3) Instability-stop safety: 5 consecutive losses → auto-stop.
  if (cfg.instabilityStop) {
    console.warn(`[bot:${ctx.sessionToken}] instabilityStop flag is set — skipping new entries`);
    return;
  }

  // 4) HF entry logic: only when HF mode is on, only when under maxOpenPositions,
  //    only when a NEW closed candle exists and its wick was touched.
  if (!cfg.highFrequencyMode) return;
  if (ctx.openPositions.length >= cfg.maxOpenPositions) return;

  await evaluateHfEntry(ctx, cfg);
}

/**
 * Refresh ctx.openPositions from broker state. Closes any in-memory position
 * the broker no longer reports (manually closed by user or hit broker SL/TP).
 */
async function reconcileOpenPositions(ctx: ActiveSession, cfg: any) {
  const brokerPositions = await getOpenPositions(ctx.mt5Login, ctx.metaApiAccountId);

  // Find positions the broker no longer reports → they were closed externally.
  const stillOpenIds = new Set(brokerPositions.map((p) => p.id));
  const survived: OpenTrade[] = [];
  for (const op of ctx.openPositions) {
    if (stillOpenIds.has(op.positionId)) {
      survived.push(op);
    } else {
      // The broker closed it. Fetch the closing price to record a Trade row
      // update + update the loss-streak counter.
      await finalizeExternalClose(ctx, cfg, op);
    }
  }
  ctx.openPositions = survived;

  // Add any broker position we don't yet track (rare — e.g. bot restarted
  // mid-session). We don't add them to ctx.openPositions because we don't
  // have the original tradeId, but we DO count them toward the openPositions
  // limit so the bot doesn't pile on more.
  const knownIds = new Set(ctx.openPositions.map((p) => p.positionId));
  const externalCount = brokerPositions.filter((p) => !knownIds.has(p.id)).length;
  if (externalCount > 0) {
    // Pretend they're tracked so the bot doesn't over-trade.
    // (We use a synthetic OpenTrade so the time-stop + max-positions checks work.)
    for (const p of brokerPositions) {
      if (knownIds.has(p.id)) continue;
      ctx.openPositions.push({
        tradeId: "external-" + p.id,
        positionId: p.id,
        direction: p.direction as "BUY" | "SELL",
        openPrice: p.openPrice,
        slPrice: p.sl ?? null,
        initialSl: p.sl ?? null,
        atr: null,
        openedAt: p.openTime || new Date().toISOString(),
        symbol: p.symbol,
      });
    }
  }
}

/**
 * Manage each open position: trailing-stop update + hard time-stop close.
 */
async function manageOpenPositions(ctx: ActiveSession, cfg: any) {
  const tcfg = buildTrailingConfig(cfg);
  const now = Date.now();

  // Iterate over a snapshot so we can mutate ctx.openPositions during the loop.
  const snapshot = [...ctx.openPositions];
  for (const op of snapshot) {
    const elapsedMs = now - new Date(op.openedAt).getTime();
    const elapsedMin = elapsedMs / 60_000;

    // Hard time-stop: close the trade when timeExitMinutes is reached.
    if (elapsedMin >= cfg.timeExitMinutes) {
      await closeTradeRow(ctx, cfg, op, "TIME");
      continue;
    }

    // Otherwise — trail the SL.
    const price = await getCurrentPrice(op.symbol, ctx.mt5Login);
    if (!price) continue;

    // Refresh ATR occasionally.
    let atr = op.atr;
    if (atr == null || Math.random() < 0.1) {
      try {
        const candles = await getCandles(op.symbol, ctx.timeframe, 50, ctx.mt5Login);
        const fresh = computeATR(candles, tcfg.atrPeriod);
        if (fresh && fresh > 0) {
          atr = fresh;
          op.atr = fresh;
        }
      } catch {
        /* keep old ATR */
      }
    }
    if (atr == null) continue;

    const decision = evaluateTrailingExit(
      {
        direction: op.direction,
        openPrice: op.openPrice,
        currentStopLoss: op.slPrice ?? op.initialSl ?? 0,
        atr,
        openedAt: op.openedAt,
      },
      price.bid,
      price.ask,
      tcfg
    );

    if (decision.exit) {
      // SL hit — close at broker and record.
      await closeTradeRow(ctx, cfg, op, decision.reason === "SL_HIT" ? "SL" : "TIME", decision.exitPrice);
      continue;
    }

    // Move the trailing SL upward (BUY) / downward (SELL).
    if (decision.newStopLoss != null) {
      const prevSl = op.slPrice ?? op.initialSl;
      op.slPrice = decision.newStopLoss;
      try {
        await db.trade.update({
          where: { id: op.tradeId },
          data: { slPrice: decision.newStopLoss },
        });
      } catch {
        /* ignore — external positions have synthetic IDs */
      }
      if (prevSl == null || Math.abs(decision.newStopLoss - prevSl) > 0.0001) {
        await notifyTrade("TRAIL", ctx, {
          direction: op.direction,
          symbol: op.symbol,
          lotSize: cfg.lotSize,
          openPrice: op.openPrice,
          newSl: decision.newStopLoss,
          reason: `Trail: ${prevSl?.toFixed(4) ?? "—"} → ${decision.newStopLoss.toFixed(4)}`,
        });
      }
    }
  }
}

/**
 * Evaluate a HF entry on a freshly-closed M1 candle.
 *
 * Rules (per operator spec):
 *   - The candle must be NEW (not yet traded on).
 *   - Price must have touched the candle's tail (lower wick for BUY, upper
 *     wick for SELL). We use detectWick() — if no significant wick, fall
 *     back to momentum (close vs open).
 *   - Direction is computed from the 1-minute trend (EMA9 vs EMA21). If the
 *     trend direction disagrees with the user-selected direction, skip.
 *   - User override: tradeDirection=BUY → only BUY; SELL → only SELL; AUTO →
 *     follow the trend.
 *   - Spread filter: skip if current spread > maxSpreadPips.
 */
async function evaluateHfEntry(ctx: ActiveSession, cfg: any) {
  // Fetch 50 candles of the configured timeframe + the current tick.
  const candles: Candle[] = await getCandles(cfg.symbol, cfg.timeframe, 50, ctx.mt5Login);
  const price = await getCurrentPrice(cfg.symbol, ctx.mt5Login);
  if (!candles.length || !price) return;

  const closedCandle = pickNewClosedCandle(candles, cfg.lastHfCandleTime);
  if (!closedCandle) return;

  // Mark this candle as processed BEFORE evaluating — avoids duplicate
  // entries if the evaluation throws.
  await db.botConfig.update({
    where: { sessionId: ctx.internalId },
    data: { lastHfCandleTime: closedCandle.time },
  });

  const pipValue = detectPipValue(price.ask);
  const spreadPips = (price.ask - price.bid) / pipValue;
  if (spreadPips > cfg.maxSpreadPips) {
    console.log(
      `[bot:${ctx.sessionToken}] HF skip: spread ${spreadPips.toFixed(2)}p > max ${cfg.maxSpreadPips}p`
    );
    return;
  }

  // ---- Trend detection on the 1-minute timeframe ----
  // Compute EMA(9) + EMA(21) on the candle closes. The trend direction is
  // BUY when EMA9 > EMA21, SELL when EMA9 < EMA21. We require enough candles
  // for a clean EMA computation.
  const closes = candles.map((c) => c.close);
  const emaFast = computeEMA(closes, cfg.emaFast);
  const emaSlow = computeEMA(closes, cfg.emaSlow);
  if (emaFast == null || emaSlow == null) {
    console.log(`[bot:${ctx.sessionToken}] HF skip: EMA computation failed`);
    return;
  }
  const trendDir: "BUY" | "SELL" = emaFast > emaSlow ? "BUY" : "SELL";

  // ---- Wick-touch detection ----
  // We need the price to have touched the candle's tail. The candle is already
  // closed, so by definition price traversed [low, high] during that minute —
  // which means the low (lower wick) was touched and the high (upper wick)
  // was touched. So the wick-touch condition is always satisfied for a
  // closed candle. We DO check that the candle has a meaningful wick using
  // detectWick() — candles with no rejection wick are skipped to avoid
  // trading on momentum-only / flat candles.
  const wickSignal = detectWick(closedCandle, cfg.minWickRatio);
  const hasWick = wickSignal.type !== "NONE";

  // ---- Direction selection ----
  // User override takes precedence; otherwise follow the trend.
  let direction: "BUY" | "SELL";
  if (cfg.tradeDirection === "BUY") {
    direction = "BUY";
  } else if (cfg.tradeDirection === "SELL") {
    direction = "SELL";
  } else {
    // AUTO — follow the trend.
    direction = trendDir;
  }

  // ---- Sanity: if the candle's wick type disagrees with the chosen
  // direction AND we have a wick signal, skip (e.g. don't BUY when the
  // candle has a strong UPPER wick). This is the "tail touch aligned with
  // direction" filter.
  if (hasWick) {
    if (direction === "BUY" && wickSignal.type === "UPPER_WICK") {
      console.log(`[bot:${ctx.sessionToken}] HF skip: BUY vs upper-wick candle`);
      return;
    }
    if (direction === "SELL" && wickSignal.type === "LOWER_WICK") {
      console.log(`[bot:${ctx.sessionToken}] HF skip: SELL vs lower-wick candle`);
      return;
    }
  }

  // ---- Compute SL using ATR-based trailing distance ----
  const atr = computeATR(candles, cfg.atrPeriod);
  if (atr == null || atr <= 0) {
    console.log(`[bot:${ctx.sessionToken}] HF skip: ATR computation failed`);
    return;
  }
  if (atr < cfg.minAtrPrice) {
    console.log(
      `[bot:${ctx.sessionToken}] HF skip: ATR ${atr.toFixed(4)} < min ${cfg.minAtrPrice}`
    );
    return;
  }

  const stopDistance = cfg.atrMultiplier * atr;
  const entry = direction === "BUY" ? price.ask : price.bid;
  const sl = direction === "BUY" ? entry - stopDistance : entry + stopDistance;

  await executeEntry(ctx, cfg, {
    direction,
    symbol: cfg.symbol,
    entry,
    sl,
    atr,
    reason: `HF ${direction} — trend=${trendDir} (EMA9=${emaFast.toFixed(4)} ${trendDir === "BUY" ? ">" : "<"} EMA21=${emaSlow.toFixed(4)}), wick=${hasWick ? wickSignal.type : "none"}, ATR=${atr.toFixed(4)}`,
  });
}

async function executeEntry(
  ctx: ActiveSession,
  cfg: any,
  signal: {
    direction: "BUY" | "SELL";
    symbol: string;
    entry: number;
    sl: number;
    atr: number;
    reason: string;
  }
) {
  const order = await createMarketOrder(
    ctx.mt5Login,
    signal.symbol,
    signal.direction,
    cfg.lotSize,
    signal.sl,         // initial SL (trailing will move this)
    undefined,         // no TP — trailing engine handles exit
    ctx.metaApiAccountId
  );
  if (!order.ok) {
    await db.trade.create({
      data: {
        sessionId: ctx.internalId,
        symbol: signal.symbol,
        direction: signal.direction,
        lotSize: cfg.lotSize,
        entryPrice: signal.entry,
        tpPips: 0,
        slPips: 0,
        tpPrice: null,
        slPrice: signal.sl,
        wickPrice: null,
        status: "ERROR",
        errorMessage: order.error || "order failed",
      },
    });
    await notifyTrade("ERROR", ctx, {
      direction: signal.direction,
      symbol: signal.symbol,
      lotSize: cfg.lotSize,
      openPrice: signal.entry,
      errorMessage: order.error || "order failed",
    });
    return;
  }

  const trade = await db.trade.create({
    data: {
      sessionId: ctx.internalId,
      symbol: signal.symbol,
      direction: signal.direction,
      lotSize: cfg.lotSize,
      entryPrice: signal.entry,
      tpPips: 0,
      slPips: 0,
      tpPrice: null,
      slPrice: signal.sl,
      wickPrice: null,
      status: "OPEN",
    },
  });

  ctx.openPositions.push({
    tradeId: trade.id,
    positionId: order.orderId!,
    direction: signal.direction,
    openPrice: signal.entry,
    slPrice: signal.sl,
    initialSl: signal.sl,
    atr: signal.atr,
    openedAt: new Date().toISOString(),
    symbol: signal.symbol,
  });

  console.log(
    `[bot:${ctx.sessionToken}] OPEN ${signal.direction} ${signal.symbol} @ ${signal.entry.toFixed(4)} ` +
    `SL=${signal.sl.toFixed(4)} ATR=${signal.atr.toFixed(4)} reason="${signal.reason}"`
  );

  await notifyTrade("OPEN", ctx, {
    direction: signal.direction,
    symbol: signal.symbol,
    lotSize: cfg.lotSize,
    openPrice: signal.entry,
    reason: signal.reason,
  });
}

/**
 * Close a single open trade at the broker + record the Trade row update +
 * update the consecutive-loss streak.
 *
 * `reason` is one of: "TIME", "SL", "MANUAL".
 */
async function closeTradeRow(
  ctx: ActiveSession,
  cfg: any,
  op: OpenTrade,
  reason: "TIME" | "SL" | "MANUAL",
  forcedExitPrice?: number
) {
  // Close at broker (idempotent — if the position is already gone, this is
  // a no-op).
  await closePosition(ctx.mt5Login, op.positionId, ctx.metaApiAccountId);

  // Determine the exit price.
  let exitPrice = forcedExitPrice;
  if (exitPrice == null) {
    const price = await getCurrentPrice(op.symbol, ctx.mt5Login);
    exitPrice = price
      ? op.direction === "BUY"
        ? price.bid
        : price.ask
      : op.openPrice;
  }

  const pipValue = detectPipValue(exitPrice);
  const profitPips =
    (op.direction === "BUY"
      ? exitPrice - op.openPrice
      : op.openPrice - exitPrice) / pipValue;
  const profitUsd = profitPips * (cfg.lotSize * 100);

  const status =
    reason === "TIME" ? "CLOSED_TIME"
    : reason === "SL" ? "CLOSED_SL"
    : "CLOSED_MANUAL";

  // Best-effort trade row update (skip for external positions with synthetic IDs).
  if (!op.tradeId.startsWith("external-")) {
    try {
      await db.trade.update({
        where: { id: op.tradeId },
        data: {
          status,
          exitPrice,
          profitPips,
          profitUsd,
          slPrice: op.slPrice ?? op.initialSl,
          closedAt: new Date(),
          durationSeconds: Math.round(
            (Date.now() - new Date(op.openedAt).getTime()) / 1000
          ),
        },
      });
    } catch {
      /* ignore — trade row may already be updated */
    }
  }

  // Remove from in-memory list.
  ctx.openPositions = ctx.openPositions.filter((p) => p.positionId !== op.positionId);

  // ---- Update the loss streak ----
  let newStreak = cfg.lastLossStreak || 0;
  if (profitPips < 0) {
    newStreak += 1;
  } else if (profitPips > 0) {
    newStreak = 0;
  }
  // (profitPips === 0 → keep the streak unchanged; breakeven doesn't reset.)

  console.log(
    `[bot:${ctx.sessionToken}] CLOSE ${op.direction} ${op.symbol} ` +
    `@ ${exitPrice.toFixed(4)} profit=${profitPips.toFixed(1)}p reason=${reason} streak=${newStreak}/${cfg.maxLossStreak}`
  );

  await db.botConfig.update({
    where: { sessionId: ctx.internalId },
    data: { lastLossStreak: newStreak },
  });

  await notifyTrade("CLOSE", ctx, {
    direction: op.direction,
    symbol: op.symbol,
    lotSize: cfg.lotSize,
    openPrice: op.openPrice,
    exitPrice,
    profitPips,
    profitUsd,
    reason,
  });

  // ---- Instability-stop check ----
  if (newStreak >= cfg.maxLossStreak) {
    console.warn(
      `[bot:${ctx.sessionToken}] INSTABILITY STOP — ${newStreak} consecutive losses (>= ${cfg.maxLossStreak}). Auto-stopping bot.`
    );
    await db.botConfig.update({
      where: { sessionId: ctx.internalId },
      data: { instabilityStop: true, botRunning: false },
    });
    try {
      await notifyAdmin(
        `⚠️ <b>السوق غير مستقر الآن</b>\n\n` +
        `تم إيقاف البوت تلقائياً بعد ${newStreak} خسائر متتالية.\n` +
        `الحساب: <code>${ctx.mt5Login}</code>\n` +
        `الزوج: <code>${cfg.symbol}</code>\n\n` +
        `يمكنك إعادة تشغيل البوت يدوياً عندما تستقر ظروف السوق.`
      );
    } catch {
      /* silent */
    }
    await stopBot(ctx.sessionToken);
  }
}

/**
 * Finalize a position that the broker closed externally (manual close,
 * broker-side SL/TP hit, etc.). Records the closing data in the Trade row
 * and updates the loss streak.
 */
async function finalizeExternalClose(ctx: ActiveSession, cfg: any, op: OpenTrade) {
  // For external positions (synthetic IDs) we can't update a Trade row.
  if (op.tradeId.startsWith("external-")) return;

  const price = await getCurrentPrice(op.symbol, ctx.mt5Login);
  // If we can't get a price, we can't compute profit — leave the row as OPEN.
  // The next reconciliation pass will try again.
  if (!price) return;

  const exitPrice = op.direction === "BUY" ? price.bid : price.ask;
  const pipValue = detectPipValue(exitPrice);
  const profitPips =
    (op.direction === "BUY"
      ? exitPrice - op.openPrice
      : op.openPrice - exitPrice) / pipValue;
  const profitUsd = profitPips * (cfg.lotSize * 100);

  // Determine close reason from broker side: if the SL was hit, mark SL;
  // otherwise it's MANUAL.
  let reason: "SL" | "MANUAL" = "MANUAL";
  if (op.slPrice != null) {
    if (op.direction === "BUY" && exitPrice <= op.slPrice) reason = "SL";
    if (op.direction === "SELL" && exitPrice >= op.slPrice) reason = "SL";
  }
  const status = reason === "SL" ? "CLOSED_SL" : "CLOSED_MANUAL";

  try {
    await db.trade.update({
      where: { id: op.tradeId },
      data: {
        status,
        exitPrice,
        profitPips,
        profitUsd,
        closedAt: new Date(),
        durationSeconds: Math.round(
          (Date.now() - new Date(op.openedAt).getTime()) / 1000
        ),
      },
    });
  } catch {
    /* ignore */
  }

  // Update loss streak.
  let newStreak = cfg.lastLossStreak || 0;
  if (profitPips < 0) newStreak += 1;
  else if (profitPips > 0) newStreak = 0;

  await db.botConfig.update({
    where: { sessionId: ctx.internalId },
    data: { lastLossStreak: newStreak },
  });

  await notifyTrade("CLOSE", ctx, {
    direction: op.direction,
    symbol: op.symbol,
    lotSize: cfg.lotSize,
    openPrice: op.openPrice,
    exitPrice,
    profitPips,
    profitUsd,
    reason: reason === "SL" ? "SL (broker)" : "MANUAL (external)",
  });

  if (newStreak >= cfg.maxLossStreak) {
    console.warn(
      `[bot:${ctx.sessionToken}] INSTABILITY STOP — ${newStreak} consecutive losses (external close).`
    );
    await db.botConfig.update({
      where: { sessionId: ctx.internalId },
      data: { instabilityStop: true, botRunning: false },
    });
    try {
      await notifyAdmin(
        `⚠️ <b>السوق غير مستقر الآن</b>\n\n` +
        `تم إيقاف البوت تلقائياً بعد ${newStreak} خسائر متتالية.\n` +
        `الحساب: <code>${ctx.mt5Login}</code>\n` +
        `الزوج: <code>${cfg.symbol}</code>\n\n` +
        `يمكنك إعادة تشغيل البوت يدوياً عندما تستقر ظروف السوق.`
      );
    } catch {
      /* silent */
    }
    await stopBot(ctx.sessionToken);
  }
}

function buildTrailingConfig(cfg: any): TrailingConfig {
  return {
    atrPeriod: cfg.atrPeriod,
    atrMultiplier: cfg.atrMultiplier,
    emaFast: cfg.emaFast,
    emaSlow: cfg.emaSlow,
    minAtrPrice: cfg.minAtrPrice,
    maxSpreadPips: cfg.maxSpreadPips,
    breakevenAtr: cfg.breakevenAtr,
    maxTradeMinutes: cfg.maxTradeMinutes,
    lotSize: cfg.lotSize,
  };
}

/** Periodically sync open positions from the broker (catch-up safety net). */
export async function reconcilePositions() {
  for (const [, ctx] of activeSessions) {
    try {
      // The per-tick reconcileOpenPositions already handles broker sync; this
      // global pass is just a safety net for sessions that haven't ticked
      // recently (e.g. just started). It's a no-op for healthy sessions.
      const brokerPositions = await getOpenPositions(ctx.mt5Login, ctx.metaApiAccountId);
      const stillOpenIds = new Set(brokerPositions.map((p) => p.id));
      const survived = ctx.openPositions.filter((op) => stillOpenIds.has(op.positionId));
      if (survived.length < ctx.openPositions.length) {
        // Some positions were closed by the broker. They'll be finalized on
        // the next tick via reconcileOpenPositions.
        ctx.openPositions = survived;
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
