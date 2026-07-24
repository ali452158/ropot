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
  /** High-frequency mode: trade on every closed M1 candle (no waiting for wick revisit). */
  highFrequencyMode: boolean;
  botRunning: boolean;
  botStartedAt: string | null;
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
  timeExitMinutes: 2,
  minWickRatio: 0.5,
  maxSpreadPips: 3.0,
  highFrequencyMode: false,
  botRunning: false,
  botStartedAt: null,
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
