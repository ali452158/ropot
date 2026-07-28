/**
 * ALFA Reports — Bot Runner (Pyramid Strategy)
 *
 * =====================================================================
 *  STRATEGY (per operator spec — DO NOT MODIFY)
 * =====================================================================
 *
 * PYRAMID ENTRY (2 anchor trades + scale up to 6):
 *   - On a qualifying signal (new closed M1 candle + trend-aligned wick),
 *     the bot opens `pyramidAnchorCount` (default 2) "anchor" trades
 *     simultaneously. All anchor trades share the same direction, lot size,
 *     SL distance (slPips) and TP distance (3 × slPips).
 *   - The anchor trades' SL becomes the SHARED pyramid SL — if price hits
 *     this level, ALL pyramid trades close immediately.
 *
 * SCALING (add trades as price moves in our favor):
 *   - On every tick, the bot checks each open trade's floating profit (USD).
 *   - When ANY open trade's profit >= `pyramidProfitUsd` (default $2), the
 *     bot opens ONE more trade in the same direction with the same SL/TP
 *     rules (computed from the CURRENT price, not the anchor price).
 *   - Scaling continues until `pyramidMaxTrades` (default 6) trades are
 *     open. Once 6 is reached, no more trades are added until the pyramid
 *     fully closes.
 *
 * EXIT RULES:
 *   - Each trade closes INDEPENDENTLY when its own TP is hit (TP = 3 × SL
 *     distance from that trade's entry).
 *   - If price reverses and hits the SHARED anchor SL → ALL open trades
 *     close immediately at market.
 *   - On full close (all trades exited), the pyramid resets and the bot
 *     waits for the next qualifying signal.
 *
 * LOSS-STREAK SAFETY:
 *   - On every closed trade: win → reset lastLossStreak to 0;
 *     loss → increment by 1.
 *   - When lastLossStreak >= maxLossStreak (default 5), the bot
 *     auto-stops itself and sends the Telegram message
 *     "السوق غير مستقر الآن".
 *
 * =====================================================================
 *  AUTO-RESUME ON CONTAINER RESTART
 * =====================================================================
 * See instrumentation.ts — on process start it queries the DB for every
 * session whose `botRunning = true` and calls `startBot(token)` for each.
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
  ensureAccountCached,
} from "./metaapi";
import {
  computeEMA,
  detectPipValue,
  pickNewClosedCandle,
  detectWick,
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

type OpenTrade = {
  tradeId: string;
  positionId: string;
  direction: "BUY" | "SELL";
  openPrice: number;
  slPrice: number;            // this trade's own SL (entry - slPips*pip for BUY)
  tpPrice: number;            // this trade's own TP (entry + 3*slPips*pip for BUY)
  openedAt: string;           // ISO time
  symbol: string;
  isAnchor: boolean;          // true for the first `pyramidAnchorCount` trades
  pyramidId: string;          // which pyramid this trade belongs to
  // Tracks whether we've already used this trade's $2 profit to add another
  // trade (avoids adding multiple trades on a single profit threshold cross).
  profitThresholdTriggered: boolean;
};

type ActiveSession = {
  sessionToken: string;
  internalId: string;
  mt5Login: string;
  metaApiAccountId?: string;
  symbol: string;
  timeframe: string;
  interval: NodeJS.Timeout;
  openPositions: OpenTrade[];
  // === Strategy mode (auto-selected on start) ===
  // "pyramid"  → multi-trade pyramid strategy (XAUUSD only)
  // "single"   → single-trade USD-based SL/TP (all non-XAUUSD pairs)
  strategyMode: "pyramid" | "single";
  // === Pyramid tracking ===
  currentPyramidId: string | null;       // null = no active pyramid (ready for next)
  pyramidDirection: "BUY" | "SELL" | null;
  pyramidAnchorSl: number | null;         // SHARED SL — if price hits this, close ALL
  pyramidOpenedAt: string | null;
  pyramidAnchorCount: number;             // captured at pyramid open
  pyramidMaxTrades: number;               // captured at pyramid open
  // === Concurrency guard ===
  pyramidEvaluating: boolean;
  // === In-memory candle marker ===
  inMemoryLastPyramidCandleTime: string | null;
  // === Single-trade strategy tracking ===
  inMemoryLastSingleCandleTime: string | null;
  singleEvaluating: boolean;
};

const activeSessions = new Map<string, ActiveSession>();

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function notifyTrade(
  kind: "OPEN" | "CLOSE" | "ERROR" | "PYRAMID_OPEN" | "PYRAMID_CLOSE_ALL",
  ctx: ActiveSession,
  data: {
    direction: "BUY" | "SELL";
    symbol: string;
    lotSize: number;
    openPrice?: number | null;
    exitPrice?: number | null;
    profitPips?: number | null;
    profitUsd?: number | null;
    reason?: string | null;
    errorMessage?: string | null;
    tradeCount?: number;
    anchorCount?: number;
  }
) {
  try {
    const adminChatId = getAdminChatId();
    if (!adminChatId) return;
    const arrow = data.direction === "BUY" ? "📈" : "📉";
    let text: string;
    if (kind === "PYRAMID_OPEN") {
      text =
        `${arrow} <b>فتح هرم جديد</b>\n` +
        `الاتجاه: <b>${data.direction === "BUY" ? "شراء" : "بيع"}</b>\n` +
        `الزوج: <code>${escapeHtml(data.symbol)}</code>\n` +
        `عدد الصفقات الأولية: <b>${data.anchorCount ?? "—"}</b>\n` +
        `الحجم لكل صفقة: <code>${data.lotSize}</code> لوت\n` +
        `سعر الدخول: <code>${data.openPrice?.toFixed(4) ?? "—"}</code>\n` +
        `الهدف: <code>3× الاستوب</code>\n` +
        (data.reason ? `السبب: ${escapeHtml(data.reason)}` : "");
    } else if (kind === "PYRAMID_CLOSE_ALL") {
      text =
        `🛑 <b>إغلاق كل صفقات الهرم</b>\n` +
        `السبب: ضرب الاستوب المشترك للصفقات الأولى\n` +
        `الاتجاه: <b>${data.direction === "BUY" ? "شراء" : "بيع"}</b>\n` +
        `الزوج: <code>${escapeHtml(data.symbol)}</code>\n` +
        `عدد الصفقات المغلقة: <b>${data.tradeCount ?? "—"}</b>` +
        (data.profitUsd != null
          ? `\nإجمالي الربح/الخسارة: <code>${data.profitUsd.toFixed(2)} USD</code>`
          : "");
    } else if (kind === "OPEN") {
      text =
        `${arrow} <b>صفقة جديدة (${data.tradeCount ?? 1}/${data.tradeCount ?? 1})</b>\n` +
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

  if (session.metaApiAccountId) {
    ensureAccountCached(session.mt5Login, session.metaApiAccountId);
  }

  // Reset on fresh manual start.
  // Auto-select strategy based on symbol: XAUUSD = pyramid, everything else = single.
  const strategyMode: "pyramid" | "single" = cfg.symbol.toUpperCase() === "XAUUSD" ? "pyramid" : "single";
  await db.botConfig.update({
    where: { sessionId: internalId },
    data: {
      botRunning: true,
      botStartedAt: new Date(),
      instabilityStop: false,
      lastLossStreak: 0,
      lastPyramidCandleTime: null,
      lastSingleCandleTime: null,
      strategyMode,
    },
  });

  const ctx: ActiveSession = {
    sessionToken,
    internalId,
    mt5Login: session.mt5Login,
    metaApiAccountId: session.metaApiAccountId || undefined,
    symbol: cfg.symbol,
    timeframe: cfg.timeframe,
    interval: null as any,
    openPositions: [],
    strategyMode,
    currentPyramidId: null,
    pyramidDirection: null,
    pyramidAnchorSl: null,
    pyramidOpenedAt: null,
    pyramidAnchorCount: cfg.pyramidAnchorCount ?? 2,
    pyramidMaxTrades: cfg.pyramidMaxTrades ?? 6,
    pyramidEvaluating: false,
    inMemoryLastPyramidCandleTime: cfg.lastPyramidCandleTime ?? null,
    inMemoryLastSingleCandleTime: cfg.lastSingleCandleTime ?? null,
    singleEvaluating: false,
  };

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
    `anchorCount=${cfg.pyramidAnchorCount}, maxTrades=${cfg.pyramidMaxTrades}, ` +
    `profitThreshold=$${cfg.pyramidProfitUsd}, slPips=${cfg.slPips}, ` +
    `tpPips=${cfg.tpPips} (=3×SL), maxLoss=${cfg.maxLossStreak})`
  );
  return { ok: true };
}

export async function stopBot(sessionToken: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = activeSessions.get(sessionToken);
  if (!ctx) {
    await db.botConfig.updateMany({ where: { botRunning: true }, data: { botRunning: false } });
    return { ok: true };
  }
  clearInterval(ctx.interval);
  // Don't auto-close open positions on stop — let them expire by their
  // own TP / SL rules.
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
    // Stop the bot
    if (ctx.interval) clearInterval(ctx.interval);
    activeSessions.delete(ctx.sessionToken);
    return;
  }

  if (cfg.symbol !== ctx.symbol || cfg.timeframe !== ctx.timeframe) {
    ctx.symbol = cfg.symbol;
    ctx.timeframe = cfg.timeframe;
    // Re-select strategy on symbol change
    ctx.strategyMode = cfg.symbol.toUpperCase() === "XAUUSD" ? "pyramid" : "single";
  }
  ctx.pyramidAnchorCount = cfg.pyramidAnchorCount ?? 2;
  ctx.pyramidMaxTrades = cfg.pyramidMaxTrades ?? 6;

  // 1) Reconcile in-memory openPositions against broker state.
  await reconcileOpenPositions(ctx, cfg);

  // 2) Manage each open position (TP hit / shared SL hit / USD-based SL/TP for single).
  const pyramidClosedBySL = await manageOpenPositions(ctx, cfg);

  // 3) If the shared anchor SL was hit (pyramid mode), ALL trades have been
  //    closed above. Reset pyramid state so the next tick can look for a new
  //    signal.
  if (pyramidClosedBySL) {
    console.log(
      `[bot:${ctx.sessionToken}] pyramid ${ctx.currentPyramidId} closed by SHARED SL — ready for next signal`
    );
    ctx.currentPyramidId = null;
    ctx.pyramidDirection = null;
    ctx.pyramidAnchorSl = null;
    ctx.pyramidOpenedAt = null;
  }

  // 4) Instability-stop safety.
  if (cfg.instabilityStop) {
    console.warn(`[bot:${ctx.sessionToken}] instabilityStop flag is set — skipping new entries`);
    return;
  }

  // 5) BRANCH on strategy mode:
  //    - "pyramid": multi-trade strategy (XAUUSD) — open + scale + shared SL
  //    - "single" : single-trade strategy (all non-XAUUSD) — ONE trade at a time
  //                  with USD-based TP ($10) / SL ($3) managed in manageOpenPositions.
  if (ctx.strategyMode === "single") {
    // Single-trade: no entry while a trade is open. Wait for it to close
    // (TP or SL in USD) before evaluating a new signal.
    if (ctx.openPositions.length > 0) {
      return;
    }
    // Clear any stale state — single strategy has no pyramid state.
    await evaluateSingleEntry(ctx, cfg);
    return;
  }

  // === PYRAMID MODE (XAUUSD) ===
  // 5) PYRAMID ENTRY: only when no pyramid is active (all trades closed).
  if (ctx.openPositions.length > 0) {
    // Pyramid is active — check for scaling opportunity instead.
    await maybeScalePyramid(ctx, cfg);
    return;
  }

  // Clear any stale pyramid state.
  if (ctx.currentPyramidId != null) {
    console.log(
      `[bot:${ctx.sessionToken}] pyramid ${ctx.currentPyramidId} fully closed — ready for next signal`
    );
    ctx.currentPyramidId = null;
    ctx.pyramidDirection = null;
    ctx.pyramidAnchorSl = null;
    ctx.pyramidOpenedAt = null;
  }

  await evaluatePyramidEntry(ctx, cfg);
}

/**
 * Refresh ctx.openPositions from broker state. Closes any in-memory position
 * the broker no longer reports (manually closed by user or hit broker SL/TP).
 */
