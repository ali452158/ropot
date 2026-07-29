/**
 * ALFA Reports — Trading Engine (Wick-to-Wick Rejection Strategy)
 *
 * Strategy (as specified by the operator — DO NOT MODIFY):
 *
 *   1. Monitor gold (XAUUSD) candles on M1 in real time (tick by tick).
 *   2. Detect a candle that formed a "long wick" — the wick must be >= 50% of
 *      the total candle range (high - low). A long lower wick means sellers
 *      pushed price down hard, but buyers rejected that price strongly.
 *   3. Trigger (delivery): on the next candle (or same candle), if price
 *      returns to touch the tip of that lower wick again, the bot confirms
 *      there is strong support there.
 *   4. Execute: at the millisecond price touches the wick tip, the bot opens
 *      a BUY trade. (Mirror for SELL on upper wick.)
 *   5. Condition: only enter if spread is low (configurable maxSpreadPips)
 *      so the bot doesn't start at a loss.
 *
 * Risk management (as specified):
 *   - TP = 10 pips (XAUUSD: 1 pip = $0.10 move; 10 pips = $1.00 move)
 *   - SL = 7 pips (placed just behind the wick)
 *   - Time exit: if 2 minutes pass without hitting TP or SL, close the trade.
 *   - Win rate target: 65-70%.
 */

export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type WickSignal = {
  type: "LOWER_WICK" | "UPPER_WICK" | "NONE";
  wickTip: number; // the exact price at the tip of the wick
  candleTime: string;
  wickRatio: number; // wick length / candle range
  bodySize: number;
};

export type TradeSignal = {
  action: "BUY" | "SELL" | "HOLD";
  reason: string;
  wickTip: number | null;
  entryPrice: number | null;
  tpPrice: number | null;
  slPrice: number | null;
};

/** Gold pip = $0.10 (one decimal point). Most brokers quote XAUUSD to 2 decimals. */
export const PIP_VALUE_XAUUSD = 0.1;

/**
 * Detect a wick-rejection signal on a single candle.
 * A candle has a long lower wick if:
 *   - The lower wick (min(open, close) - low) is >= minWickRatio of the total range.
 *   - The body is small enough relative to the wick (we check wickRatio >= threshold).
 */
export function detectWick(candle: Candle, minWickRatio = 0.5): WickSignal {
  const range = candle.high - candle.low;
  if (range <= 0) {
    return {
      type: "NONE",
      wickTip: 0,
      candleTime: candle.time,
      wickRatio: 0,
      bodySize: 0,
    };
  }
  const bodySize = Math.abs(candle.close - candle.open);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerRatio = lowerWick / range;
  const upperRatio = upperWick / range;

  if (lowerRatio >= minWickRatio) {
    return {
      type: "LOWER_WICK",
      wickTip: candle.low,
      candleTime: candle.time,
      wickRatio: lowerRatio,
      bodySize,
    };
  }
  if (upperRatio >= minWickRatio) {
    return {
      type: "UPPER_WICK",
      wickTip: candle.high,
      candleTime: candle.time,
      wickRatio: upperRatio,
      bodySize,
    };
  }
  return {
    type: "NONE",
    wickTip: 0,
    candleTime: candle.time,
    wickRatio: Math.max(lowerRatio, upperRatio),
    bodySize,
  };
}

/**
 * Decide whether to enter a trade based on the last 2-3 candles + current tick.
 *
 * Logic:
 *   - Look at the previous candle (closed). Did it form a wick?
 *   - On the current tick, did price revisit the wick tip (within a tiny tolerance)?
 *   - If yes, fire the trade.
 */
