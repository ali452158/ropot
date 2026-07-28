/**
 * ALFA Reports — Bot Runner (V4: Strict 3-Trade Pyramid)
 *
 * Strategy:
 * 1. Open a pyramid of 3 anchor trades at once (e.g. 3× SELL XAUUSD).
 * 2. Each trade exits immediately when it hits $1 profit OR $1 loss (HF exit).
 * 3. Trailing stop every $3 of profit (optional safety net).
 * 4. Strict rule: NO new pyramid is opened until ALL 3 trades of the previous
 *    pyramid have closed.
 * 5. After the previous pyramid fully closes, the bot WAITS for the next 1m
 *    candle to close before opening a new pyramid. This prevents opening
 *    a new batch every few seconds on the same candle.
 *
 * Anti-over-trading: Only ONE pyramid per 1m candle. Even if all 3 trades
 * close in 30 seconds, the bot will NOT open a new batch until the next
 * minute's M1 candle closes.
 */
import { db } from "./db";
import { getSessionByToken } from "./session";
import {
  getCandles,
  getCurrentPrice,
  createMarketOrder,
  closePosition,
  getOpenPositions,
  isSimulationMode,
  getMasterMetaApiAccountId,
  getMasterLogin,
} from "./metaapi";
import {
  pickNewClosedCandle,
  calculateProfitPips,
  PIP_VALUE_XAUUSD,
  type Candle,
} from "./strategy";

// ---------------- Types ----------------

type OpenTrade = {
  tradeId: string;
  positionId: string;
  direction: "BUY" | "SELL";
  openPrice: number;
  slPrice: number;
  tpPrice: number;
  openedAt: string;
  symbol: string;
  pyramidId: string;
  lastTrailProfitUsd: number;
};

type ActiveSession = {
  sessionToken: string;
  internalId: string;
  mt5Login: string;
  metaApiAccountId?: string;
  symbol: string;
  timeframe: string;
  interval: NodeJS.Timeout | null;
  // Pyramid state
  openPositions: OpenTrade[];
  currentPyramidId: string | null;
  pyramidDirection: "BUY" | "SELL" | null;
  pyramidAnchorSl: number | null;
  pyramidOpenedAt: string | null;
  pyramidEvaluating: boolean;
  // Candle memory — last 1m candle the bot opened a pyramid on
  lastPyramidCandleTime: string | null;
  inMemoryLastPyramidCandleTime: string | null;
  // Timestamp of when last pyramid closed (used for cooldown)
  lastPyramidClosedAt: number;
};

const activeSessions = new Map<string, ActiveSession>();

// ---------------- Public API ----------------

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
  currentPyramidId: string | null;
  pyramidDirection: "BUY" | "SELL" | null;
}> {
  return Array.from(activeSessions.values()).map((s) => ({
    sessionToken: s.sessionToken,
    mt5Login: s.mt5Login,
    symbol: s.symbol,
    timeframe: s.timeframe,
    openCount: s.openPositions.length,
    currentPyramidId: s.currentPyramidId,
    pyramidDirection: s.pyramidDirection,
  }));
}

export async function startBot(sessionToken: string): Promise<{ ok: boolean; error?: string }> {
  if (activeSessions.has(sessionToken)) return { ok: true };
  const session = await getSessionByToken(sessionToken);
  if (!session) return { ok: false, error: "session not found" };
  const internalId = session.id;
  const cfg = await db.botConfig.findUnique({ where: { sessionId: internalId } });
  if (!cfg) return { ok: false, error: "bot config not found" };

  if (!isSimulationMode()) {
    const masterLogin = getMasterLogin();
    if (masterLogin) {
      const masterId = await getMasterMetaApiAccountId();
      if (masterId) {
        console.log(`[BotRunner] Master account warmed up: login=${masterLogin} id=${masterId}`);
      }
    }
  }

  await db.botConfig.update({
    where: { sessionId: internalId },
    data: { botRunning: true, botStartedAt: new Date(), instabilityStop: false, lastLossStreak: 0 },
  });

  const ctx: ActiveSession = {
    sessionToken,
    internalId,
    mt5Login: session.mt5Login,
    metaApiAccountId: session.metaApiAccountId || undefined,
    symbol: cfg.symbol,
    timeframe: cfg.timeframe,
    interval: null,
    openPositions: [],
    currentPyramidId: null,
    pyramidDirection: null,
    pyramidAnchorSl: null,
    pyramidOpenedAt: null,
    pyramidEvaluating: false,
    lastPyramidCandleTime: cfg.lastPyramidCandleTime ?? null,
    inMemoryLastPyramidCandleTime: cfg.lastPyramidCandleTime ?? null,
    lastPyramidClosedAt: 0,
  };

  // Tick every 1000ms — fast enough to detect $1 exit quickly, slow enough
  // to not hammer MetaApi price feed.
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
    `symbol=${cfg.symbol}, dir=${cfg.tradeDirection}, ` +
    `anchor=${cfg.pyramidAnchorCount ?? 3}, max=${cfg.pyramidMaxTrades ?? 3}, ` +
    `profitThreshold=$${cfg.pyramidProfitUsd ?? 1}, slPips=${cfg.slPips})`
  );
  return { ok: true };
}