async function reconcileOpenPositions(ctx: ActiveSession, cfg: any) {
  const brokerPositions = await getOpenPositions(ctx.mt5Login, ctx.metaApiAccountId);

  const stillOpenIds = new Set(brokerPositions.map((p) => p.id));
  const survived: OpenTrade[] = [];
  for (const op of ctx.openPositions) {
    if (stillOpenIds.has(op.positionId)) {
      survived.push(op);
    } else {
      // Broker closed it externally (TP hit at broker, manual close, etc.).
      await finalizeExternalClose(ctx, cfg, op);
    }
  }
  ctx.openPositions = survived;

  // Add any broker position we don't yet track (rare — e.g. bot restarted
  // mid-pyramid). We track them so the max-trades ceiling works correctly.
  const knownIds = new Set(ctx.openPositions.map((p) => p.positionId));
  for (const p of brokerPositions) {
    if (knownIds.has(p.id)) continue;
    const pipValue = detectPipValue(p.openPrice);
    const slDist = cfg.slPips * pipValue;
    const tpDist = 3 * slDist;
    ctx.openPositions.push({
      tradeId: "external-" + p.id,
      positionId: p.id,
      direction: p.direction as "BUY" | "SELL",
      openPrice: p.openPrice,
      slPrice: p.sl ?? (p.direction === "BUY" ? p.openPrice - slDist : p.openPrice + slDist),
      tpPrice: p.direction === "BUY" ? p.openPrice + tpDist : p.openPrice - tpDist,
      openedAt: p.openTime || new Date().toISOString(),
      symbol: p.symbol,
      isAnchor: false,
      pyramidId: "external",
      profitThresholdTriggered: true,  // don't trigger scaling on external positions
    });
  }
}