export function evaluateEntry(
  candles: Candle[],
  currentBid: number,
  currentAsk: number,
  config: {
    minWickRatio: number;
    tpPips: number;
    slPips: number;
    maxSpreadPips: number;
    pipValue: number;
  }
): TradeSignal {
  if (candles.length < 2) {
    return { action: "HOLD", reason: "Not enough candles", wickTip: null, entryPrice: null, tpPrice: null, slPrice: null };
  }
  const spread = (currentAsk - currentBid) / config.pipValue;
  if (spread > config.maxSpreadPips) {
    return {
      action: "HOLD",
      reason: `Spread ${spread.toFixed(2)} pips > max ${config.maxSpreadPips} pips`,
      wickTip: null,
      entryPrice: null,
      tpPrice: null,
      slPrice: null,
    };
  }
  // Use the most recent CLOSED candle (second-to-last in most feeds).
  const signalCandle = candles[candles.length - 2];
  const signal = detectWick(signalCandle, config.minWickRatio);
  if (signal.type === "NONE") {
    return {
      action: "HOLD",
      reason: `No wick rejection (ratio ${signal.wickRatio.toFixed(2)} < ${config.minWickRatio})`,
      wickTip: null,
      entryPrice: null,
      tpPrice: null,
      slPrice: null,
    };
  }

  const tolerance = config.pipValue * 0.5; // half a pip tolerance

  if (signal.type === "LOWER_WICK") {
    // Expect BUY: price should revisit the lower wick tip.
    const touched = currentBid <= signal.wickTip + tolerance && currentBid >= signal.wickTip - tolerance * 4;
    if (touched) {
      const entry = currentAsk;
      const slPrice = entry - config.slPips * config.pipValue;
      const tpPrice = entry + config.tpPips * config.pipValue;
      return {
        action: "BUY",
        reason: `Lower wick rejection @ ${signal.wickTip.toFixed(2)} (ratio ${(signal.wickRatio * 100).toFixed(0)}%)`,
        wickTip: signal.wickTip,
        entryPrice: entry,
        tpPrice,
        slPrice,
      };
    }
  }

  if (signal.type === "UPPER_WICK") {
    // Expect SELL: price should revisit the upper wick tip.
    const touched = currentAsk >= signal.wickTip - tolerance && currentAsk <= signal.wickTip + tolerance * 4;
    if (touched) {
      const entry = currentBid;
      const slPrice = entry + config.slPips * config.pipValue;
      const tpPrice = entry - config.tpPips * config.pipValue;
      return {
        action: "SELL",
        reason: `Upper wick rejection @ ${signal.wickTip.toFixed(2)} (ratio ${(signal.wickRatio * 100).toFixed(0)}%)`,
        wickTip: signal.wickTip,
        entryPrice: entry,
        tpPrice,
        slPrice,
      };
    }
  }

  return {
    action: "HOLD",
    reason: `Wick detected (${signal.type}) but price hasn't revisited the tip yet. Current bid ${currentBid.toFixed(2)} vs tip ${signal.wickTip.toFixed(2)}`,
    wickTip: signal.wickTip,
    entryPrice: null,
    tpPrice: null,
    slPrice: null,
  };
}

/** Check an open position against TP / SL / time exit. Returns exit reason or null. */
export function checkExit(
  position: {
    direction: "BUY" | "SELL";
    openPrice: number;
    tpPrice?: number | null;
    slPrice?: number | null;
    openedAt: string;
  },
  currentBid: number,
  currentAsk: number,
  timeExitMinutes: number
): { exit: boolean; reason: "TP" | "SL" | "TIME" | null; exitPrice?: number } {
  const now = Date.now();
  const elapsed = (now - new Date(position.openedAt).getTime()) / 1000; // seconds

  if (position.direction === "BUY") {
    // BUY exits on bid
    if (position.tpPrice != null && currentBid >= position.tpPrice) {
      return { exit: true, reason: "TP", exitPrice: position.tpPrice };
    }
    if (position.slPrice != null && currentBid <= position.slPrice) {
      return { exit: true, reason: "SL", exitPrice: position.slPrice };
    }
  } else {
    // SELL exits on ask
    if (position.tpPrice != null && currentAsk <= position.tpPrice) {
      return { exit: true, reason: "TP", exitPrice: position.tpPrice };
    }
    if (position.slPrice != null && currentAsk >= position.slPrice) {
      return { exit: true, reason: "SL", exitPrice: position.slPrice };
    }
  }

  if (elapsed >= timeExitMinutes * 60) {
    const exitPrice = position.direction === "BUY" ? currentBid : currentAsk;
    return { exit: true, reason: "TIME", exitPrice };
  }

  return { exit: false, reason: null };
}