export async function stopBot(sessionToken: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = activeSessions.get(sessionToken);
  if (!ctx) {
    await db.botConfig.updateMany({ where: { botRunning: true }, data: { botRunning: false } });
    return { ok: true };
  }
  clearInterval(ctx.interval as any);
  // Close all open positions of this session
  for (const pos of ctx.openPositions) {
    try {
      await closePosition(ctx.mt5Login, pos.positionId);
      const price = await getCurrentPrice(pos.symbol, ctx.mt5Login);
      const exitPrice = price
        ? pos.direction === "BUY" ? price.bid : price.ask
        : pos.openPrice;
      const profitPips = calculateProfitPips(pos.direction, pos.openPrice, exitPrice);
      await db.trade.update({
        where: { id: pos.tradeId },
        data: {
          status: "CLOSED_MANUAL",
          exitPrice,
          profitPips,
          profitUsd: profitPips * 1.0,
          closedAt: new Date(),
          durationSeconds: Math.round((Date.now() - new Date(pos.openedAt).getTime()) / 1000),
        },
      });
    } catch (e) {
      console.error(`[bot:${sessionToken}] close-on-stop error:`, e);
    }
  }
  ctx.openPositions = [];
  await db.botConfig.update({
    where: { sessionId: ctx.internalId },
    data: { botRunning: false },
  });
  activeSessions.delete(sessionToken);
  console.log(`[bot:${sessionToken}] stopped (kept ${ctx.openPositions.length} open positions alive)`);
  return { ok: true };
}

// ---------------- Tick loop ----------------

async function tickOnce(ctx: ActiveSession): Promise<void> {
  const cfg = await db.botConfig.findUnique({ where: { sessionId: ctx.internalId } });
  if (!cfg || !cfg.botRunning) {
    // Stop the bot
    if (ctx.interval) clearInterval(ctx.interval);
    activeSessions.delete(ctx.sessionToken);
    return;
  }

  // Apply runtime config changes
  if (cfg.symbol !== ctx.symbol || cfg.timeframe !== ctx.timeframe) {
    ctx.symbol = cfg.symbol;
    ctx.timeframe = cfg.timeframe;
  }

  // 1. Reconcile open positions with MetaApi (catch SL/TP that hit on broker side)
  await reconcilePositions(ctx, cfg);

  // 2. Manage open positions — HF $1 exit, trailing stop, SL/TP check
  const anyClosed = await manageOpenPositions(ctx, cfg);

  // 3. If pyramid was active but all positions now closed → close pyramid
  if (ctx.openPositions.length === 0 && ctx.currentPyramidId) {
    console.log(`[bot:${ctx.sessionToken}] pyramid ${ctx.currentPyramidId} fully closed — waiting for next 1m candle`);
    ctx.currentPyramidId = null;
    ctx.pyramidDirection = null;
    ctx.pyramidAnchorSl = null;
    ctx.pyramidOpenedAt = null;
    ctx.lastPyramidClosedAt = Date.now();
  }

  // 4. Instability stop guard
  if (cfg.instabilityStop) {
    console.warn(`[bot:${ctx.sessionToken}] instabilityStop flag is set — skipping new entries`);
    return;
  }

  // 5. STRICT RULE: If we have ANY open positions, do NOT open new ones.
  //    Only open a new pyramid when openPositions is empty.
  if (ctx.openPositions.length > 0) {
    return; // <<< The key guard. No new trade while ANY of the 3 are still open.
  }

  // 6. Reconcile-on-close cooldown (avoid hammering MetaApi)
  if (Date.now() - ctx.lastPyramidClosedAt < 2000) return;

  // 7. Evaluate new pyramid entry — STRICTLY on a NEW closed 1m candle.
  if (ctx.pyramidEvaluating) return;
  await evaluateNewPyramidEntry(ctx, cfg);
}

