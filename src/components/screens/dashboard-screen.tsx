"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, type Trade } from "@/lib/store";
import { AlfaLogo, AlfaWordmark } from "@/components/alfa-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Play,
  Square,
  TrendingUp,
  TrendingDown,
  Activity,
  Wallet,
  Gauge,
  Timer,
  Target,
  ShieldAlert,
  LogOut,
  RefreshCw,
  Zap,
  Cpu,
  Wifi,
  CheckCircle2,
  XCircle,
  Clock,
  CandlestickChart,
} from "lucide-react";

const FOREX_SYMBOLS = [
  { value: "XAUUSD", label: "XAUUSD — الذهب" },
  { value: "EURUSD", label: "EURUSD — اليورو/دولار" },
  { value: "GBPUSD", label: "GBPUSD — الجنيه/دولار" },
  { value: "USDJPY", label: "USDJPY — الدولار/ين" },
  { value: "AUDUSD", label: "AUDUSD — الدولار الأسترالي" },
  { value: "USDCAD", label: "USDCAD — الدولار الكندي" },
  { value: "NZDUSD", label: "NZDUSD — الدولار النيوزيلندي" },
  { value: "USDCHF", label: "USDCHF — الدولار الفرنك" },
  { value: "EURJPY", label: "EURJPY — اليورو/ين" },
  { value: "GBPJPY", label: "GBPJPY — الجنيه/ين" },
  { value: "XAGUSD", label: "XAGUSD — الفضة" },
  { value: "EURGBP", label: "EURGBP — اليورو/جنيه" },
  { value: "EURAUD", label: "EURAUD — اليورو/أسترالي" },
  { value: "AUDJPY", label: "AUDJPY — الأسترالي/ين" },
];

const TIMEFRAMES = [
  { value: "M1", label: "M1 — دقيقة (موصى به)" },
  { value: "M5", label: "M5 — 5 دقائق" },
  { value: "M15", label: "M15 — ربع ساعة" },
  { value: "M30", label: "M30 — نصف ساعة" },
  { value: "H1", label: "H1 — ساعة" },
];

