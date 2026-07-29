import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppStage = "activation" | "mt5-login" | "copyfactory-login" | "dashboard";

export type ActivationState = {
  code: string;
  status: "UNUSED" | "ACTIVE" | "EXPIRED" | "REVOKED" | null;
  activatedAt: string | null;
  expiresAt: string | null;
  deviceId: string;
};

export type MT5SessionState = {
  sessionId: string | null;
  mt5Login: string;
  mt5Server: string;
  connected: boolean;
  balance: number | null;
  currency: string;
  equity: number | null;
};

export type BotConfigState = {
  symbol: string;
  timeframe: string;
  lotSize: number;
  tpPips: number;
  slPips: number;
  autoTpSl: boolean;
  timeExitMinutes: number;
  minWickRatio: number;
  maxSpreadPips: number;
  /** High-frequency mode: trade on every closed M1 candle after wick touch. */
  highFrequencyMode: boolean;
  botRunning: boolean;
  botStartedAt: string | null;
  // === Simplified UI fields ===
  /** User-selected trade direction: BUY, SELL, or AUTO (trend-following). */
  tradeDirection: "BUY" | "SELL" | "AUTO";
  /** Max concurrent open positions in HF mode. */
  maxOpenPositions: number;
  /** Consecutive losses that triggers auto-stop ("market unstable"). */
  maxLossStreak: number;
  /** Current consecutive-loss counter (reset on any win). */
  lastLossStreak: number;
  /** True when the bot auto-stopped itself due to instability. */
  instabilityStop: boolean;
  // === Pyramid strategy fields ===
  /** Floating USD profit at which to add one more trade to the pyramid. */
  pyramidProfitUsd: number;
  /** Max simultaneous trades in a pyramid. */
  pyramidMaxTrades: number;
  /** How many trades to open on the initial pyramid signal. */
  pyramidAnchorCount: number;
  // === Single-trade strategy fields (used for non-XAUUSD pairs) ===
  /** Strategy mode: "pyramid" (classic XAUUSD), "single" (USD-based SL/TP),
   *  "multi" (multiple concurrent independent trades), or "swing-single"
   *  (single trade with SL/TP from M5 support/resistance zones). */
  strategyMode: "pyramid" | "single" | "multi" | "swing-single";
  /** SL threshold in USD — bot closes when floating P/L <= -singleSlUsd. */
  singleSlUsd: number;
  /** TP threshold in USD — bot closes when floating P/L >= +singleTpUsd. */
  singleTpUsd: number;
  // === Multi-trade strategy fields ===
  /** Max concurrent open trades in multi mode (default 4). */
  multiMaxTrades?: number;
  // === Swing-single strategy fields ===
  /** Higher timeframe for S/R detection (default "M5"). */
  swingSrTimeframe?: string;
  /** Number of candles to scan for S/R detection (default 50). */
  swingSrLookback?: number;
  /** Min SL distance in pips (avoid tiny stops in tight ranges). */
  swingMinSlPips?: number;
  /** Min TP distance in pips (ensures meaningful target). */
  swingMinTpPips?: number;
  /** Min R:R ratio (reject trades with worse reward:risk). */
  swingMinRrRatio?: number;
  /** Max SL distance in pips (avoid wide stops). */
  swingMaxSlPips?: number;
  // === Trailing strategy fields (server-side only; UI doesn't expose these) ===
  strategyType: "trailing" | "wick";
  autoPairScan: boolean;
  scanSymbols: string;
  atrPeriod: number;
  atrMultiplier: number;
  emaFast: number;
  emaSlow: number;
  minAtrPrice: number;
  breakevenAtr: number;
  maxTradeMinutes: number;
  lastScanWinner: string | null;
};

export type Trade = {
  id: string;
  symbol: string;
  direction: "BUY" | "SELL";
  lotSize: number;
  entryPrice: number;
  exitPrice: number | null;
  tpPrice: number | null;
  slPrice: number | null;
  wickPrice: number | null;
  profitPips: number | null;
  profitUsd: number | null;
  status:
    | "OPEN"
    | "CLOSED_TP"
    | "CLOSED_SL"
    | "CLOSED_TIME"
    | "CLOSED_MANUAL"
    | "ERROR";
  openedAt: string;
  closedAt: string | null;
  durationSeconds: number | null;
};