// ---------------- Position reconciliation ----------------

async function reconcilePositions(ctx: ActiveSession, cfg: any): Promise<void> {
  try {
    const remote = await getOpenPositions(ctx.mt5Login);
    const remoteIds = new Set(remote.map((p: any) => p.id));
    // Remove local positions that no longer exist on broker (hit SL/TP)
    const survivors: OpenTrade[] = [];
    for (const pos of ctx.openPositions) {
      if (remoteIds.has(pos.positionId)) {
        survivors.push(pos);
      } else {
        // Position closed externally — record in DB
        await closeTradeInDb(ctx, cfg, pos, pos.slPrice, "SHARED_SL", true);
      }
    }
    ctx.openPositions = survivors;
  } catch (e) {
    // ignore reconciliation errors
  }
}

// ---------------- Manage open positions ----------------

const TRAIL_STEP_USD = 3;

async function manageOpenPositions(ctx: ActiveSession, cfg: any): Promise<boolean> {
  if (ctx.openPositions.length === 0) return false;
  const price = await getCurrentPrice(ctx.symbol, ctx.mt5Login);
  if (!price) return false;

  // PIP value per 1.0 lot
  const pipValuePerLot = detectPipValue(ctx.symbol);
  const trailDistancePrice = TRAIL_STEP_USD / (100 * (cfg.lotSize || 0.01)) / pipValuePerLot;

  const hfExitUsd = cfg.pyramidProfitUsd ?? 1.0;
  const snapshot = [...ctx.openPositions];
  let anyClosed = false;

  for (const pos of snapshot) {
    const currentPrice = pos.direction === "BUY" ? price.bid : price.ask;
    const profitPips = calculateProfitPips(pos.direction, pos.openPrice, currentPrice);
    const profitUsd = profitPips * (100 * (cfg.lotSize || 0.01));

    // HF PROFIT EXIT — close at +$1
    if (profitUsd >= hfExitUsd) {
      console.log(
        `[bot:${ctx.sessionToken}] HF PROFIT EXIT ${pos.direction} ${pos.symbol} #${pos.tradeId.slice(-6)} ` +
        `profit=$${profitUsd.toFixed(2)} >= $${hfExitUsd} — closing`
      );
      await closeTradeInDb(ctx, cfg, pos, currentPrice, "TP", false);
      anyClosed = true;
      continue;
    }

    // HF LOSS EXIT — close at -$1
    if (profitUsd <= -hfExitUsd) {
      console.log(
        `[bot:${ctx.sessionToken}] HF LOSS EXIT ${pos.direction} ${pos.symbol} #${pos.tradeId.slice(-6)} ` +
        `profit=$${profitUsd.toFixed(2)} <= -$${hfExitUsd} — closing`
      );
      await closeTradeInDb(ctx, cfg, pos, currentPrice, "HF_LOSS", false);
      anyClosed = true;
      continue;
    }

    // Trailing stop — every $3 of profit, advance SL by $3 (price-distance)
    if (profitUsd > 0 && profitUsd >= pos.lastTrailProfitUsd + TRAIL_STEP_USD) {
      let newSl: number;
      if (pos.direction === "BUY") {
        newSl = currentPrice - trailDistancePrice;
        if (newSl > pos.slPrice) {
          pos.slPrice = newSl;
          pos.lastTrailProfitUsd = TRAIL_STEP_USD * Math.floor(profitUsd / TRAIL_STEP_USD);
          console.log(
            `[bot:${ctx.sessionToken}] TRAIL ${pos.direction} ${pos.symbol} #${pos.tradeId.slice(-6)} ` +
            `profit=$${profitUsd.toFixed(2)} -> SL=${pos.slPrice.toFixed(4)} (distance=${trailDistancePrice.toFixed(4)} = $3)`
          );
        }
      } else {
        newSl = currentPrice + trailDistancePrice;
        if (newSl < pos.slPrice) {
          pos.slPrice = newSl;
          pos.lastTrailProfitUsd = TRAIL_STEP_USD * Math.floor(profitUsd / TRAIL_STEP_USD);
          console.log(
            `[bot:${ctx.sessionToken}] TRAIL ${pos.direction} ${pos.symbol} #${pos.tradeId.slice(-6)} ` +
            `profit=$${profitUsd.toFixed(2)} -> SL=${pos.slPrice.toFixed(4)} (distance=${trailDistancePrice.toFixed(4)} = $3)`
          );
        }
      }
    }

    // SL hit
    if (pos.direction === "BUY" ? price.bid <= pos.slPrice : price.ask >= pos.slPrice) {
      const exitPrice = pos.slPrice;
      console.log(
        `[bot:${ctx.sessionToken}] SL HIT ${pos.direction} ${pos.symbol} #${pos.tradeId.slice(-6)} ` +
        `SL=${pos.slPrice.toFixed(4)} — closing`
      );
      await closeTradeInDb(ctx, cfg, pos, exitPrice, "SHARED_SL", false);
      anyClosed = true;
      continue;
    }

    // TP hit (4×SL safety net — usually the HF exit fires first)
    if (pos.direction === "BUY" ? price.bid >= pos.tpPrice : price.ask <= pos.tpPrice) {
      const exitPrice = pos.tpPrice;
      console.log(
        `[bot:${ctx.sessionToken}] TP HIT ${pos.direction} ${pos.symbol} #${pos.tradeId.slice(-6)} ` +
        `TP=${pos.tpPrice.toFixed(4)} — closing`
      );
      await closeTradeInDb(ctx, cfg, pos, exitPrice, "TP", false);
      anyClosed = true;
    }
  }
  return anyClosed;
}