/**
 * Manage each open position:
 *   - Check if the trade's own TP was hit → close individually.
 *   - Check if the SHARED anchor SL was hit → close ALL pyramid trades.
 *
 * Returns true if the shared SL was hit (and all trades were closed).
 */
async function manageOpenPositions(
  ctx: ActiveSession,
  cfg: any
): Promise<boolean> {
  if (ctx.openPositions.length === 0) return false;

  const price = await getCurrentPrice(ctx.symbol, ctx.mt5Login);
  if (!price) return false;

  // === 1) Check the SHARED anchor SL first ===
  // If the anchor SL is hit, close ALL pyramid trades immediately.
  if (ctx.pyramidAnchorSl != null && ctx.pyramidDirection != null) {
    const sl = ctx.pyramidAnchorSl;
    const dir = ctx.pyramidDirection;
    const slHit =
      dir === "BUY" ? price.bid <= sl : price.ask >= sl;
    if (slHit) {
      console.warn(
        `[bot:${ctx.sessionToken}] SHARED ANCHOR SL HIT (sl=${sl.toFixed(4)}, ` +
        `bid=${price.bid.toFixed(4)}, ask=${price.ask.toFixed(4)}) — closing ALL ${ctx.openPositions.length} pyramid trades`
      );
      // Compute total profit across all trades for the notification.
      let totalProfitUsd = 0;
      const snapshot = [...ctx.openPositions];
      for (const op of snapshot) {
        const exitPrice = op.direction === "BUY" ? price.bid : price.ask;
        const pipValue = detectPipValue(exitPrice);
        const profitPips =
          (op.direction === "BUY"
            ? exitPrice - op.openPrice
            : op.openPrice - exitPrice) / pipValue;
        totalProfitUsd += profitPips * (cfg.lotSize * 100);
        await closeTradeRow(ctx, cfg, op, "SHARED_SL", exitPrice);
      }
      await notifyTrade("PYRAMID_CLOSE_ALL", ctx, {
        direction: dir,
        symbol: ctx.symbol,
        lotSize: cfg.lotSize,
        tradeCount: snapshot.length,
        profitUsd: totalProfitUsd,
        reason: `Shared anchor SL hit at ${sl.toFixed(4)}`,
      });
      return true;
    }
  }

  // === 2) Check each trade's individual TP ===
  //     In pyramid mode → use the trade's own TP price.
  //     In single  mode → use USD-based TP/SL via the broker's floating
  //                       P/L (more accurate across different pip values).
  const snapshot = [...ctx.openPositions];
  for (const op of snapshot) {
    if (ctx.strategyMode === "single") {
      // USD-based exit: pull the broker-reported floating profit (USD).
      const brokerPositions = await getOpenPositions(ctx.mt5Login, ctx.metaApiAccountId);
      const brokerPos = brokerPositions.find((p) => p.id === op.positionId);
      const floatingUsd = brokerPos?.profit ?? 0;
      const tpUsd = cfg.singleTpUsd ?? 10.0;
      const slUsd = cfg.singleSlUsd ?? 3.0;

      if (floatingUsd >= tpUsd) {
        const exitPrice = op.direction === "BUY" ? price.bid : price.ask;
        console.log(
          `[bot:${ctx.sessionToken}] SINGLE TP HIT — profit $${floatingUsd.toFixed(2)} ≥ $${tpUsd} — closing ${op.direction} ${ctx.symbol}`
        );
        await closeTradeRow(ctx, cfg, op, "TP", exitPrice, floatingUsd);
      } else if (floatingUsd <= -slUsd) {
        const exitPrice = op.direction === "BUY" ? price.bid : price.ask;
        console.log(
          `[bot:${ctx.sessionToken}] SINGLE SL HIT — loss $${floatingUsd.toFixed(2)} ≤ -$${slUsd} — closing ${op.direction} ${ctx.symbol}`
        );
        await closeTradeRow(ctx, cfg, op, "SL", exitPrice, floatingUsd);
      }
    } else {
      // Pyramid mode: trade's own TP price (price-based)
      const tpHit =
        op.direction === "BUY"
          ? price.bid >= op.tpPrice
          : price.ask <= op.tpPrice;
      if (tpHit) {
        const exitPrice = op.tpPrice;
        await closeTradeRow(ctx, cfg, op, "TP", exitPrice);
      }
    }
  }

  return false;
}