/** Calculate profit in pips for a closed trade. */
export function calculateProfitPips(
  direction: "BUY" | "SELL",
  entryPrice: number,
  exitPrice: number,
  pipValue = PIP_VALUE_XAUUSD
): number {
  const diff = direction === "BUY" ? exitPrice - entryPrice : entryPrice - exitPrice;
  return diff / pipValue;
}

/* ===========================================================================
 *  HIGH-FREQUENCY MODE — "trade every M1 candle"
 * ===========================================================================
 *
 * Operator option: when highFrequencyMode = true, the bot opens a trade at
 * EVERY newly-closed M1 candle — it does NOT wait for price to revisit the
 * wick tip. This produces a much higher trade cadence (one trade per minute
 * on M1) at the cost of a slightly lower per-trade win rate.
 *
 * Direction logic per closed candle:
 *   1. If a long lower wick is detected (>= minWickRatio) → BUY (buyers
 *      rejected the low).
 *   2. Else if a long upper wick is detected (>= minWickRatio) → SELL
 *      (sellers rejected the high).
 *   3. Else fall back to momentum: if close > open → BUY, else SELL.
 *
 * Risk management (TP/SL/time-exit) is identical to the standard mode and
 * is still applied by checkExit() on every tick. The only thing HF mode
 * changes is the *entry trigger*: it fires on candle close instead of
 * waiting for a wick-tip revisit.
 *
 * The caller is responsible for ensuring evaluateHighFrequencyEntry is
 * invoked at most ONCE per candle (track the last-traded candle time).
 * ===========================================================================*/

export type HighFrequencySignal = {
  action: "BUY" | "SELL" | "HOLD";
  reason: string;
  wickTip: number | null;
  candleTime: string | null;
  entryPrice: number | null;
  tpPrice: number | null;
  slPrice: number | null;
};

/**
 * Evaluate a high-frequency entry on a freshly-closed candle.
 *
 * @param lastClosedCandle  The most recent CLOSED candle (candles[len-2] from a typical feed).
 * @param currentBid        Current bid tick.
 * @param currentAsk        Current ask tick.
 * @param config            Same config object used by evaluateEntry.
 */