export function DashboardScreen() {
  const { activation, mt5, botConfig, setBotConfig, reset, setMT5 } = useAppStore();
  const { toast } = useToast();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    totalPips: 0,
    openCount: 0,
  });
  const [tickPrice, setTickPrice] = useState<{ bid: number; ask: number } | null>(null);
  const [mode, setMode] = useState<"LIVE" | "SIMULATION">("SIMULATION");
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [candles, setCandles] = useState<any[]>([]);
  const [lastSignal, setLastSignal] = useState<string>("بانتظار إشارة...");

  // Refresh status (trades + stats)
  const refreshStatus = useCallback(async () => {
    if (!mt5.sessionId) return;
    try {
      const res = await fetch("/api/bot/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: mt5.sessionId }),
      });
      const data = await res.json();
      if (data.ok) {
        setTrades(data.trades);
        setStats(data.stats);
        if (data.botRunning !== botConfig.botRunning) {
          setBotConfig({ botRunning: data.botRunning });
        }
        if (typeof data.highFrequencyMode === "boolean" &&
            data.highFrequencyMode !== botConfig.highFrequencyMode) {
          setBotConfig({ highFrequencyMode: data.highFrequencyMode });
        }
      }
    } catch {}
  }, [mt5.sessionId, botConfig.botRunning, botConfig.highFrequencyMode, setBotConfig]);

  // Refresh market price + candles
  const refreshMarket = useCallback(async () => {
    try {
      const sid = mt5.sessionId ? `&sessionId=${encodeURIComponent(mt5.sessionId)}` : "";
      const [priceRes, candlesRes, modeRes] = await Promise.all([
        fetch(`/api/market/price?symbol=${botConfig.symbol}${sid}`),
        fetch(`/api/market/candles?symbol=${botConfig.symbol}&timeframe=${botConfig.timeframe}&limit=30${sid}`),
        fetch("/api/system/mode"),
      ]);
      const pData = await priceRes.json();
      const cData = await candlesRes.json();
      const mData = await modeRes.json();
      if (pData.ok) {
        setTickPrice({ bid: pData.tick.bid, ask: pData.tick.ask });
      }
      if (cData.ok) {
        setCandles(cData.candles);
      }
      if (mData.ok) {
        setMode(mData.mode);
      }
    } catch {}
  }, [botConfig.symbol, botConfig.timeframe]);

  // Initial load + intervals
  useEffect(() => {
    refreshStatus();
    refreshMarket();
    const statusTimer = setInterval(refreshStatus, 2000);
    const marketTimer = setInterval(refreshMarket, 1000);
    return () => {
      clearInterval(statusTimer);
      clearInterval(marketTimer);
    };
  }, [refreshStatus, refreshMarket]);

  // Update config on server
  const updateConfig = async (patch: any) => {
    setBotConfig(patch);
    if (!mt5.sessionId) return;
    try {
      await fetch("/api/bot/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: mt5.sessionId, ...patch }),
      });
    } catch {}
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      const res = await fetch("/api/bot/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: mt5.sessionId }),
      });
      const data = await res.json();
      if (data.ok) {
        setBotConfig({ botRunning: true, botStartedAt: new Date().toISOString() });
        toast({
          title: "تم تشغيل البوت",
          description: "البوت يلتقط الصفقات تلقائياً الآن على MT5",
        });
        setLastSignal("البوت يعمل — يراقب الشموع...");
      } else {
        toast({
          title: "فشل تشغيل البوت",
          description: data.error,
          variant: "destructive",
        });
      }
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      const res = await fetch("/api/bot/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: mt5.sessionId }),
      });
      const data = await res.json();
      if (data.ok) {
        setBotConfig({ botRunning: false });
        toast({
          title: "تم إيقاف البوت",
          description: "تم إغلاق جميع الصفقات المفتوحة",
        });
      }
    } finally {
      setStopping(false);
    }
  };

  const handleLogout = () => {
    reset();
    // Stay on the same page (will fall back to activation)
  };

  const daysLeft = activation.expiresAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(activation.expiresAt).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      )
    : 0;

  return (
    <div className="min-h-screen p-3 md:p-6">
      {/* Top bar */}
      <header className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <AlfaLogo size={44} />
          <AlfaWordmark subtitle={false} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            variant="outline"
            className={
              mode === "LIVE"
                ? "border-green-400/50 text-green-300 bg-green-500/10"
                : "border-amber-400/50 text-amber-300 bg-amber-500/10"
            }
          >
            <Wifi className="w-3 h-3 ml-1" />
            {mode === "LIVE" ? "LIVE — MT5 حقيقي" : "SIMULATION"}
          </Badge>
          <Badge
            variant="outline"
            className="border-cyan-400/40 text-cyan-300 bg-cyan-500/10"
          >
            <Clock className="w-3 h-3 ml-1" />
            {daysLeft} يوم
          </Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={handleLogout}
            className="border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200"
          >
            <LogOut className="w-4 h-4 ml-1" />
            خروج
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* === Left column: Bot config + controls === */}
        <div className="lg:col-span-4 space-y-4">
          {/* Account snapshot */}
          <Card className="glass-panel neon-border-soft">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-cyan-200 flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-cyan-400" />
                  حسابك على MT5
                </h3>
                <RefreshCw
                  className="w-4 h-4 text-cyan-400/50 cursor-pointer hover:text-cyan-300 animate-spin"
                  style={{ animationDuration: "3s" }}
                  onClick={refreshStatus}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <StatBox
                  label="الرقم"
                  value={mt5.mt5Login || "—"}
                  icon={<Cpu className="w-3 h-3" />}
                />
                <StatBox
                  label="السيرفر"
                  value={mt5.mt5Server || "—"}
                  icon={<Wifi className="w-3 h-3" />}
                />
                <StatBox
                  label="الرصيد"
                  value={`${mt5.balance?.toFixed(2) || "—"} ${mt5.currency}`}
                  icon={<Wallet className="w-3 h-3" />}
                  highlight
                />
                <StatBox
                  label="Equity"
                  value={`${mt5.equity?.toFixed(2) || "—"} ${mt5.currency}`}
                  icon={<Gauge className="w-3 h-3" />}
                />
              </div>
              <div className="mt-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20 px-3 py-2 text-[10px] leading-relaxed text-cyan-200/70 flex items-start gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-cyan-400" />
                <span>
                  أنت تتداول على <b className="text-cyan-200">حسابك الخاص</b> على MT5 —
                  البوت ينفّذ الصفقات مباشرة على حسابك، وكل مشترك يستخدم حسابه المستقل.
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Configuration */}
          <Card className="glass-panel neon-border-soft">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-sm font-bold text-cyan-200 flex items-center gap-1.5">
                <CandlestickChart className="w-4 h-4 text-cyan-400" />
                إعدادات البوت
              </h3>

              {/* Symbol */}
              <div className="space-y-1.5">
                <Label className="text-xs text-cyan-200/70">الزوج (فقط فوركس)</Label>
                <Select
                  value={botConfig.symbol}
                  onValueChange={(v) => updateConfig({ symbol: v })}
                  disabled={botConfig.botRunning}
                >
                  <SelectTrigger className="bg-black/40 border-cyan-500/30 text-cyan-50 font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-black/90 border-cyan-500/30 max-h-72">
                    {FOREX_SYMBOLS.map((s) => (
                      <SelectItem
                        key={s.value}
                        value={s.value}
                        className="text-cyan-100 focus:bg-cyan-500/20 focus:text-cyan-50"
                      >
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Timeframe */}
              <div className="space-y-1.5">
                <Label className="text-xs text-cyan-200/70">تايم فريم</Label>
                <Select
                  value={botConfig.timeframe}
                  onValueChange={(v) => updateConfig({ timeframe: v })}
                  disabled={botConfig.botRunning}
                >
                  <SelectTrigger className="bg-black/40 border-cyan-500/30 text-cyan-50 font-mono">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-black/90 border-cyan-500/30">
                    {TIMEFRAMES.map((t) => (
                      <SelectItem
                        key={t.value}
                        value={t.value}
                        className="text-cyan-100 focus:bg-cyan-500/20 focus:text-cyan-50"
                      >
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Lot */}
              <div className="space-y-1.5">
                <Label className="text-xs text-cyan-200/70">حجم اللوت</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={botConfig.lotSize}
                  onChange={(e) =>
                    updateConfig({ lotSize: parseFloat(e.target.value) || 0.01 })
                  }
                  disabled={botConfig.botRunning}
                  className="bg-black/40 border-cyan-500/30 text-cyan-50 font-mono"
                />
              </div>

              {/* Auto TP/SL toggle */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label className="text-xs text-cyan-200/70 block">
                    TP / SL تلقائي
                  </Label>
                  <span className="text-[10px] text-cyan-300/50">
                    10 نقاط ربح / 7 نقاط خسارة
                  </span>
                </div>
                <Switch
                  checked={botConfig.autoTpSl}
                  onCheckedChange={(v) => updateConfig({ autoTpSl: v })}
                  disabled={botConfig.botRunning}
                />
              </div>

              {/* High-Frequency mode toggle — trade every M1 candle close */}
              <div className="flex items-center justify-between py-2 rounded-lg bg-fuchsia-500/5 border border-fuchsia-500/20 px-3">
                <div>
                  <Label className="text-xs text-fuchsia-200/90 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-fuchsia-300" />
                    نمط التردد العالي (كل شمعة)
                  </Label>
                  <span className="text-[10px] text-fuchsia-300/60 block leading-tight mt-0.5">
                    يفتح صفقة عند كل إغلاق شمعة M1 — تداول سريع التردد.
                    الاتجاه يحدده Wick (أو الزخم افتراضياً).
                  </span>
                </div>
                <Switch
                  checked={botConfig.highFrequencyMode}
                  onCheckedChange={(v) => updateConfig({ highFrequencyMode: v })}
                  disabled={botConfig.botRunning}
                />
              </div>

              {/* Manual TP/SL */}
              {!botConfig.autoTpSl && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-green-300/70 flex items-center gap-1">
                      <Target className="w-3 h-3" /> TP (نقاط)
                    </Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={botConfig.tpPips}
                      onChange={(e) =>
                        updateConfig({ tpPips: parseFloat(e.target.value) || 10 })
                      }
                      disabled={botConfig.botRunning}
                      className="bg-black/40 border-green-500/30 text-green-100 font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-red-300/70 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" /> SL (نقاط)
                    </Label>
                    <Input
                      type="number"
                      step="0.1"
                      value={botConfig.slPips}
                      onChange={(e) =>
                        updateConfig({ slPips: parseFloat(e.target.value) || 7 })
                      }
                      disabled={botConfig.botRunning}
                      className="bg-black/40 border-red-500/30 text-red-100 font-mono"
                    />
                  </div>
                </div>
              )}

              <Separator className="bg-cyan-500/20" />

              {/* Start / Stop buttons */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={handleStart}
                  disabled={botConfig.botRunning || starting}
                  className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-bold neon-glow border-0 h-12"
                >
                  {starting ? (
                    <RefreshCw className="w-5 h-5 ml-2 animate-spin" />
                  ) : (
                    <Play className="w-5 h-5 ml-2" />
                  )}
                  تشغيل البوت
                </Button>
                <Button
                  onClick={handleStop}
                  disabled={!botConfig.botRunning || stopping}
                  variant="outline"
                  className="border-red-500/40 text-red-300 hover:bg-red-500/10 hover:text-red-200 font-bold h-12"
                >
                  {stopping ? (
                    <RefreshCw className="w-5 h-5 ml-2 animate-spin" />
                  ) : (
                    <Square className="w-5 h-5 ml-2" />
                  )}
                  إيقاف البوت
                </Button>
              </div>

              <div className="text-[10px] text-cyan-300/50 text-center leading-relaxed">
                عند التشغيل ينتقل البوت تلقائياً للعمل على MT5 (موبايل أو كمبيوتر)
                ويبدأ بالتقاط الصفقات دون تدخل منك.
              </div>
            </CardContent>
          </Card>
        </div>

        {/* === Middle column: Live chart + status === */}
        <div className="lg:col-span-5 space-y-4">
          {/* Live price */}
          <Card className="glass-panel neon-border-soft">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-cyan-200 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  سعر {botConfig.symbol} لحظياً
                </h3>
                <Badge
                  variant="outline"
                  className="border-cyan-400/40 text-cyan-300 bg-cyan-500/10 font-mono"
                >
                  {botConfig.timeframe}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-3">
                  <div className="text-[10px] text-red-300/70 mb-1">BID</div>
                  <div className="text-2xl font-mono font-bold text-red-300 neon-text-soft">
                    {tickPrice ? tickPrice.bid.toFixed(2) : "—"}
                  </div>
                </div>
                <div className="rounded-xl bg-green-500/5 border border-green-500/20 p-3">
                  <div className="text-[10px] text-green-300/70 mb-1">ASK</div>
                  <div className="text-2xl font-mono font-bold text-green-300 neon-text-soft">
                    {tickPrice ? tickPrice.ask.toFixed(2) : "—"}
                  </div>
                </div>
              </div>
              {tickPrice && (
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-cyan-200/60">
                    السبريد:{" "}
                    <span className="text-cyan-300 font-mono">
                      {((tickPrice.ask - tickPrice.bid) / 0.1).toFixed(2)}
                    </span>{" "}
                    نقطة
                  </span>
                  <span className="text-cyan-200/60 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-yellow-400" />
                    {botConfig.botRunning ? "البوت يعمل" : "البوت متوقف"}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Live candlestick chart */}
          <Card className="glass-panel neon-border-soft">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-cyan-200 flex items-center gap-1.5">
                  <CandlestickChart className="w-4 h-4 text-cyan-400" />
                  مخطط الشموع — Wick-to-Wick Detection
                </h3>
              </div>
              <LiveCandleChart candles={candles} minWickRatio={botConfig.minWickRatio} />
              <div className="mt-3 text-xs text-cyan-200/70 bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3 flex items-start gap-2">
                <Zap className="w-4 h-4 mt-0.5 text-yellow-400 shrink-0" />
                <span className="leading-relaxed">{lastSignal}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* === Right column: Stats + Trades === */}
        <div className="lg:col-span-3 space-y-4">
          {/* Stats grid */}
          <Card className="glass-panel neon-border-soft">
            <CardContent className="p-5">
              <h3 className="text-sm font-bold text-cyan-200 mb-3 flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-cyan-400" />
                إحصائيات الأداء
              </h3>
              <div className="space-y-2">
                <StatRow
                  label="إجمالي الصفقات"
                  value={String(stats.total)}
                  icon={<Activity className="w-3 h-3" />}
                />
                <StatRow
                  label="صفقات رابحة"
                  value={String(stats.wins)}
                  icon={<TrendingUp className="w-3 h-3 text-green-400" />}
                  color="text-green-300"
                />
                <StatRow
                  label="صفقات خاسرة"
                  value={String(stats.losses)}
                  icon={<TrendingDown className="w-3 h-3 text-red-400" />}
                  color="text-red-300"
                />
                <StatRow
                  label="نسبة النجاح"
                  value={`${stats.winRate.toFixed(1)}%`}
                  icon={<Target className="w-3 h-3" />}
                  color={
                    stats.winRate >= 60
                      ? "text-green-300"
                      : stats.winRate >= 50
                      ? "text-yellow-300"
                      : "text-red-300"
                  }
                />
                <StatRow
                  label="إجمالي النقاط"
                  value={`${stats.totalPips.toFixed(1)} pip`}
                  icon={<Zap className="w-3 h-3 text-yellow-400" />}
                  color={stats.totalPips >= 0 ? "text-green-300" : "text-red-300"}
                />
                <StatRow
                  label="صفقات مفتوحة"
                  value={String(stats.openCount)}
                  icon={<Timer className="w-3 h-3" />}
                  color="text-cyan-300"
                />
              </div>
            </CardContent>
          </Card>

          {/* Recent trades */}
          <Card className="glass-panel neon-border-soft">
            <CardContent className="p-5">
              <h3 className="text-sm font-bold text-cyan-200 mb-3 flex items-center gap-1.5">
                <CandlestickChart className="w-4 h-4 text-cyan-400" />
                آخر الصفقات
              </h3>
              <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
                <AnimatePresence>
                  {trades.length === 0 ? (
                    <div className="text-center py-8 text-cyan-300/40 text-sm">
                      لا توجد صفقات بعد
                    </div>
                  ) : (
                    trades.map((t) => <TradeRow key={t.id} trade={t} />)
                  )}
                </AnimatePresence>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-6 text-center text-xs text-cyan-300/40 py-4">
        ALFA Reports — استراتيجية تسليم الأذيل · XAUUSD · M1 · TP 10 / SL 7 ·
        تنفيذ لحظي صاروخي
      </footer>
    </div>
  );
}

// ---------- Sub-components ----------

function StatBox({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-2.5 border ${
        highlight
          ? "bg-cyan-500/10 border-cyan-500/30"
          : "bg-black/30 border-cyan-500/15"
      }`}
    >
      <div className="flex items-center gap-1 text-[10px] text-cyan-300/60 mb-0.5">
        {icon}
        {label}
      </div>
      <div className="text-sm font-mono font-bold text-cyan-100 truncate">{value}</div>
    </div>
  );
}

function StatRow({
  label,
  value,
  icon,
  color = "text-cyan-100",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-cyan-500/5">
      <span className="text-xs text-cyan-200/70 flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className={`text-sm font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const isBuy = trade.direction === "BUY";
  const isWin = (trade.profitPips ?? 0) > 0;
  const statusColor =
    trade.status === "OPEN"
      ? "border-cyan-400/50 text-cyan-300 bg-cyan-500/10"
      : trade.status === "CLOSED_TP"
      ? "border-green-400/50 text-green-300 bg-green-500/10"
      : trade.status === "CLOSED_SL"
      ? "border-red-400/50 text-red-300 bg-red-500/10"
      : trade.status === "ERROR"
      ? "border-red-500/50 text-red-400 bg-red-500/20"
      : "border-cyan-400/30 text-cyan-300/70 bg-cyan-500/5";

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={`rounded-lg border p-2.5 ${statusColor}`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-xs font-bold ${
              isBuy ? "text-green-300" : "text-red-300"
            }`}
          >
            {isBuy ? "BUY" : "SELL"}
          </span>
          <span className="text-xs font-mono text-cyan-100">{trade.symbol}</span>
        </div>
        <span className="text-[10px] font-mono opacity-70">
          {new Date(trade.openedAt).toLocaleTimeString("en-GB")}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px] font-mono">
        <span className="text-cyan-200/70">
          @ {trade.entryPrice.toFixed(2)}
          {trade.exitPrice && ` → ${trade.exitPrice.toFixed(2)}`}
        </span>
        {trade.profitPips != null && (
          <span
            className={`font-bold ${
              trade.status === "OPEN"
                ? "text-cyan-300"
                : isWin
                ? "text-green-300"
                : "text-red-300"
            }`}
          >
            {trade.profitPips > 0 ? "+" : ""}
            {trade.profitPips.toFixed(1)} pip
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-1 text-[10px]">
        <span className="opacity-60">
          {trade.status === "OPEN" && <Clock className="w-3 h-3 inline ml-1" />}
          {trade.status === "CLOSED_TP" && (
            <CheckCircle2 className="w-3 h-3 inline ml-1" />
          )}
          {trade.status === "CLOSED_SL" && <XCircle className="w-3 h-3 inline ml-1" />}
          {trade.status === "CLOSED_TIME" && <Timer className="w-3 h-3 inline ml-1" />}
          {trade.status.replace("CLOSED_", "")}
        </span>
        <span className="opacity-60 font-mono">{trade.lotSize} lot</span>
      </div>
    </motion.div>
  );
}

/** Live candlestick chart with wick highlight */
function LiveCandleChart({
  candles,
  minWickRatio,
}: {
  candles: any[];
  minWickRatio: number;
}) {
  if (candles.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-cyan-300/40 text-sm">
        جاري تحميل الشموع...
      </div>
    );
  }
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const max = Math.max(...highs);
  const min = Math.min(...lows);
  const range = max - min || 1;
  const W = 600;
  const H = 220;
  const candleW = W / candles.length;
  const y = (p: number) => H - ((p - min) / range) * (H - 20) - 10;

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-black/30 border border-cyan-500/15">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-56" preserveAspectRatio="none">
        {/* grid */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            y1={H * f}
            x2={W}
            y2={H * f}
            stroke="rgba(0,229,255,0.06)"
            strokeWidth="1"
          />
        ))}
        {candles.map((c, i) => {
          const x = i * candleW + candleW / 2;
          const isUp = c.close >= c.open;
          const color = isUp ? "#22d3a7" : "#fb7185";
          const bodyTop = y(Math.max(c.open, c.close));
          const bodyBottom = y(Math.min(c.open, c.close));
          const wickHigh = y(c.high);
          const wickLow = y(c.low);
          const range2 = c.high - c.low;
          const lowerWick = Math.min(c.open, c.close) - c.low;
          const upperWick = c.high - Math.max(c.open, c.close);
          const isLongLower = lowerWick / range2 >= minWickRatio && range2 > 0;
          const isLongUpper = upperWick / range2 >= minWickRatio && range2 > 0;
          return (
            <g key={i}>
              {/* wick */}
              <line
                x1={x}
                y1={wickHigh}
                x2={x}
                y2={wickLow}
                stroke={color}
                strokeWidth="1"
                opacity={isLongLower || isLongUpper ? 1 : 0.6}
              />
              {/* body */}
              <rect
                x={x - Math.max(2, candleW / 3)}
                y={bodyTop}
                width={Math.max(4, candleW * 0.66)}
                height={Math.max(1, bodyBottom - bodyTop)}
                fill={color}
                opacity={0.85}
              />
              {/* highlight long wick tip */}
              {isLongLower && (
                <circle cx={x} cy={wickLow} r="3" fill="#00e5ff">
                  <animate
                    attributeName="r"
                    values="2;5;2"
                    dur="1.4s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
              {isLongUpper && (
                <circle cx={x} cy={wickHigh} r="3" fill="#00e5ff">
                  <animate
                    attributeName="r"
                    values="2;5;2"
                    dur="1.4s"
                    repeatCount="indefinite"
                  />
                </circle>
              )}
            </g>
          );
        })}
      </svg>
      <div className="absolute top-2 left-2 text-[10px] font-mono text-cyan-300/70">
        HIGH {max.toFixed(2)}
      </div>
      <div className="absolute bottom-2 left-2 text-[10px] font-mono text-cyan-300/70">
        LOW {min.toFixed(2)}
      </div>
    </div>
  );
}