type AppState = {
  stage: AppStage;
  activation: ActivationState;
  mt5: MT5SessionState;
  botConfig: BotConfigState;
  trades: Trade[];
  lastTickPrice: number | null;
  botLog: { ts: number; level: "info" | "warn" | "error" | "trade"; msg: string }[];

  setStage: (stage: AppStage) => void;
  setActivation: (a: Partial<ActivationState>) => void;
  setMT5: (m: Partial<MT5SessionState>) => void;
  setBotConfig: (b: Partial<BotConfigState>) => void;
  setTrades: (t: Trade[]) => void;
  addTrade: (t: Trade) => void;
  updateTrade: (id: string, patch: Partial<Trade>) => void;
  setLastTickPrice: (p: number) => void;
  pushLog: (entry: { level: "info" | "warn" | "error" | "trade"; msg: string }) => void;
  reset: () => void;
};

const defaultActivation: ActivationState = {
  code: "",
  status: null,
  activatedAt: null,
  expiresAt: null,
  deviceId: "",
};

const defaultMT5: MT5SessionState = {
  sessionId: null,
  mt5Login: "",
  mt5Server: "",
  connected: false,
  balance: null,
  currency: "USD",
  equity: null,
};

const defaultBotConfig: BotConfigState = {
  symbol: "XAUUSD",
  timeframe: "M1",
  lotSize: 0.01,
  tpPips: 10,
  slPips: 7,
  autoTpSl: true,
  timeExitMinutes: 1,
  minWickRatio: 0.5,
  maxSpreadPips: 3.0,
  highFrequencyMode: true,
  botRunning: false,
  botStartedAt: null,
  // === Simplified UI defaults ===
  tradeDirection: "AUTO",
  maxOpenPositions: 3,
  maxLossStreak: 5,
  lastLossStreak: 0,
  instabilityStop: false,
  // === Pyramid strategy defaults ===
  pyramidProfitUsd: 2.0,
  pyramidMaxTrades: 6,
  pyramidAnchorCount: 2,
  // === Single-trade strategy defaults (for non-XAUUSD pairs) ===
  strategyMode: "pyramid",
  singleSlUsd: 3.0,
  singleTpUsd: 10.0,
  // === Trailing defaults (kept for the engine; not exposed in the simplified UI) ===
  strategyType: "trailing",
  autoPairScan: false,
  scanSymbols: "XAUUSD",
  atrPeriod: 14,
  atrMultiplier: 1.5,
  emaFast: 9,
  emaSlow: 21,
  minAtrPrice: 0.1,
  breakevenAtr: 0.8,
  maxTradeMinutes: 1,
  lastScanWinner: null,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      stage: "activation",
      activation: defaultActivation,
      mt5: defaultMT5,
      botConfig: defaultBotConfig,
      trades: [],
      lastTickPrice: null,
      botLog: [],

      setStage: (stage) => set({ stage }),
      setActivation: (a) => set((s) => ({ activation: { ...s.activation, ...a } })),
      setMT5: (m) => set((s) => ({ mt5: { ...s.mt5, ...m } })),
      setBotConfig: (b) => set((s) => ({ botConfig: { ...s.botConfig, ...b } })),
      setTrades: (t) => set({ trades: t }),
      addTrade: (t) => set((s) => ({ trades: [t, ...s.trades].slice(0, 100) })),
      updateTrade: (id, patch) =>
        set((s) => ({
          trades: s.trades.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      setLastTickPrice: (p) => set({ lastTickPrice: p }),
      pushLog: (entry) =>
        set((s) => ({
          botLog: [...s.botLog, { ts: Date.now(), ...entry }].slice(-200),
        })),
      reset: () =>
        set({
          stage: "activation",
          activation: defaultActivation,
          mt5: defaultMT5,
          botConfig: defaultBotConfig,
          trades: [],
          botLog: [],
          lastTickPrice: null,
        }),
    }),
    {
      name: "alfa-reports-store",
      partialize: (s) => ({
        stage: s.stage,
        activation: s.activation,
        mt5: s.mt5,
        botConfig: s.botConfig,
      }),
    }
  )
);