export function evaluateHighFrequencyEntry(
  lastClosedCandle: Candle,
  currentBid: number,
  currentAsk: number,
  config: {
    minWickRatio: number;
    tpPips: number;
    slPips: number;
    maxSpreadPips: number;
    pipValue: number;
  }
): HighFrequencySignal {
  // Spread guard — never enter when spread is too wide (we'd start at a loss).
  const spread = (currentAsk - currentBid) / config.pipValue;
  if (spread > config.maxSpreadPips) {
    return {
      action: "HOLD",
      reason: `Spread ${spread.toFixed(2)} pips > max ${config.maxSpreadPips} pips (HF)`,
      wickTip: null,
      candleTime: lastClosedCandle.time,
      entryPrice: null,
      tpPrice: null,
      slPrice: null,
    };
  }

  const signal = detectWick(lastClosedCandle, config.minWickRatio);
  const range = lastClosedCandle.high - lastClosedCandle.low;

  // Case 1 — long lower wick → BUY immediately (no waiting for revisit).
  if (signal.type === "LOWER_WICK") {
    const entry = currentAsk;
    const slPrice = entry - config.slPips * config.pipValue;
    const tpPrice = entry + config.tpPips * config.pipValue;
    return {
      action: "BUY",
      reason: `HF: lower wick ${(signal.wickRatio * 100).toFixed(0)}% @ ${signal.wickTip.toFixed(2)} → BUY`,
      wickTip: signal.wickTip,
      candleTime: lastClosedCandle.time,
      entryPrice: entry,
      tpPrice,
      slPrice,
    };
  }

  // Case 2 — long upper wick → SELL immediately.
  if (signal.type === "UPPER_WICK") {
    const entry = currentBid;
    const slPrice = entry + config.slPips * config.pipValue;
    const tpPrice = entry - config.tpPips * config.pipValue;
    return {
      action: "SELL",
      reason: `HF: upper wick ${(signal.wickRatio * 100).toFixed(0)}% @ ${signal.wickTip.toFixed(2)} → SELL`,
      wickTip: signal.wickTip,
      candleTime: lastClosedCandle.time,
      entryPrice: entry,
      tpPrice,
      slPrice,
    };
  }

  // Case 3 — no significant wick → momentum fallback (close vs open).
  // Only fire if the candle has a non-trivial body (>= 1 pip); otherwise skip
  // to avoid trading on a flat / doji candle.
  const body = Math.abs(lastClosedCandle.close - lastClosedCandle.open);
  if (range > 0 && body >= config.pipValue) {
    const bullish = lastClosedCandle.close > lastClosedCandle.open;
    if (bullish) {
      const entry = currentAsk;
      const slPrice = entry - config.slPips * config.pipValue;
      const tpPrice = entry + config.tpPips * config.pipValue;
      return {
        action: "BUY",
        reason: `HF: momentum BUY (close ${lastClosedCandle.close.toFixed(2)} > open ${lastClosedCandle.open.toFixed(2)})`,
        wickTip: null,
        candleTime: lastClosedCandle.time,
        entryPrice: entry,
        tpPrice,
        slPrice,
      };
    } else {
      const entry = currentBid;
      const slPrice = entry + config.slPips * config.pipValue;
      const tpPrice = entry - config.tpPips * config.pipValue;
      return {
        action: "SELL",
        reason: `HF: momentum SELL (close ${lastClosedCandle.close.toFixed(2)} < open ${lastClosedCandle.open.toFixed(2)})`,
        wickTip: null,
        candleTime: lastClosedCandle.time,
        entryPrice: entry,
        tpPrice,
        slPrice,
      };
    }
  }

  return {
    action: "HOLD",
    reason: `HF: doji candle (range ${range.toFixed(2)}, body ${body.toFixed(2)}) — skipped`,
    wickTip: null,
    candleTime: lastClosedCandle.time,
    entryPrice: null,
    tpPrice: null,
    slPrice: null,
  };
}

/**
 * Detect whether the latest candle from the feed is a "new" closed candle
 * that we have not traded on yet.
 *
 * @param candles          Full candle array (last item is the in-progress candle).
 * @param lastTradedTime   ISO time string of the last candle we already acted on (or null).
 * @returns The freshly-closed candle, or null if no new closed candle since lastTradedTime.
 */
export function pickNewClosedCandle(
  candles: Candle[],
  lastTradedTime: string | null
): Candle | null {
  if (candles.length < 2) return null;
  // The closed candle is second-to-last; the last is the still-forming one.
  const closed = candles[candles.length - 2];
  if (!closed || !closed.time) return null;
  if (lastTradedTime && closed.time <= lastTradedTime) return null;
  return closed;
}

