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