// =========================================================================
//  PYRAMID SCALING (add trades as price moves in our favor)
// =========================================================================

/**
 * Check whether to add another trade to the active pyramid.
 *
 * Rule: if ANY open trade's floating profit >= pyramidProfitUsd (default $2),
 * open ONE more trade in the same direction with the same SL/TP rules
 * (computed from the CURRENT price). Continue until pyramidMaxTrades.
 */
async function maybeScalePyramid(ctx: ActiveSession, cfg: any) {
  if (ctx.openPositions.length === 0) return;
  if (ctx.openPositions.length >= ctx.pyramidMaxTrades) return;
  if (ctx.pyramidDirection == null) return;

  const price = await getCurrentPrice(ctx.symbol, ctx.mt5Login);
  if (!price) return;

  // Check if any trade has reached the profit threshold AND hasn't yet
  // triggered a scale-up.
  let triggeredTrade: OpenTrade | null = null;
  for (const op of ctx.openPositions) {
    if (op.profitThresholdTriggered) continue;
    const currentPrice = op.direction === "BUY" ? price.bid : price.ask;
    const pipValue = detectPipValue(currentPrice);
    const profitPips =
      (op.direction === "BUY"
        ? currentPrice - op.openPrice
        : op.openPrice - currentPrice) / pipValue;
    const profitUsd = profitPips * (cfg.lotSize * 100);
    if (profitUsd >= cfg.pyramidProfitUsd) {
      triggeredTrade = op;
      break;
    }
  }
  if (!triggeredTrade) return;

  // Mark the triggering trade as having already scaled — prevents multiple
  // scale-ups from a single trade's profit.
  triggeredTrade.profitThresholdTriggered = true;

  // Open one more trade in the same direction as the pyramid.
  const direction = ctx.pyramidDirection;
  const pipValue = detectPipValue(price.ask);
  const slDist = cfg.slPips * pipValue;
  const tpDist = 3 * slDist;
  const entry = direction === "BUY" ? price.ask : price.bid;
  // The scaled trade's SL is computed from its OWN entry (not the anchor SL).
  // The shared anchor SL still applies as the pyramid-wide exit trigger.
  const slPrice = direction === "BUY" ? entry - slDist : entry + slDist;
  const tpPrice = direction === "BUY" ? entry + tpDist : entry - tpDist;

  console.log(
    `[bot:${ctx.sessionToken}] SCALE +1 ${direction} ${ctx.symbol} @ ${entry.toFixed(4)} ` +
    `SL=${slPrice.toFixed(4)} TP=${tpPrice.toFixed(4)} (now ${ctx.openPositions.length + 1}/${ctx.pyramidMaxTrades})`
  );

  await executeEntry(ctx, cfg, {
    direction,
    symbol: ctx.symbol,
    entry,
    slPrice,
    tpPrice,
    isAnchor: false,
    pyramidId: ctx.currentPyramidId!,
    reason: `Scale +1 (trade #${ctx.openPositions.length + 1}/${ctx.pyramidMaxTrades}) — triggered by $${cfg.pyramidProfitUsd} profit on trade ${triggeredTrade.tradeId.slice(-6)}`,
  });
}