/* ===========================================================================
 *  TRAILING STRATEGY ENGINE
 * ===========================================================================
 *
 * Strategy summary (as requested by the operator):
 *
 *   "selects a pair → auto-enters → auto-exits on a trailing strategy"
 *
 * The trailing engine works as follows:
 *
 *   1. AUTO PAIR SELECTION (scan mode)
 *      - For each candidate symbol (default list: XAUUSD, EURUSD, GBPUSD,
 *        USDJPY, AUDUSD, USDCAD, XAGUSD), compute ATR + EMA-fast + EMA-slow
 *        on the configured timeframe.
 *      - Score each symbol by:
 *          (a) ATR must be >= minAtrPrice (volatility filter — skip dead pairs).
 *          (b) Spread must be <= maxSpreadPips (don't enter on wide spreads).
 *          (c) |EMA-fast − EMA-slow| / ATR as the trend-strength score.
 *      - Pick the symbol with the highest score that also has a clean trend
 *        alignment (fast above slow → BUY candidate; fast below slow → SELL
 *        candidate). If none qualifies, return HOLD for this tick.
 *
 *   2. AUTO ENTRY
 *      - Direction = sign(EMA-fast − EMA-slow).
 *      - Entry price = current ask (BUY) or bid (SELL).
 *      - Initial stop loss = entry − atrMultiplier * ATR (BUY) or
 *                            entry + atrMultiplier * ATR (SELL).
 *      - No fixed TP — the engine uses a TRAILING stop instead.
 *
 *   3. AUTO EXIT (trailing)
 *      - On every tick the engine recomputes a "trail price":
 *          BUY : trail = currentBid − atrMultiplier * ATR
 *          SELL: trail = currentAsk + atrMultiplier * ATR
 *      - The SL is moved to `max(previousSL, trail)` for BUY
 *        (or `min(previousSL, trail)` for SELL). SL only moves in the
 *        favorable direction — it never moves backwards.
 *      - BREAKEVEN: once price has moved >= breakevenAtr * ATR in our favor,
 *        the SL is pushed to the entry price (locks the trade from loss).
 *      - Hard time stop: if maxTradeMinutes is exceeded, close at market.
 *
 * Indicators used:
 *   - ATR(14) — Average True Range for trailing distance + volatility filter.
 *   - EMA(9)  — fast trend line.
 *   - EMA(21) — slow trend line.
 *
 * Per-symbol pip values differ (XAUUSD pip = $0.10, EURUSD pip = $0.0001,
 * USDJPY pip = $0.01, etc.) — the engine auto-detects the pip value by
 * checking the digit count of the current price (5-digit → 0.0001, 3-digit
 * → 0.01, 2-digit → 0.01 for gold/silver).
 * =========================================================================*/

export type TrailingConfig = {
  atrPeriod: number;       // typical: 14
  atrMultiplier: number;   // typical: 1.5
  emaFast: number;         // typical: 9
  emaSlow: number;         // typical: 21
  minAtrPrice: number;     // skip symbols below this ATR (price units)
  maxSpreadPips: number;   // skip symbols whose spread exceeds this (pips)
  breakevenAtr: number;    // move SL to entry once this much in profit (ATRs)
  maxTradeMinutes: number; // hard time stop
  lotSize: number;
};

export type TrailingSignal = {
  action: "BUY" | "SELL" | "HOLD";
  reason: string;
  symbol: string;
  entryPrice: number | null;
  stopLoss: number | null;
  atr: number | null;
  emaFast: number | null;
  emaSlow: number | null;
  score: number;
};

/** Compute Average True Range (ATR) over the last N candles. */
export function computeATR(candles: Candle[], period: number): number | null {
  if (candles.length < period + 1) return null;
  // True Range = max(high-low, |high-prevClose|, |low-prevClose|)
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
    trs.push(tr);
  }
  // Simple moving average of the last `period` TRs (good enough for trailing).
  const slice = trs.slice(-period);
  if (slice.length === 0) return null;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/** Compute Exponential Moving Average over the close prices. */
export function computeEMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  // Seed with SMA of the first `period` values.
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Auto-detect the pip value for a symbol based on its current price.
 *
 * Conventions:
 *   - Gold (XAUUSD ~ 2000-3000, 2 decimal places) → pip = 0.1
 *   - Silver (XAGUSD ~ 20-50) → pip = 0.01
 *   - JPY pairs (~ 100-200) → pip = 0.01
 *   - 5-digit forex (EURUSD, GBPUSD, etc.) → pip = 0.0001
 *   - 4-digit forex (~ 0.5-2.0) → pip = 0.0001
 *
 * To distinguish gold (>=100, pip=0.1) from JPY pairs (>=100, pip=0.01),
 * we use a simple heuristic: prices >= 1000 are gold (or index), prices
 * in [100, 1000) are typically JPY pairs.
 */
export function detectPipValue(price: number): number {
  if (price <= 0) return 0.0001;
  // Gold (XAUUSD ~ 1000-5000) → pip = 0.1
  if (price >= 1000) return 0.1;
  // JPY pairs (~ 100-200) and Silver (XAGUSD ~ 20-50) → pip = 0.01
  if (price >= 10) return 0.01;
  // 5-digit forex (~ 0.5-2.0) → pip = 0.0001
  if (price >= 1) return 0.0001;
  // Very small prices (crypto, etc.) → 0.0001
  return 0.0001;
}