// ---------------- Close trade ----------------

async function closeTradeInDb(
  ctx: ActiveSession,
  cfg: any,
  pos: OpenTrade,
  exitPrice: number,
  reason: "TP" | "HF_LOSS" | "SHARED_SL" | "CLOSED_MANUAL",
  skipBrokerClose: boolean
): Promise<void> {
  if (!skipBrokerClose) {
    try {
      await closePosition(ctx.mt5Login, pos.positionId);
    } catch (e) {
      console.error(`[bot:${ctx.sessionToken}] broker close error:`, e);
    }
  }
  const pipValue = detectPipValue(ctx.symbol);
  const profitPips = calculateProfitPips(pos.direction, pos.openPrice, exitPrice);
  const profitUsd = profitPips * (100 * (cfg.lotSize || 0.01));

  try {
    await db.trade.update({
      where: { id: pos.tradeId },
      data: {
        status:
          reason === "TP" ? "CLOSED_TP" :
          reason === "SHARED_SL" ? "CLOSED_SL" :
          "CLOSED_MANUAL",
        exitPrice,
        profitPips,
        profitUsd,
        slPrice: pos.slPrice,
        closedAt: new Date(),
        durationSeconds: Math.round((Date.now() - new Date(pos.openedAt).getTime()) / 1000),
      },
    });
  } catch (e) {
    // ignore
  }

  // Remove from in-memory
  ctx.openPositions = ctx.openPositions.filter((p) => p.positionId !== pos.positionId);

  // Loss streak tracking
  let streak = cfg.lastLossStreak || 0;
  if (!skipBrokerClose) {
    if (profitPips < 0) streak += 1;
    else if (profitPips > 0) streak = 0;
    await db.botConfig.update({
      where: { sessionId: ctx.internalId },
      data: { lastLossStreak: streak },
    });
  }

  console.log(
    `[bot:${ctx.sessionToken}] CLOSE ${pos.direction} ${pos.symbol} @ ${exitPrice.toFixed(4)} ` +
    `profit=${profitPips.toFixed(1)}p ($${profitUsd.toFixed(2)}) reason=${reason} streak=${streak}`
  );
}

// ---------------- Evaluate new pyramid entry ----------------

async function evaluateNewPyramidEntry(ctx: ActiveSession, cfg: any): Promise<void> {
  ctx.pyramidEvaluating = true;
  try {
    await evaluatePyramidEntryInner(ctx, cfg);
  } finally {
    ctx.pyramidEvaluating = false;
  }
}