// =========================================================================
//  PYRAMID ENTRY (initial 2 anchor trades)
// =========================================================================

async function evaluatePyramidEntry(ctx: ActiveSession, cfg: any) {
  // === CONCURRENCY GUARD ===
  if (ctx.pyramidEvaluating) return;
  ctx.pyramidEvaluating = true;
  try {
    await evaluatePyramidEntryInner(ctx, cfg);
  } finally {
    ctx.pyramidEvaluating = false;
  }
}

// =========================================================================
//  SINGLE-TRADE ENTRY (one trade at a time — for non-XAUUSD pairs)
// =========================================================================
//
// Strategy:
//   - On every newly-closed candle, compute EMA9 vs EMA21 trend.
//   - If user picked "BUY only" / "SELL only", force that direction.
//   - Otherwise (AUTO), follow the EMA trend.
//   - Open ONE trade with no broker-side SL/TP (the bot-side manages the
//     exit by watching the broker's floating P/L in USD).
//   - Exit when floating profit >= +singleTpUsd (TP) or <= -singleSlUsd (SL).
//   - After exit, wait for the NEXT new candle before opening another trade
//     (prevents re-entering on the same candle that just closed the trade).
//
// The bot already opens at most ONE trade per pyramid (single mode is just
// pyramid with anchorCount=1, maxTrades=1) — but we keep the logic separate
// for clarity + to skip the wick filter (single strategy trades on trend
// alone, not on wick rejection).

async function evaluateSingleEntry(ctx: ActiveSession, cfg: any) {
  // === CONCURRENCY GUARD ===
  if (ctx.singleEvaluating) return;
  ctx.singleEvaluating = true;
  try {
    await evaluateSingleEntryInner(ctx, cfg);
  } finally {
    ctx.singleEvaluating = false;
  }
}