/** Evaluate one symbol's trailing entry signal. */
export function evaluateTrailingEntry(
  symbol: string,
  candles: Candle[],
  currentBid: number,
  currentAsk: number,
  cfg: TrailingConfig
): TrailingSignal {
  const empty: TrailingSignal = {
    action: "HOLD",
    reason: "",
    symbol,
    entryPrice: null,
    stopLoss: null,
    atr: null,
    emaFast: null,
    emaSlow: null,
    score: 0,
  };
  if (candles.length < Math.max(cfg.atrPeriod + 1, cfg.emaSlow + 1)) {
    return { ...empty, reason: `Not enough candles (${candles.length})` };
  }
  const atr = computeATR(candles, cfg.atrPeriod);
  if (atr == null || atr <= 0) {
    return { ...empty, reason: "ATR computation failed" };
  }
  // Volatility filter — skip "dead" pairs.
  if (atr < cfg.minAtrPrice) {
    return {
      ...empty,
      atr,
      reason: `ATR ${atr.toFixed(4)} < min ${cfg.minAtrPrice} (too quiet)`,
    };
  }
  // Spread filter — never enter on a wide spread.
  const pipValue = detectPipValue(currentAsk);
  const spreadPips = (currentAsk - currentBid) / pipValue;
  if (spreadPips > cfg.maxSpreadPips) {
    return {
      ...empty,
      atr,
      reason: `Spread ${spreadPips.toFixed(2)}p > max ${cfg.maxSpreadPips}p`,
    };
  }
  // Trend detection.
  const closes = candles.map((c) => c.close);
  const emaFast = computeEMA(closes, cfg.emaFast);
  const emaSlow = computeEMA(closes, cfg.emaSlow);
  if (emaFast == null || emaSlow == null) {
    return { ...empty, atr, reason: "EMA computation failed" };
  }
  // Trend strength score = |fast-slow| / ATR. Higher = stronger trend.
  const diff = emaFast - emaSlow;
  const score = Math.abs(diff) / atr;
  // Require minimum score so we only enter on a real trend, not a flat line.
  if (score < 0.15) {
    return {
      ...empty,
      atr,
      emaFast,
      emaSlow,
      score,
      reason: `Trend too weak (score ${score.toFixed(2)} < 0.15)`,
    };
  }
  // Direction from EMA alignment.
  const direction: "BUY" | "SELL" = diff > 0 ? "BUY" : "SELL";
  const entry = direction === "BUY" ? currentAsk : currentBid;
  const stopDistance = cfg.atrMultiplier * atr;
  const stopLoss =
    direction === "BUY" ? entry - stopDistance : entry + stopDistance;
  return {
    action: direction,
    reason: `Trailing ${direction} — EMA-fast ${emaFast.toFixed(4)} ${
      direction === "BUY" ? ">" : "<"
    } EMA-slow ${emaSlow.toFixed(4)}, ATR=${atr.toFixed(4)}, score=${score.toFixed(2)}`,
    symbol,
    entryPrice: entry,
    stopLoss,
    atr,
    emaFast,
    emaSlow,
    score,
  };
}

/**
 * Trailing-stop exit evaluator.
 *
 * On every tick the bot calls this with the current state (entry, SL, atr,
 * openedAt) and the current bid/ask. Returns:
 *   - { exit: true, reason, exitPrice } if the position should be closed now.
 *   - { exit: false, newStopLoss } if the SL should be moved (trail / BE).
 *        `newStopLoss` is null when no update is needed.
 */
