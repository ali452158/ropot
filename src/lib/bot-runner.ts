/**
 * ALFA Reports — Bot Runner
 *
 * Manages the live trading loop for each active session. The runner is
 * intentionally implemented as an in-process singleton (one loop per session)
 * for simplicity and because the bot is meant to be run on a dedicated VPS
 * close to the broker's servers.
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
} from "./metaapi";
import {
  evaluateEntry,
  evaluateHighFrequencyEntry,
  pickNewClosedCandle,
  checkExit,
  calculateProfitPips,
  PIP_VALUE_XAUUSD,
  type Candle,
} from "./strategy";

type ActiveSession = {
  sessionToken: string;       // public token (used by API)
  internalId: string;         // MT5Session.id (used as FK)
  mt5Login: string;
  symbol: string;
  timeframe: string;
  highFrequencyMode: boolean;
  interval: NodeJS.Timeout;
  currentPosition: {
    tradeId: string;
    positionId: string;
    direction: "BUY" | "SELL";
    openPrice: number;
    tpPrice: number | null;
    slPrice: number | null;
    wickTip: number | null;
    openedAt: string;
  } | null;
};

const activeSessions = new Map<string, ActiveSession>();

export function isBotRunning(sessionToken: string): boolean {
  return activeSessions.has(sessionToken);
}

export function getActiveSessionCount(): number {
  return activeSessions.size;
}

/**
 * Returns a snapshot of every currently-running bot session — used by the
 * admin endpoint so the operator can see which subscribers are trading right
 * now, on which MT5 logins, on which symbols.
 */
export function listActiveSessions(): Array<{
  sessionToken: string;
  mt5Login: string;
  symbol: string;
  timeframe: string;
  highFrequencyMode: boolean;
  hasOpenPosition: boolean;
}> {
  return Array.from(activeSessions.values()).map((s) => ({
    sessionToken: s.sessionToken,
    mt5Login: s.mt5Login,
    symbol: s.symbol,
    timeframe: s.timeframe,
    highFrequencyMode: s.highFrequencyMode,
    hasOpenPosition: !!s.currentPosition,
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
    interval: null as any,
    currentPosition: null,
  };

  // In HF mode the bot must react as soon as a new M1 candle closes, so we
  // poll more aggressively (500ms). In normal mode 1s is plenty.
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
    `[bot:${sessionToken}] started (mode=${isSimulationMode() ? "SIM" : "LIVE"}, ` +
    `hf=${cfg.highFrequencyMode ? "ON" : "OFF"}, tick=${tickMs}ms)`
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

  if (ctx.currentPosition) {
    const cp = ctx.currentPosition;
    await closePosition(ctx.mt5Login, cp.positionId);
    const price = await getCurrentPrice(ctx.symbol, ctx.mt5Login);
    if (price) {
      const exitPrice = cp.direction === "BUY" ? price.bid : price.ask;
      const profitPips = calculateProfitPips(cp.direction, cp.openPrice, exitPrice);
      await db.trade.update({
        where: { id: cp.tradeId },
        data: {
          status: "CLOSED_MANUAL",
          exitPrice,
          profitPips,
          profitUsd: profitPips * 1.0,
          closedAt: new Date(),
          durationSeconds: Math.round(
            (Date.now() - new Date(cp.openedAt).getTime()) / 1000
          ),
        },
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
  // Reflect HF flag changes live (no need to restart bot).
  ctx.highFrequencyMode = cfg.highFrequencyMode;

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
        exit.reason === "TP"
          ? "CLOSED_TP"
          : exit.reason === "SL"
          ? "CLOSED_SL"
          : exit.reason === "TIME"
          ? "CLOSED_TIME"
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
    }
    return;
  }

  // 2) Look for a new entry signal.
  //    - HF mode  → fire on every freshly-closed M1 candle (no wick-tip revisit wait).
  //    - Standard → original wick-rejection logic (waits for price to revisit wick tip).
  if (cfg.highFrequencyMode) {
    const closedCandle = pickNewClosedCandle(candles, cfg.lastHfCandleTime);
    if (!closedCandle) return; // no new closed candle since last trade

    const hfSignal = evaluateHighFrequencyEntry(closedCandle, price.bid, price.ask, {
      minWickRatio: cfg.minWickRatio,
      tpPips: cfg.tpPips,
      slPips: cfg.slPips,
      maxSpreadPips: cfg.maxSpreadPips,
      pipValue: PIP_VALUE_XAUUSD,
    });

    // Persist lastHfCandleTime regardless of action so we don't re-evaluate
    // the same closed candle on the next tick.
    await db.botConfig.update({
      where: { sessionId: ctx.internalId },
      data: { lastHfCandleTime: closedCandle.time },
    });

    if (hfSignal.action === "HOLD") {
      console.log(`[bot:${ctx.sessionToken}] HF skip: ${hfSignal.reason}`);
      return;
    }

    await executeEntry(ctx, cfg, {
      action: hfSignal.action,
      reason: hfSignal.reason,
      wickTip: hfSignal.wickTip,
      entryPrice: hfSignal.entryPrice,
      tpPrice: hfSignal.tpPrice,
      slPrice: hfSignal.slPrice,
    });
    return;
  }

  // Standard wick-rejection entry.
  const signal = evaluateEntry(candles, price.bid, price.ask, {
    minWickRatio: cfg.minWickRatio,
    tpPips: cfg.tpPips,
    slPips: cfg.slPips,
    maxSpreadPips: cfg.maxSpreadPips,
    pipValue: PIP_VALUE_XAUUSD,
  });

  if (signal.action === "HOLD") return;
  // After the HOLD check above, TS narrows signal.action to "BUY" | "SELL".
  await executeEntry(
    ctx,
    cfg,
    {
      action: signal.action as "BUY" | "SELL",
      reason: signal.reason,
      wickTip: signal.wickTip,
      entryPrice: signal.entryPrice,
      tpPrice: signal.tpPrice,
      slPrice: signal.slPrice,
    }
  );
}

/**
 * Shared order-execution helper used by both standard and HF paths.
 * Persists the Trade row, calls MetaAPI, and stashes the resulting
 * position into ctx.currentPosition.
 */
async function executeEntry(
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
    wickTip: signal.wickTip,
    openedAt: new Date().toISOString(),
  };

  console.log(
    `[bot:${ctx.sessionToken}] OPEN ${signal.action} ${cfg.symbol} @ ${signal.entryPrice} ` +
    `TP=${signal.tpPrice} SL=${signal.slPrice} reason="${signal.reason}"`
  );
}

/** Periodically sync open positions from the broker (catch-up safety net). */
export async function reconcilePositions() {
  for (const [token, ctx] of activeSessions) {
    try {
      const positions = await getOpenPositions(ctx.mt5Login);
      if (positions.length === 0 && ctx.currentPosition) {
        const cp = ctx.currentPosition;
        const price = await getCurrentPrice(ctx.symbol, ctx.mt5Login);
        const exitPrice = price
          ? cp.direction === "BUY"
            ? price.bid
            : price.ask
          : cp.openPrice;
        const profitPips = calculateProfitPips(cp.direction, cp.openPrice, exitPrice);
        await db.trade.update({
          where: { id: cp.tradeId },
          data: {
            status: "CLOSED_MANUAL",
            exitPrice,
            profitPips,
            profitUsd: profitPips * 1.0,
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