async function evaluateSingleEntryInner(ctx: ActiveSession, cfg: any) {
  const candles: Candle[] = await getCandles(cfg.symbol, cfg.timeframe, 50, ctx.mt5Login);
  const price = await getCurrentPrice(cfg.symbol, ctx.mt5Login);
  if (!candles.length) {
    console.log(`[bot:${ctx.sessionToken}] single skip: no candles for ${cfg.symbol} (${cfg.timeframe})`);
    return;
  }
  if (!price) {
    console.log(`[bot:${ctx.sessionToken}] single skip: no price for ${cfg.symbol}`);
    return;
  }

  const lastSingleTime =
    ctx.inMemoryLastSingleCandleTime ?? cfg.lastSingleCandleTime ?? null;
  const closedCandle = pickNewClosedCandle(candles, lastSingleTime);
  if (!closedCandle) {
    // No new closed candle since last cycle — this is normal, but log once
    // per ~30s so user can see the bot is alive but waiting.
    if ((evaluateSingleEntryInner._lastWaitLog ?? 0) < Date.now() - 30_000) {
      console.log(
        `[bot:${ctx.sessionToken}] single wait: no new closed ${cfg.timeframe} candle for ${cfg.symbol} ` +
        `(last=${lastSingleTime ?? "none"})`
      );
      evaluateSingleEntryInner._lastWaitLog = Date.now();
    }
    return;
  }

  // === IMMEDIATELY mark this candle as processed (in-memory, sync) ===
  ctx.inMemoryLastSingleCandleTime = closedCandle.time;
  try {
    await db.botConfig.update({
      where: { sessionId: ctx.internalId },
      data: { lastSingleCandleTime: closedCandle.time },
    });
  } catch {
    /* ignore — in-memory mirror is authoritative */
  }

  // === Spread filter (still useful — don't enter on wide spreads) ===
  // === Auto-tune max spread per symbol category ===
  // Default cfg.maxSpreadPips = 3.0 is too tight for JPY crosses (typical
  // spread 5-15 pips on GBPJPY/EURJPY/AUDJPY) and slightly tight for exotic
  // crosses. We compute a per-symbol floor here and use the higher of the
  // two (configured vs floor) so we never reject an entry purely because
  // the configured value was left at 3.0 for a JPY pair.
  const sym = cfg.symbol.toUpperCase();
  let spreadFloor = 3.0;
  if (sym.includes("JPY")) spreadFloor = 8.0;        // JPY crosses
  else if (sym === "GBPUSD") spreadFloor = 3.5;
  else if (sym === "EURGBP" || sym === "EURAUD") spreadFloor = 5.0;
  else if (sym === "XAGUSD") spreadFloor = 5.0;
  const effectiveMaxSpread = Math.max(cfg.maxSpreadPips ?? 3.0, spreadFloor);

  const pipValue = detectPipValue(price.ask);
  const spreadPips = (price.ask - price.bid) / pipValue;
  if (spreadPips > effectiveMaxSpread) {
    console.log(
      `[bot:${ctx.sessionToken}] single skip: spread ${spreadPips.toFixed(2)}p > max ${effectiveMaxSpread.toFixed(1)}p ` +
      `(cfg=${cfg.maxSpreadPips}, floor=${spreadFloor}) — ${cfg.symbol}`
    );
    return;
  }

  // === Trend detection on the configured timeframe ===
  const closes = candles.map((c) => c.close);
  const emaFast = computeEMA(closes, cfg.emaFast);
  const emaSlow = computeEMA(closes, cfg.emaSlow);
  if (emaFast == null || emaSlow == null) {
    console.log(
      `[bot:${ctx.sessionToken}] single skip: EMA computation failed (closes=${closes.length})`
    );
    return;
  }
  const trendDir: "BUY" | "SELL" = emaFast > emaSlow ? "BUY" : "SELL";

  // === Direction selection (respect user's BUY/SELL/AUTO choice) ===
  let direction: "BUY" | "SELL";
  if (cfg.tradeDirection === "BUY") {
    direction = "BUY";
  } else if (cfg.tradeDirection === "SELL") {
    direction = "SELL";
  } else {
    direction = trendDir;
  }

  // === Compute SL/TP prices for the broker-side safety net ===
  // We compute approximate SL/TP prices from the USD targets, so the
  // broker still has a fallback in case the bot goes offline. The
  // bot-side USD watcher is the authoritative exit trigger.
  //
  // For a 1.0 lot on a USD-quoted pair (EURUSD, GBPUSD): 1 pip ≈ $10.
  // For 0.01 lot: 1 pip ≈ $0.10. So SL ($3) ≈ 30 pips for 0.01 lot.
  // We use a conservative pipValue-per-lot estimate of $10 to compute a
  // broker-side SL/TP distance — this is intentionally loose, the bot-side
  // USD watcher is precise.
  const usdPerPipPerLot = 10; // approximate for USD-quoted pairs
  const slUsd = cfg.singleSlUsd ?? 3.0;
  const tpUsd = cfg.singleTpUsd ?? 10.0;
  const slPipsApprox = (slUsd / usdPerPipPerLot) / Math.max(cfg.lotSize, 0.01);
  const tpPipsApprox = (tpUsd / usdPerPipPerLot) / Math.max(cfg.lotSize, 0.01);

  const entry = direction === "BUY" ? price.ask : price.bid;
  const slPrice = direction === "BUY"
    ? entry - slPipsApprox * pipValue
    : entry + slPipsApprox * pipValue;
  const tpPrice = direction === "BUY"
    ? entry + tpPipsApprox * pipValue
    : entry - tpPipsApprox * pipValue;

  const pyramidId = `single-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Mark as a "single" pyramid so the rest of the engine sees it as active
  // and skips new entries while it's open.
  ctx.currentPyramidId = pyramidId;
  ctx.pyramidDirection = direction;
  ctx.pyramidAnchorSl = slPrice; // not used for single, kept for compat
  ctx.pyramidOpenedAt = new Date().toISOString();

  console.log(
    `[bot:${ctx.sessionToken}] SINGLE OPEN ${direction} ${cfg.symbol} @ ${entry.toFixed(4)} ` +
    `SL≈${slPrice.toFixed(4)} TP≈${tpPrice.toFixed(4)} (USD target: -$${slUsd}/+$${tpUsd}) trend=${trendDir}`
  );

  await notifyTrade("OPEN", ctx, {
    direction,
    symbol: cfg.symbol,
    lotSize: cfg.lotSize,
    openPrice: entry,
    reason: `Single ${direction} — trend=${trendDir} (EMA9=${emaFast.toFixed(4)} ${trendDir === "BUY" ? ">" : "<"} EMA21=${emaSlow.toFixed(4)}), SL=-$${slUsd} TP=+$${tpUsd}`,
  });

  // Open the single trade
  await executeEntry(ctx, cfg, {
    direction,
    symbol: cfg.symbol,
    entry,
    slPrice,
    tpPrice,
    isAnchor: true,
    pyramidId,
    reason: `Single ${direction} — trend=${trendDir}, SL=-$${slUsd} TP=+$${tpUsd}`,
  });
}

async function evaluatePyramidEntryInner(ctx: ActiveSession, cfg: any) {
  const candles: Candle[] = await getCandles(cfg.symbol, cfg.timeframe, 50, ctx.mt5Login);
  const price = await getCurrentPrice(cfg.symbol, ctx.mt5Login);
  if (!candles.length || !price) return;

  const lastPyramidTime =
    ctx.inMemoryLastPyramidCandleTime ?? cfg.lastPyramidCandleTime ?? null;
  const closedCandle = pickNewClosedCandle(candles, lastPyramidTime);
  if (!closedCandle) return;

  // === IMMEDIATELY mark this candle as processed (in-memory, sync) ===
  ctx.inMemoryLastPyramidCandleTime = closedCandle.time;
  try {
    await db.botConfig.update({
      where: { sessionId: ctx.internalId },
      data: { lastPyramidCandleTime: closedCandle.time },
    });
  } catch {
    /* ignore — in-memory mirror is authoritative */
  }

  const pipValue = detectPipValue(price.ask);
  const spreadPips = (price.ask - price.bid) / pipValue;
  if (spreadPips > cfg.maxSpreadPips) {
    console.log(
      `[bot:${ctx.sessionToken}] pyramid skip: spread ${spreadPips.toFixed(2)}p > max ${cfg.maxSpreadPips}p`
    );
    return;
  }

  // === Trend detection on the 1-minute timeframe ===
  const closes = candles.map((c) => c.close);
  const emaFast = computeEMA(closes, cfg.emaFast);
  const emaSlow = computeEMA(closes, cfg.emaSlow);
  if (emaFast == null || emaSlow == null) {
    console.log(`[bot:${ctx.sessionToken}] pyramid skip: EMA computation failed`);
    return;
  }
  const trendDir: "BUY" | "SELL" = emaFast > emaSlow ? "BUY" : "SELL";

  // === Wick detection ===
  const wickSignal = detectWick(closedCandle, cfg.minWickRatio);
  const hasWick = wickSignal.type !== "NONE";

  // === Direction selection ===
  let direction: "BUY" | "SELL";
  if (cfg.tradeDirection === "BUY") {
    direction = "BUY";
  } else if (cfg.tradeDirection === "SELL") {
    direction = "SELL";
  } else {
    direction = trendDir;
  }

  // === Wick/direction alignment filter ===
  if (hasWick) {
    if (direction === "BUY" && wickSignal.type === "UPPER_WICK") {
      console.log(`[bot:${ctx.sessionToken}] pyramid skip: BUY vs upper-wick candle`);
      return;
    }
    if (direction === "SELL" && wickSignal.type === "LOWER_WICK") {
      console.log(`[bot:${ctx.sessionToken}] pyramid skip: SELL vs lower-wick candle`);
      return;
    }
  }

  // === Compute SL + TP (TP = 3 × SL distance) ===
  const slDist = cfg.slPips * pipValue;
  const tpDist = 3 * slDist;
  const entry = direction === "BUY" ? price.ask : price.bid;
  const slPrice = direction === "BUY" ? entry - slDist : entry + slDist;
  const tpPrice = direction === "BUY" ? entry + tpDist : entry - tpDist;

  // === Open the pyramid ===
  const anchorCount = Math.min(
    cfg.pyramidAnchorCount ?? 2,
    cfg.pyramidMaxTrades ?? 6
  );
  const pyramidId = `pyramid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // SYNCHRONOUSLY mark the pyramid as active so concurrent ticks see it.
  ctx.currentPyramidId = pyramidId;
  ctx.pyramidDirection = direction;
  ctx.pyramidAnchorSl = slPrice;  // SHARED SL — closes ALL trades if hit
  ctx.pyramidOpenedAt = new Date().toISOString();

  console.log(
    `[bot:${ctx.sessionToken}] PYRAMID OPEN ${direction} ${cfg.symbol} x${anchorCount} @ ${entry.toFixed(4)} ` +
    `SL=${slPrice.toFixed(4)} TP=${tpPrice.toFixed(4)} (3×SL) trend=${trendDir} wick=${hasWick ? wickSignal.type : "none"}`
  );

  await notifyTrade("PYRAMID_OPEN", ctx, {
    direction,
    symbol: cfg.symbol,
    lotSize: cfg.lotSize,
    openPrice: entry,
    anchorCount,
    reason: `Pyramid ${direction} x${anchorCount} — trend=${trendDir} (EMA9=${emaFast.toFixed(4)} ${trendDir === "BUY" ? ">" : "<"} EMA21=${emaSlow.toFixed(4)}), wick=${hasWick ? wickSignal.type : "none"}`,
  });

  // Open the anchor trades sequentially (small delay to avoid API rate-limit).
  for (let i = 0; i < anchorCount; i++) {
    await executeEntry(ctx, cfg, {
      direction,
      symbol: cfg.symbol,
      entry,
      slPrice,
      tpPrice,
      isAnchor: true,
      pyramidId,
      reason: `Anchor ${i + 1}/${anchorCount} ${direction} — trend=${trendDir}, wick=${hasWick ? wickSignal.type : "none"}`,
    });
    if (i < anchorCount - 1) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
}

async function executeEntry(
  ctx: ActiveSession,
  cfg: any,
  signal: {
    direction: "BUY" | "SELL";
    symbol: string;
    entry: number;
    slPrice: number;
    tpPrice: number;
    isAnchor: boolean;
    pyramidId: string;
    reason: string;
  }
) {
  // Open with broker-side SL + TP so the broker auto-closes the trade even
  // if our bot is offline / lagging. (The bot still checks TP/SL in-memory
  // for faster reaction, but the broker-side levels are the safety net.)
  const order = await createMarketOrder(
    ctx.mt5Login,
    signal.symbol,
    signal.direction,
    cfg.lotSize,
    signal.slPrice,    // broker-side SL
    signal.tpPrice,    // broker-side TP (3 × SL distance)
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
        tpPips: cfg.slPips * 3,
        slPips: cfg.slPips,
        tpPrice: signal.tpPrice,
        slPrice: signal.slPrice,
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
      tpPips: cfg.slPips * 3,
      slPips: cfg.slPips,
      tpPrice: signal.tpPrice,
      slPrice: signal.slPrice,
      wickPrice: null,
      status: "OPEN",
    },
  });

  ctx.openPositions.push({
    tradeId: trade.id,
    positionId: order.orderId!,
    direction: signal.direction,
    openPrice: signal.entry,
    slPrice: signal.slPrice,
    tpPrice: signal.tpPrice,
    openedAt: new Date().toISOString(),
    symbol: signal.symbol,
    isAnchor: signal.isAnchor,
    pyramidId: signal.pyramidId,
    profitThresholdTriggered: false,
  });

  console.log(
    `[bot:${ctx.sessionToken}] OPEN ${signal.direction} ${signal.symbol} @ ${signal.entry.toFixed(4)} ` +
    `SL=${signal.slPrice.toFixed(4)} TP=${signal.tpPrice.toFixed(4)} ${signal.isAnchor ? "ANCHOR" : "SCALED"} pyramid=${signal.pyramidId}`
  );
}