export function evaluateTrailingExit(
  position: {
    direction: "BUY" | "SELL";
    openPrice: number;
    currentStopLoss: number;
    atr: number;
    openedAt: string;
  },
  currentBid: number,
  currentAsk: number,
  cfg: TrailingConfig
): {
  exit: boolean;
  reason: "SL_HIT" | "TIME" | null;
  exitPrice?: number;
  newStopLoss?: number | null;
} {
  const now = Date.now();
  const elapsedSec = (now - new Date(position.openedAt).getTime()) / 1000;

  // 1) Hard time stop — never let a trailing trade hang forever.
  if (elapsedSec >= cfg.maxTradeMinutes * 60) {
    return {
      exit: true,
      reason: "TIME",
      exitPrice: position.direction === "BUY" ? currentBid : currentAsk,
    };
  }

  const { direction, openPrice, currentStopLoss, atr } = position;
  const stopDistance = cfg.atrMultiplier * atr;

  // 2) Trailing stop — compute the new candidate SL.
  let candidateSl: number;
  if (direction === "BUY") {
    candidateSl = currentBid - stopDistance;
    // Breakeven: if price has moved >= breakevenAtr * ATR in our favor,
    // push the SL to entry (or higher if the trailing SL is already higher).
    const favorableMove = currentBid - openPrice;
    if (favorableMove >= cfg.breakevenAtr * atr) {
      candidateSl = Math.max(candidateSl, openPrice);
    }
    // SL only moves UP for BUY (never backwards).
    const newSl = Math.max(currentStopLoss, candidateSl);
    // 3) Stop-loss hit?
    if (currentBid <= newSl) {
      return { exit: true, reason: "SL_HIT", exitPrice: newSl };
    }
    return {
      exit: false,
      reason: null,
      newStopLoss: newSl > currentStopLoss ? newSl : null,
    };
  } else {
    // SELL
    candidateSl = currentAsk + stopDistance;
    const favorableMove = openPrice - currentAsk;
    if (favorableMove >= cfg.breakevenAtr * atr) {
      candidateSl = Math.min(candidateSl, openPrice);
    }
    // SL only moves DOWN for SELL (never backwards).
    const newSl = Math.min(currentStopLoss, candidateSl);
    if (currentAsk >= newSl) {
      return { exit: true, reason: "SL_HIT", exitPrice: newSl };
    }
    return {
      exit: false,
      reason: null,
      newStopLoss: newSl < currentStopLoss ? newSl : null,
    };
  }
}

/* ===========================================================================
 *  SUPPORT / RESISTANCE DETECTION (for swing-single strategy)
 * ===========================================================================
 *
 * Simple, robust S/R detection over the last N M5 candles:
 *   1. Find local highs/lows (swing pivots): a candle is a pivot high if its
 *      high is greater than the `window` candles on each side.
 *   2. Cluster pivots within `tolerancePips` of each other into a single
 *      level (stronger level = more touches).
 *   3. For BUY: SL = nearest support below entry, TP = nearest resistance
 *      above entry (validated by R:R ratio).
 *   4. For SELL: SL = nearest resistance above entry, TP = nearest support
 *      below entry.
 *
 * Returns:
 *   {
 *     supports:    number[],   // ascending order
 *     resistances: number[],   // ascending order
 *   }
 * ===========================================================================*/
export function detectSupportResistance(
  candles: Candle[],
  options: {
    pivotWindow?: number;     // candles on each side (default 3)
    tolerancePips?: number;   // cluster pivots within this many pips (default 5)
    pipValue: number;
    maxLevels?: number;       // keep top N strongest levels per side (default 5)
  } = { pipValue: 0.0001 }
): { supports: number[]; resistances: number[] } {
  const pivotWindow = options.pivotWindow ?? 3;
  const tolerancePips = options.tolerancePips ?? 5;
  const pipValue = options.pipValue;
  const maxLevels = options.maxLevels ?? 5;

  if (candles.length < 2 * pivotWindow + 1) {
    return { supports: [], resistances: [] };
  }

  // Find pivot highs and lows.
  const pivotHighs: { price: number; strength: number }[] = [];
  const pivotLows: { price: number; strength: number }[] = [];

  for (let i = pivotWindow; i < candles.length - pivotWindow; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = 1; j <= pivotWindow; j++) {
      if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
        isHigh = false;
      }
      if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
        isLow = false;
      }
    }
    if (isHigh) {
      pivotHighs.push({ price: candles[i].high, strength: 1 });
    }
    if (isLow) {
      pivotLows.push({ price: candles[i].low, strength: 1 });
    }
  }

  // Cluster nearby pivots (within tolerancePips * pipValue price distance).
  const tolerancePrice = tolerancePips * pipValue;
  const cluster = (pivots: { price: number; strength: number }[]): { price: number; strength: number }[] => {
    if (pivots.length === 0) return [];
    const sorted = [...pivots].sort((a, b) => a.price - b.price);
    const clusters: { price: number; strength: number; sum: number; count: number }[] = [];
    for (const p of sorted) {
      const last = clusters[clusters.length - 1];
      if (last && Math.abs(p.price - last.price) <= tolerancePrice) {
        last.sum += p.price;
        last.count += 1;
        last.price = last.sum / last.count;
        last.strength += 1;
      } else {
        clusters.push({ price: p.price, strength: 1, sum: p.price, count: 1 });
      }
    }
    // Sort by strength (most touches first), then by recency (we lost recency
    // info in clustering, so just keep strength).
    return clusters
      .sort((a, b) => b.strength - a.strength)
      .slice(0, maxLevels)
      .map((c) => ({ price: c.price, strength: c.strength }));
  };

  const clusteredHighs = cluster(pivotHighs);
  const clusteredLows = cluster(pivotLows);

  // Sort for lookup: highs as resistances (ascending), lows as supports (ascending)
  const resistances = clusteredHighs.map((p) => p.price).sort((a, b) => a - b);
  const supports = clusteredLows.map((p) => p.price).sort((a, b) => a - b);

  return { supports, resistances };
}