async function evaluatePyramidEntryInner(ctx: ActiveSession, cfg: any): Promise<void> {
  // STRICT GUARD: must have 0 open positions and no active pyramid
  if (ctx.openPositions.length > 0) return;
  if (ctx.currentPyramidId) return;

  // Fetch 1m candles — use MASTER for market data
  const candles = await getCandles(cfg.symbol, "1m", 50, ctx.mt5Login);
  const price = await getCurrentPrice(cfg.symbol, ctx.mt5Login);
  if (!candles.length || !price) return;

  // STRICT NEW-CANDLE CHECK — wait for a NEW closed 1m candle since the last pyramid
  const newClosedCandle = pickNewClosedCandle(candles, ctx.inMemoryLastPyramidCandleTime ?? cfg.lastPyramidCandleTime ?? null);
  if (!newClosedCandle) {
    // No new closed candle since last pyramid — DO NOT open a new pyramid
    return;
  }
  // Persist the new candle time so we never re-use this candle even after a restart
  ctx.inMemoryLastPyramidCandleTime = newClosedCandle.time;
  try {
    await db.botConfig.update({
      where: { sessionId: ctx.internalId },
      data: { lastPyramidCandleTime: newClosedCandle.time },
    });
  } catch {}

  // Spread filter
  const pipValue = detectPipValue(cfg.symbol);
  const spreadPips = (price.ask - price.bid) / pipValue;
  if (spreadPips > cfg.maxSpreadPips) {
    console.log(`[bot:${ctx.sessionToken}] pyramid skip: spread ${spreadPips.toFixed(2)}p > max ${cfg.maxSpreadPips}p`);
    return;
  }

  // 5m trend (EMA9 vs EMA21) — used as soft preference
  let trend5m: "BUY" | "SELL" = "BUY";
  try {
    const candles5m = await getCandles(cfg.symbol, "5m", 50, ctx.mt5Login);
    if (candles5m.length >= 25) {
      const closes5m = candles5m.map((c: Candle) => c.close);
      const emaFast5m = computeEMA(closes5m, cfg.emaFast);
      const emaSlow5m = computeEMA(closes5m, cfg.emaSlow);
      if (emaFast5m != null && emaSlow5m != null) {
        trend5m = emaFast5m > emaSlow5m ? "BUY" : "SELL";
      }
    }
  } catch (e) {
    console.warn(`[bot:${ctx.sessionToken}] 5m trend fetch failed, defaulting to BUY`, e);
  }

  // 1m trend
  const closes1m = candles.map((c: Candle) => c.close);
  const emaFast1m = computeEMA(closes1m, cfg.emaFast);
  const emaSlow1m = computeEMA(closes1m, cfg.emaSlow);
  if (emaFast1m == null || emaSlow1m == null) {
    console.log(`[bot:${ctx.sessionToken}] pyramid skip: EMA computation failed`);
    return;
  }
  const trend1m: "BUY" | "SELL" = emaFast1m > emaSlow1m ? "BUY" : "SELL";

  // Direction: respect cfg.tradeDirection (BUY/SELL/AUTO)
  let direction: "BUY" | "SELL";
  if (cfg.tradeDirection === "BUY") direction = "BUY";
  else if (cfg.tradeDirection === "SELL") direction = "SELL";
  else {
    // AUTO — use 5m trend
    direction = trend5m;
    if (direction !== trend5m) {
      console.log(
        `[bot:${ctx.sessionToken}] 5m trend=${trend5m} — using as direction (AUTO)`
      );
    }
  }

  // Entry price, SL, TP (4×SL pattern)
  const slPips = cfg.slPips;
  const tpPips = cfg.tpPips ?? 4 * slPips;
  const slPriceDistance = slPips * pipValue;
  const tpPriceDistance = tpPips * pipValue;

  const entry = direction === "BUY" ? price.ask : price.bid;
  const slPrice = direction === "BUY" ? entry - slPriceDistance : entry + slPriceDistance;
  const tpPrice = direction === "BUY" ? entry + tpPriceDistance : entry - tpPriceDistance;

  // Anchor count = min(anchorCount, maxTrades) — always 3 (no scaling)
  const anchorCount = Math.min(cfg.pyramidAnchorCount ?? 3, cfg.pyramidMaxTrades ?? 3);

  // Build pyramid ID
  const pyramidId = `pyramid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  ctx.currentPyramidId = pyramidId;
  ctx.pyramidDirection = direction;
  ctx.pyramidAnchorSl = slPrice;
  ctx.pyramidOpenedAt = new Date().toISOString();

  console.log(
    `[bot:${ctx.sessionToken}] PYRAMID OPEN ${direction} ${cfg.symbol} x${anchorCount} @ ${entry.toFixed(4)} ` +
    `SL=${slPrice.toFixed(4)} TP=${tpPrice.toFixed(4)} (4×SL) 5mTrend=${trend5m} 1mTrend=${trend1m} ` +
    `— strict 3-trade cap, $1 HF exit, wait-for-next-candle`
  );

  // Open 3 anchor trades (150ms apart for broker rate-limit friendliness)
  for (let i = 0; i < anchorCount; i++) {
    await openAnchorTrade(ctx, cfg, {
      direction,
      symbol: cfg.symbol,
      entry,
      slPrice,
      tpPrice,
      pyramidId,
      reason: `Anchor ${i + 1}/${anchorCount} ${direction} — 5mTrend=${trend5m}, 1mTrend=${trend1m}`,
    });
    if (i < anchorCount - 1) await new Promise((r) => setTimeout(r, 150));
  }
}

async function openAnchorTrade(
  ctx: ActiveSession,
  cfg: any,
  params: {
    direction: "BUY" | "SELL";
    symbol: string;
    entry: number;
    slPrice: number;
    tpPrice: number;
    pyramidId: string;
    reason: string;
  }
): Promise<void> {
  const order = await createMarketOrder(
    ctx.mt5Login,
    params.symbol,
    params.direction,
    cfg.lotSize,
    params.slPrice,
    params.tpPrice
  );

  if (!order.ok) {
    await db.trade.create({
      data: {
        sessionId: ctx.internalId,
        symbol: params.symbol,
        direction: params.direction,
        lotSize: cfg.lotSize,
        entryPrice: params.entry,
        tpPips: cfg.tpPips ?? 4 * cfg.slPips,
        slPips: cfg.slPips,
        tpPrice: params.tpPrice,
        slPrice: params.slPrice,
        wickPrice: null,
        status: "ERROR",
        errorMessage: order.error || "order failed",
      },
    });
    console.error(`[bot:${ctx.sessionToken}] ORDER FAILED: ${order.error}`);
    return;
  }

  const trade = await db.trade.create({
    data: {
      sessionId: ctx.internalId,
      symbol: params.symbol,
      direction: params.direction,
      lotSize: cfg.lotSize,
      entryPrice: params.entry,
      tpPips: cfg.tpPips ?? 4 * cfg.slPips,
      slPips: cfg.slPips,
      tpPrice: params.tpPrice,
      slPrice: params.slPrice,
      wickPrice: null,
      status: "OPEN",
    },
  });

  ctx.openPositions.push({
    tradeId: trade.id,
    positionId: order.orderId!,
    direction: params.direction,
    openPrice: params.entry,
    slPrice: params.slPrice,
    tpPrice: params.tpPrice,
    openedAt: new Date().toISOString(),
    symbol: params.symbol,
    pyramidId: params.pyramidId,
    lastTrailProfitUsd: 0,
  });

  console.log(
    `[bot:${ctx.sessionToken}] OPEN ${params.direction} ${params.symbol} @ ${params.entry.toFixed(4)} ` +
    `SL=${params.slPrice.toFixed(4)} TP=${params.tpPrice.toFixed(4)} ANCHOR pyramid=${params.pyramidId} ` +
    `[${ctx.openPositions.length}/${cfg.pyramidMaxTrades ?? 3}]`
  );
}

// ---------------- Helpers ----------------

function detectPipValue(symbol: string): number {
  if (symbol === "XAUUSD") return PIP_VALUE_XAUUSD;
  if (symbol.endsWith("JPY")) return 0.01;
  return 0.0001;
}

function computeEMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

// ---------------- Background reconciliation ----------------

if (typeof setInterval !== "undefined") {
  setInterval(async () => {
    for (const [token, ctx] of activeSessions) {
      try {
        await reconcilePositions(ctx, await db.botConfig.findUnique({ where: { sessionId: ctx.internalId } }) as any);
      } catch {}
    }
  }, 30_000);
}