// =========================================================================
//  CLOSE HANDLING + LOSS-STREAK TRACKING
// =========================================================================

async function closeTradeRow(
  ctx: ActiveSession,
  cfg: any,
  op: OpenTrade,
  reason: "TP" | "SHARED_SL" | "MANUAL" | "SL",
  forcedExitPrice?: number,
  forcedProfitUsd?: number
) {
  // Close at broker (idempotent — if the position is already gone, this is
  // a no-op).
  await closePosition(ctx.mt5Login, op.positionId, ctx.metaApiAccountId);

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
  // Use the broker-reported floating USD when available (single strategy);
  // otherwise estimate from pips × lotSize × 100 (pyramid strategy).
  const profitUsd =
    forcedProfitUsd != null ? forcedProfitUsd : profitPips * (cfg.lotSize * 100);

  const status =
    reason === "TP" ? "CLOSED_TP"
    : reason === "SHARED_SL" || reason === "SL" ? "CLOSED_SL"
    : "CLOSED_MANUAL";

  if (!op.tradeId.startsWith("external-")) {
    try {
      await db.trade.update({
        where: { id: op.tradeId },
        data: {
          status,
          exitPrice,
          profitPips,
          profitUsd,
          slPrice: op.slPrice,
          closedAt: new Date(),
          durationSeconds: Math.round(
            (Date.now() - new Date(op.openedAt).getTime()) / 1000
          ),
        },
      });
    } catch {
      /* ignore */
    }
  }

  ctx.openPositions = ctx.openPositions.filter((p) => p.positionId !== op.positionId);

  // === Update the loss streak ===
  let newStreak = cfg.lastLossStreak || 0;
  if (profitUsd < 0) {
    newStreak += 1;
  } else if (profitUsd > 0) {
    newStreak = 0;
  }

  console.log(
    `[bot:${ctx.sessionToken}] CLOSE ${op.direction} ${op.symbol} ` +
    `@ ${exitPrice.toFixed(4)} profit=${profitPips.toFixed(1)}p ($${profitUsd.toFixed(2)}) reason=${reason} streak=${newStreak}/${cfg.maxLossStreak}`
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
    reason: reason === "TP"
      ? ctx.strategyMode === "single"
        ? `TP +$${(cfg.singleTpUsd ?? 10).toFixed(2)} (USD)`
        : "TP (3×SL)"
      : reason === "SHARED_SL"
      ? "SHARED ANCHOR SL — closed all pyramid trades"
      : reason === "SL"
      ? `SL -$${(cfg.singleSlUsd ?? 3).toFixed(2)} (USD)`
      : reason,
  });

  // === Instability-stop check ===
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
 * broker-side SL/TP hit, etc.).
 */