/**
 * Compute SL/TP for a swing-single entry based on M5 S/R levels.
 *
 * Returns null if no clear S/R level is found (signal should be skipped).
 *
 * For BUY:
 *   - SL = nearest support BELOW entry (or null if none below)
 *   - TP = nearest resistance ABOVE entry (or null if none above)
 *
 * For SELL:
 *   - SL = nearest resistance ABOVE entry
 *   - TP = nearest support BELOW entry
 *
 * The function applies min/max distance guards:
 *   - SL distance must be >= swingMinSlPips × pipValue
 *   - SL distance must be <= swingMaxSlPips × pipValue (avoid wide stops)
 *   - TP distance must be >= swingMinTpPips × pipValue
 *   - TP/SL ratio must be >= swingMinRrRatio
 */
export function computeSwingSLTP(
  entry: number,
  direction: "BUY" | "SELL",
  supports: number[],
  resistances: number[],
  options: {
    pipValue: number;
    swingMinSlPips: number;
    swingMinTpPips: number;
    swingMinRrRatio: number;
    swingMaxSlPips: number;
  }
): { slPrice: number; tpPrice: number; slPips: number; tpPips: number; rrRatio: number } | null {
  const {
    pipValue,
    swingMinSlPips,
    swingMinTpPips,
    swingMinRrRatio,
    swingMaxSlPips,
  } = options;

  let slPrice: number | null = null;
  let tpPrice: number | null = null;

  if (direction === "BUY") {
    // SL: nearest support strictly below entry
    const below = supports.filter((s) => s < entry);
    if (below.length === 0) return null;
    slPrice = below[below.length - 1]; // highest below entry (nearest)
    // TP: nearest resistance strictly above entry
    const above = resistances.filter((r) => r > entry);
    if (above.length === 0) return null;
    tpPrice = above[0]; // lowest above entry (nearest)
  } else {
    // SELL: SL = nearest resistance above entry
    const above = resistances.filter((r) => r > entry);
    if (above.length === 0) return null;
    slPrice = above[0]; // lowest above entry (nearest)
    // TP: nearest support strictly below entry
    const below = supports.filter((s) => s < entry);
    if (below.length === 0) return null;
    tpPrice = below[below.length - 1]; // highest below entry (nearest)
  }

  const slDist = Math.abs(entry - slPrice);
  const tpDist = Math.abs(tpPrice - entry);
  const slPips = slDist / pipValue;
  const tpPips = tpDist / pipValue;

  // Validate distance guards.
  if (slPips < swingMinSlPips) return null;
  if (slPips > swingMaxSlPips) return null;
  if (tpPips < swingMinTpPips) return null;
  const rrRatio = tpPips / Math.max(slPips, 0.0001);
  if (rrRatio < swingMinRrRatio) return null;

  return { slPrice, tpPrice, slPips, tpPips, rrRatio };
}
