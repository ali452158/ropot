"use client";

import { useEffect, useState, useCallback } from "react";
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
  ShieldAlert,
  LogOut,
  RefreshCw,
  Zap,
  Cpu,
  Wifi,
  Clock,
  CandlestickChart,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
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
  const [stats, setStats] = useState({
    total: 0,
    wins: 0,
    losses: 0,
    winRate: 0,
    totalPips: 0,
    openCount: 0,
  });
  const [mode, setMode] = useState<"LIVE" | "SIMULATION">("SIMULATION");
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [connectionIssue, setConnectionIssue] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // REFRESH STATUS — trades + stats + bot config
  // -----------------------------------------------------------------------
  const refreshStatus = useCallback(async () => {
    if (!mt5.sessionId) return;
    try {
      const [cfgRes, statsRes] = await Promise.all([
        fetch(`/api/bot/config?sessionId=${encodeURIComponent(mt5.sessionId)}`),
        fetch("/api/bot/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: mt5.sessionId }),
        }),
      ]);
      const cfgData = await cfgRes.json();
      const statsData = await statsRes.json();
      if (cfgData.ok && cfgData.config) {
        setBotConfig({
          symbol: cfgData.config.symbol,
          timeframe: cfgData.config.timeframe,
          lotSize: cfgData.config.lotSize,
          highFrequencyMode: cfgData.config.highFrequencyMode,
          tradeDirection: cfgData.config.tradeDirection,
          maxOpenPositions: cfgData.config.maxOpenPositions,
          maxLossStreak: cfgData.config.maxLossStreak,
          lastLossStreak: cfgData.config.lastLossStreak,
          instabilityStop: cfgData.config.instabilityStop,
          // Pyramid strategy fields
          pyramidProfitUsd: cfgData.config.pyramidProfitUsd ?? 2.0,
          pyramidMaxTrades: cfgData.config.pyramidMaxTrades ?? 6,
          pyramidAnchorCount: cfgData.config.pyramidAnchorCount ?? 2,
          botRunning: cfgData.config.botRunning,
          botStartedAt: cfgData.config.botStartedAt,
        });
      }
      if (statsData.ok) {
        setStats({
          total: statsData.stats?.total ?? 0,
          wins: statsData.stats?.wins ?? 0,
          losses: statsData.stats?.losses ?? 0,
          winRate: statsData.stats?.winRate ?? 0,
          totalPips: statsData.stats?.totalPips ?? 0,
          openCount: statsData.stats?.openCount ?? 0,
        });
      }
    } catch {
      /* silent */
    }
  }, [mt5.sessionId, setBotConfig]);

  // -----------------------------------------------------------------------
  // REFRESH ACCOUNT — balance / equity / connection state
  // -----------------------------------------------------------------------
  const refreshAccount = useCallback(async () => {
    if (!mt5.sessionId) return;
    try {
      const res = await fetch("/api/mt5/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: mt5.sessionId }),
      });
      const data = await res.json();
      if (data.ok) {
        setMT5({
          balance: data.balance,
          equity: data.equity,
          currency: data.currency || "USD",
          connected: data.connected ?? true,
        });
        setConnectionIssue(null);
      } else {
        setConnectionIssue(data.error || "تعذّر جلب بيانات الحساب");
      }
    } catch (e: any) {
      setConnectionIssue(`خطأ شبكة: ${e?.message || e}`);
    }
  }, [mt5.sessionId, setMT5]);

  // Initial load + intervals
  useEffect(() => {
    refreshStatus();
    refreshAccount();
    fetch("/api/system/mode")
      .then((r) => r.json())
      .then((d) => d.ok && setMode(d.mode))
      .catch(() => {});
    const statusTimer = setInterval(refreshStatus, 3000);
    const accountTimer = setInterval(refreshAccount, 10000);
    return () => {
      clearInterval(statusTimer);
      clearInterval(accountTimer);
    };
  }, [refreshStatus, refreshAccount]);

  // -----------------------------------------------------------------------
  // CONFIG UPDATE
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // START / STOP
  // -----------------------------------------------------------------------
  const handleStart = async () => {
    setStarting(true);
    try {
      // Clear instability-stop flag on a fresh manual start.
      await updateConfig({ instabilityStop: false, lastLossStreak: 0 });
      const res = await fetch("/api/bot/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: mt5.sessionId }),
      });
      const data = await res.json();
      if (data.ok) {
        toast({ title: "✅ تم تشغيل البوت", description: "البوت بدأ العمل" });
        await refreshStatus();
      } else {
        toast({
          title: "❌ فشل التشغيل",
          description: data.error || "خطأ غير معروف",
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
        toast({ title: "⏹️ تم إيقاف البوت" });
        await refreshStatus();
      }
    } finally {
      setStopping(false);
    }
  };

  const handleLogout = () => {
    reset();
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
    <div className="min-h-screen p-3 sm:p-4 md:p-6">
      {/* Top bar — sticky on mobile */}
      <header className="sticky top-0 z-20 -mx-3 sm:-mx-4 md:mx-0 mb-4 md:mb-5 px-3 sm:px-4 md:px-0 py-2 md:py-0 md:static bg-black/30 md:bg-transparent backdrop-blur-md md:backdrop-blur-none border-b md:border-0 border-cyan-500/20 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <AlfaLogo size={36} />
          <AlfaWordmark subtitle={false} />
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
          <Badge
            variant="outline"
            className={
              mode === "LIVE"
                ? "border-green-400/50 text-green-300 bg-green-500/10 text-[9px] sm:text-xs px-1.5 sm:px-2.5"
                : "border-amber-400/50 text-amber-300 bg-amber-500/10 text-[9px] sm:text-xs px-1.5 sm:px-2.5"
            }
          >
            <Wifi className="w-3 h-3 ml-1" />
            {mode === "LIVE" ? "LIVE" : "SIMULATION"}
          </Badge>
          <Badge
            variant="outline"
            className="border-cyan-400/40 text-cyan-300 bg-cyan-500/10 text-[9px] sm:text-xs px-1.5 sm:px-2.5"
          >
            <Clock className="w-3 h-3 ml-1" />
            {daysLeft}ي
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-red-300 hover:text-red-200 hover:bg-red-500/10 h-8 text-[11px] sm:text-xs px-2"
          >
            <LogOut className="w-3.5 h-3.5 ml-1" />
            خروج
          </Button>
        </div>
      </header>

      <div className="max-w-2xl mx-auto space-y-3 sm:space-y-4">
        {/* === Instability-stop banner === */}
        {botConfig.instabilityStop && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/40 px-3 sm:px-4 py-3 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-xs sm:text-sm font-bold text-red-200 mb-1">
                ⚠️ السوق غير مستقر الآن
              </div>
              <div className="text-[11px] sm:text-xs text-red-200/80 leading-relaxed">
                تم إيقاف البوت تلقائياً بعد {botConfig.lastLossStreak} خسائر متتالية.
                يمكنك إعادة تشغيله عند استقرار ظروف السوق.
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleStart}
              disabled={starting}
              className="bg-red-500/30 hover:bg-red-500/50 border border-red-400/50 text-red-100 h-8 text-[11px]"
            >
              إعادة التشغيل
            </Button>
          </div>
        )}

        {/* === Connection-issue banner === */}
        {connectionIssue && !botConfig.instabilityStop && (
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/40 px-3 sm:px-4 py-2.5 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] sm:text-xs font-bold text-amber-200 mb-0.5">
                تنبيه
              </div>
              <div className="text-[11px] sm:text-xs text-amber-200/80">
                {connectionIssue}
              </div>
            </div>
          </div>
        )}

        {/* === ACCOUNT SECTION === */}
        <Card className="glass-panel neon-border-soft">
          <CardContent className="p-3 sm:p-4 md:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-cyan-200 flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-cyan-400" />
                حسابك على MT5
              </h3>
              <RefreshCw
                className="w-4 h-4 text-cyan-400/50 cursor-pointer hover:text-cyan-300"
                onClick={refreshAccount}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
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
            {/* Live stats strip */}
            <div className="mt-3 grid grid-cols-4 gap-1.5 sm:gap-2">
              <StatPill label="إجمالي" value={String(stats.total)} />
              <StatPill
                label="رابحة"
                value={String(stats.wins)}
                color="text-green-300"
              />
              <StatPill
                label="خاسرة"
                value={String(stats.losses)}
                color="text-red-300"
              />
              <StatPill
                label="مفتوحة"
                value={String(stats.openCount)}
                color="text-cyan-300"
              />
            </div>
          </CardContent>
        </Card>

        {/* === BOT SETTINGS SECTION === */}
        <Card className="glass-panel neon-border-soft">
          <CardContent className="p-3 sm:p-4 md:p-5 space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-cyan-200 flex items-center gap-1.5">
                <CandlestickChart className="w-4 h-4 text-cyan-400" />
                إعدادات البوت
              </h3>
              <Badge
                variant="outline"
                className={
                  botConfig.botRunning
                    ? "border-green-400/50 text-green-300 bg-green-500/10 text-[9px] sm:text-xs px-2"
                    : "border-zinc-400/40 text-zinc-300 bg-zinc-500/10 text-[9px] sm:text-xs px-2"
                }
              >
                <Activity className="w-3 h-3 ml-1" />
                {botConfig.botRunning ? "يعمل" : "متوقف"}
              </Badge>
            </div>

            {/* Symbol */}
            <div className="space-y-1.5">
              <Label className="text-xs text-cyan-200/70">الزوج</Label>
              <Select
                value={botConfig.symbol}
                onValueChange={(v) => updateConfig({ symbol: v })}
                disabled={botConfig.botRunning}
              >
                <SelectTrigger className="bg-black/40 border-cyan-500/30 text-cyan-50 font-mono h-11 text-sm">
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
                <SelectTrigger className="bg-black/40 border-cyan-500/30 text-cyan-50 font-mono h-11 text-sm">
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

            {/* Lot size */}
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
                className="bg-black/40 border-cyan-500/30 text-cyan-50 font-mono h-11 text-sm"
              />
            </div>

            {/* Trade direction */}
            <div className="space-y-1.5">
              <Label className="text-xs text-cyan-200/70">نوع الصفقة</Label>
              <Select
                value={botConfig.tradeDirection}
                onValueChange={(v) => updateConfig({ tradeDirection: v })}
                disabled={botConfig.botRunning}
              >
                <SelectTrigger className="bg-black/40 border-cyan-500/30 text-cyan-50 font-mono h-11 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-black/90 border-cyan-500/30">
                  <SelectItem
                    value="AUTO"
                    className="text-cyan-100 focus:bg-cyan-500/20 focus:text-cyan-50"
                  >
                    <div className="flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-cyan-400" />
                      تلقائي (حسب الاتجاه)
                    </div>
                  </SelectItem>
                  <SelectItem
                    value="BUY"
                    className="text-cyan-100 focus:bg-cyan-500/20 focus:text-cyan-50"
                  >
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                      شراء فقط
                    </div>
                  </SelectItem>
                  <SelectItem
                    value="SELL"
                    className="text-cyan-100 focus:bg-cyan-500/20 focus:text-cyan-50"
                  >
                    <div className="flex items-center gap-2">
                      <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                      بيع فقط
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* High-Frequency Mode toggle */}
            <div className="rounded-lg bg-cyan-500/5 border border-cyan-500/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  <Label className="text-xs sm:text-sm font-bold text-cyan-100 cursor-pointer">
                    الوضع عالي التردد
                  </Label>
                </div>
                <Switch
                  checked={botConfig.highFrequencyMode}
                  onCheckedChange={(v) => updateConfig({ highFrequencyMode: v })}
                  disabled={botConfig.botRunning}
                />
              </div>
              <p className="text-[10px] sm:text-[11px] text-cyan-200/60 leading-relaxed">
                يفتح <b className="text-cyan-200">{botConfig.pyramidAnchorCount} صفقات أولية</b> عند
                اكتمال شمعة بشروط الدخول، مع ستوب وهدف (الهدف = 3× الاستوب). كلما ربحت أي صفقة
                <b className="text-cyan-200"> ${botConfig.pyramidProfitUsd}</b> يفتح صفقة إضافية بنفس
                الاتجاه لحد {botConfig.pyramidMaxTrades} صفقات. لو عكس السعر وضرب استوب أول صفقتين
                يغلق كل الصفقات تلقائياً.
              </p>
            </div>

            {/* Pyramid parameters */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-black/30 border border-cyan-500/10 p-2">
                <div className="text-[10px] text-cyan-200/60 mb-1">صفقات أولية</div>
                <Input
                  type="number"
                  min={1}
                  max={3}
                  step={1}
                  value={botConfig.pyramidAnchorCount}
                  onChange={(e) =>
                    setBotConfig({
                      pyramidAnchorCount: Math.max(1, Math.min(3, Number(e.target.value) || 1)),
                    })
                  }
                  onBlur={(e) =>
                    updateConfig({ pyramidAnchorCount: Number(e.target.value) || 2 })
                  }
                  disabled={botConfig.botRunning}
                  className="h-8 bg-black/40 border-cyan-500/20 text-cyan-100 text-sm font-mono"
                />
              </div>
              <div className="rounded-lg bg-black/30 border border-cyan-500/10 p-2">
                <div className="text-[10px] text-cyan-200/60 mb-1">حد الصفقات</div>
                <Input
                  type="number"
                  min={2}
                  max={10}
                  step={1}
                  value={botConfig.pyramidMaxTrades}
                  onChange={(e) =>
                    setBotConfig({
                      pyramidMaxTrades: Math.max(2, Math.min(10, Number(e.target.value) || 2)),
                    })
                  }
                  onBlur={(e) =>
                    updateConfig({ pyramidMaxTrades: Number(e.target.value) || 6 })
                  }
                  disabled={botConfig.botRunning}
                  className="h-8 bg-black/40 border-cyan-500/20 text-cyan-100 text-sm font-mono"
                />
              </div>
              <div className="rounded-lg bg-black/30 border border-cyan-500/10 p-2">
                <div className="text-[10px] text-cyan-200/60 mb-1">ربح التدرج ($)</div>
                <Input
                  type="number"
                  min={0.5}
                  max={20}
                  step={0.5}
                  value={botConfig.pyramidProfitUsd}
                  onChange={(e) =>
                    setBotConfig({
                      pyramidProfitUsd: Math.max(0.5, Math.min(20, Number(e.target.value) || 0.5)),
                    })
                  }
                  onBlur={(e) =>
                    updateConfig({ pyramidProfitUsd: Number(e.target.value) || 2 })
                  }
                  disabled={botConfig.botRunning}
                  className="h-8 bg-black/40 border-cyan-500/20 text-cyan-100 text-sm font-mono"
                />
              </div>
            </div>
            <p className="text-[10px] text-cyan-200/40 leading-relaxed -mt-1">
              صفقات أولية = عدد الصفقات اللي تفتح عند الإشارة. حد الصفقات = أقصى عدد للصفقات
              المفتوحة في الهرم. ربح التدرج = كل ما ربحت أي صفقة هذا المبلغ يفتح صفقة جديدة.
              الهدف دائماً 3× الاستوب. ضرب استوب الصفقات الأولى يغلق كل الصفقات.
            </p>

            {/* Loss-streak counter (display only) */}
            <div className="rounded-lg bg-black/30 border border-cyan-500/10 p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px] text-cyan-200/70">
                  خسائر متتالية
                </span>
              </div>
              <Badge
                variant="outline"
                className={
                  botConfig.lastLossStreak >= botConfig.maxLossStreak - 1
                    ? "border-red-400/50 text-red-300 bg-red-500/10 font-mono text-xs"
                    : botConfig.lastLossStreak > 0
                    ? "border-amber-400/50 text-amber-300 bg-amber-500/10 font-mono text-xs"
                    : "border-green-400/50 text-green-300 bg-green-500/10 font-mono text-xs"
                }
              >
                {botConfig.lastLossStreak} / {botConfig.maxLossStreak}
              </Badge>
            </div>

            <Separator className="bg-cyan-500/20" />

            {/* Start / Stop buttons */}
            <div className="flex gap-2">
              {!botConfig.botRunning ? (
                <Button
                  className="flex-1 h-12 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold text-sm"
                  onClick={handleStart}
                  disabled={starting}
                >
                  <Play className="w-4 h-4 ml-2" />
                  {starting ? "جاري التشغيل..." : "تشغيل البوت"}
                </Button>
              ) : (
                <Button
                  className="flex-1 h-12 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-sm"
                  onClick={handleStop}
                  disabled={stopping}
                >
                  <Square className="w-4 h-4 ml-2" />
                  {stopping ? "جاري الإيقاف..." : "إيقاف البوت"}
                </Button>
              )}
            </div>

            {botConfig.botRunning && (
              <div className="rounded-lg bg-green-500/5 border border-green-500/20 px-3 py-2 flex items-center gap-2 text-[11px] text-green-300/80">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                البوت يعمل — يراقب السوق ويفتح الصفقات تلقائياً
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatBox({
  label,
  value,
  icon,
  highlight = false,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-lg p-2.5 sm:p-3 border " +
        (highlight
          ? "bg-cyan-500/10 border-cyan-500/30"
          : "bg-black/30 border-cyan-500/10")
      }
    >
      <div className="flex items-center gap-1 text-[10px] text-cyan-200/60 mb-0.5">
        {icon}
        {label}
      </div>
      <div
        className={
          "font-mono text-xs sm:text-sm font-bold " +
          (highlight ? "text-cyan-200" : "text-cyan-100")
        }
      >
        {value}
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  color = "text-cyan-100",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-md bg-black/30 border border-cyan-500/10 px-1.5 py-1 text-center">
      <div className="text-[9px] text-cyan-200/60 mb-0.5">{label}</div>
      <div className={"font-mono text-sm font-bold " + color}>{value}</div>
    </div>
  );
}