async function finalizeExternalClose(ctx: ActiveSession, cfg: any, op: OpenTrade) {
  if (op.tradeId.startsWith("external-")) return;

  const price = await getCurrentPrice(op.symbol, ctx.mt5Login);
  if (!price) return;

  const exitPrice = op.direction === "BUY" ? price.bid : price.ask;
  const pipValue = detectPipValue(exitPrice);
  const profitPips =
    (op.direction === "BUY"
      ? exitPrice - op.openPrice
      : op.openPrice - exitPrice) / pipValue;
  const profitUsd = profitPips * (cfg.lotSize * 100);

  // Determine close reason: TP if exitPrice is at/above (BUY) or at/below
  // (SELL) the tpPrice; SL otherwise.
  let reason: "TP" | "SHARED_SL" = "SHARED_SL";
  if (op.direction === "BUY" && exitPrice >= op.tpPrice) reason = "TP";
  if (op.direction === "SELL" && exitPrice <= op.tpPrice) reason = "TP";
  const status = reason === "TP" ? "CLOSED_TP" : "CLOSED_SL";

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
    reason: reason === "TP" ? "TP (broker)" : "SL/Shared SL (broker)",
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

/** Periodically sync open positions from the broker (catch-up safety net). */
export async function reconcilePositions() {
  for (const [, ctx] of activeSessions) {
    try {
      const brokerPositions = await getOpenPositions(ctx.mt5Login, ctx.metaApiAccountId);
      const stillOpenIds = new Set(brokerPositions.map((p) => p.id));
      const survived = ctx.openPositions.filter((op) => stillOpenIds.has(op.positionId));
      if (survived.length < ctx.openPositions.length) {
        ctx.openPositions = survived;
      }
    } catch {
      // ignore
    }
  }
}

if (typeof setInterval !== "undefined") {
  setInterval(async () => {
    for (const [token, ctx] of activeSessions) {
      try {
        await reconcilePositions(ctx, await db.botConfig.findUnique({ where: { sessionId: ctx.internalId } }) as any);
      } catch {}
    }
  }, 30_000);
}
