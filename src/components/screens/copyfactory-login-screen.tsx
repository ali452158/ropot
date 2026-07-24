"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { AlfaLogo, AlfaWordmark } from "@/components/alfa-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Link2,
  ExternalLink,
  CheckCircle2,
  ArrowRight,
  Loader2,
  ShieldCheck,
  AlertCircle,
  LogOut,
  HelpCircle,
  LogIn,
  KeyRound,
  Server,
  User,
  Eye,
  EyeOff,
  Zap,
  Sparkles,
} from "lucide-react";

// Common Exness + other broker MT5 servers (for the datalist autocomplete)
const COMMON_SERVERS = [
  "Exness-MT5Trial2",
  "Exness-MT5Trial5",
  "Exness-MT5Trial7",
  "Exness-MT5Trial10",
  "Exness-MT5Trial15",
  "Exness-MT5Real",
  "Exness-MT5Real2",
  "Exness-MT5Real3",
  "Exness-MT5Real5",
  "Exness-MT5Real7",
  "Exness-MT5Real9",
  "Exness-MT5Real10",
  "Exness-MT5Real13",
  "Exness-MT5Real15",
  "Exness-MT5Real16",
  "Exness-MT5Real17",
  "Exness-MT5Real18",
  "Exness-MT5Real21",
  "ICMarketsSC-Demo",
  "ICMarketsSC-Live",
  "ICMarketsEU-Demo",
  "ICMarketsEU-Live",
  "Pepperstone-Demo",
  "Pepperstone-Live",
  "FTMO-Demo",
  "FTMO-Server",
  "FXTM-Demo",
  "FXTM-Real",
];

type Mode = "auto" | "manual";

export function CopyfactoryLoginScreen() {
  const { activation, setMT5, setStage, reset } = useAppStore();
  const [mode, setMode] = useState<Mode>("auto");
  const [mt5Login, setMt5Login] = useState("");
  const [mt5Password, setMt5Password] = useState("");
  const [mt5Server, setMt5Server] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [subscriberId, setSubscriberId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [strategyInfo, setStrategyInfo] = useState<{
    strategyId?: string;
    masterLogin?: string | null;
    strategyExists?: boolean;
    requiresActivation?: boolean;
  } | null>(null);
  const [strategyLoading, setStrategyLoading] = useState(true);
  const { toast } = useToast();

  // Fetch strategy info on mount (just for showing the master reference).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStrategyLoading(true);
      try {
        const res = await fetch(
          `/api/copyfactory/strategy-info?code=${encodeURIComponent(
            activation.code
          )}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (!cancelled) setStrategyInfo(data);
      } catch {
        if (!cancelled)
          setStrategyInfo({
            strategyExists: false,
            requiresActivation: true,
          });
      } finally {
        if (!cancelled) setStrategyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activation.code]);

  const handleBack = () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("alfa-store");
        localStorage.removeItem("alfa-activation");
      } catch {}
    }
    reset();
  };

  const handleLogin = async () => {
    setError("");
    if (mode === "auto") {
      if (!mt5Login.trim() || !mt5Password || !mt5Server.trim()) {
        setError("الرجاء إدخال جميع بيانات MT5: Login + Password + Server");
        return;
      }
    } else {
      if (!subscriberId.trim()) {
        setError("الرجاء إدخال CopyFactory Subscriber ID");
        return;
      }
    }
    setLoading(true);

    // Build the request body for the chosen mode.
    const payload: Record<string, string> = { code: activation.code };
    if (mode === "auto") {
      payload.mt5Login = mt5Login.trim();
      payload.mt5Password = mt5Password;
      payload.mt5Server = mt5Server.trim();
    } else {
      payload.subscriberId = subscriberId.trim();
    }

    try {
      const res = await fetch("/api/subscriber/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "فشل ربط الحساب");
        toast({
          title: "فشل الاتصال",
          description: data.error,
          variant: "destructive",
        });
        return;
      }
      setMT5({
        sessionId: data.sessionId,
        mt5Login:
          mode === "auto"
            ? data.account?.login || mt5Login
            : data.subscriber?.subscriberId || subscriberId,
        mt5Server:
          mode === "auto" ? mt5Server : "copyfactory-manual",
        connected: true,
        balance: 0,
        equity: 0,
        currency: "USD",
      });
      toast({
        title: "تم الربط بنجاح ✓",
        description:
          mode === "auto"
            ? "تم إنشاء حساب MetaApi وربط CopyFactory تلقائياً — الصفقات تنسخ الآن"
            : "تم ربط الـ Subscriber — البوت بدأ يستقبل الصفقات المنسوخة",
      });
      setStage("dashboard");
    } catch (e: any) {
      setError(e?.message || "حدث خطأ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-8"
      >
        <AlfaLogo size={56} />
        <AlfaWordmark subtitle={false} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="glass-panel neon-border-soft rounded-2xl scanline relative">
          <CardContent className="p-6 md:p-8">
            {/* Status row */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-cyan-500/20">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-cyan-200/70">
                  الكود مفعّل — متبقي{" "}
                  <span className="text-cyan-300 font-bold">
                    {activation.expiresAt
                      ? Math.ceil(
                          (new Date(activation.expiresAt).getTime() -
                            Date.now()) /
                            (1000 * 60 * 60 * 24)
                        )
                      : 30}{" "}
                    يوم
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-cyan-400/40 text-cyan-300 bg-cyan-500/10 text-[10px]"
                >
                  COPYFACTORY
                </Badge>
                <button
                  type="button"
                  onClick={handleBack}
                  title="خروج وإدخال كود جديد"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 hover:border-red-400 text-[11px] font-bold transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>خروج</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <Link2 className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-bold text-white">
                ربط حسابك بالاستراتيجية
              </h2>
            </div>

            {/* Mode tabs */}
            <div className="grid grid-cols-2 gap-2 mb-5 p-1 rounded-lg bg-black/30 border border-cyan-500/20">
              <button
                type="button"
                onClick={() => {
                  setMode("auto");
                  setError("");
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-bold transition-all ${
                  mode === "auto"
                    ? "bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-100 border border-cyan-400/40"
                    : "text-cyan-300/60 hover:text-cyan-200 border border-transparent"
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                ربط تلقائي (موصى به)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("manual");
                  setError("");
                }}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-bold transition-all ${
                  mode === "manual"
                    ? "bg-gradient-to-r from-cyan-500/30 to-blue-500/30 text-cyan-100 border border-cyan-400/40"
                    : "text-cyan-300/60 hover:text-cyan-200 border border-transparent"
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                ربط يدوي (Subscriber ID)
              </button>
            </div>

            <AnimatePresence mode="wait">
              {mode === "auto" ? (
                <motion.div
                  key="auto"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="text-sm text-cyan-200/70 mb-4 leading-relaxed">
                    ادخل بيانات حساب MT5 الخاص بك. البوت هيـ provision حساب
                    MetaApi ويـربط CopyFactory تلقائياً. كل صفقات الماستر هتنسخ
                    على حسابك مباشرة.
                  </p>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-cyan-100 text-sm flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        MT5 Login (رقم الحساب)
                      </Label>
                      <Input
                        dir="ltr"
                        inputMode="numeric"
                        placeholder="مثال: 5012345678"
                        value={mt5Login}
                        onChange={(e) =>
                          setMt5Login(e.target.value.trim())
                        }
                        className="bg-black/40 border-cyan-500/30 text-cyan-50 placeholder:text-cyan-700/50 font-mono text-sm h-11 focus-visible:border-cyan-400 focus-visible:ring-cyan-400/30"
                        disabled={loading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-cyan-100 text-sm flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5" />
                        MT5 Password
                      </Label>
                      <div className="relative">
                        <Input
                          dir="ltr"
                          type={showPassword ? "text" : "password"}
                          placeholder="كلمة مرور MT5 (تُستخدم مرة واحدة)"
                          value={mt5Password}
                          onChange={(e) =>
                            setMt5Password(e.target.value)
                          }
                          className="bg-black/40 border-cyan-500/30 text-cyan-50 placeholder:text-cyan-700/50 font-mono text-sm h-11 pr-10 focus-visible:border-cyan-400 focus-visible:ring-cyan-400/30"
                          disabled={loading}
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-cyan-400/60 hover:text-cyan-300"
                          tabIndex={-1}
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-cyan-100 text-sm flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5" />
                        MT5 Server
                      </Label>
                      <Input
                        dir="ltr"
                        list="mt5-servers"
                        placeholder="مثال: Exness-MT5Real2"
                        value={mt5Server}
                        onChange={(e) =>
                          setMt5Server(e.target.value.trim())
                        }
                        className="bg-black/40 border-cyan-500/30 text-cyan-50 placeholder:text-cyan-700/50 font-mono text-sm h-11 focus-visible:border-cyan-400 focus-visible:ring-cyan-400/30"
                        disabled={loading}
                      />
                      <datalist id="mt5-servers">
                        {COMMON_SERVERS.map((s) => (
                          <option key={s} value={s} />
                        ))}
                      </datalist>
                      <p className="text-[11px] text-cyan-300/50">
                        اسم السيرفر تجده في تطبيق MT5 (Tools → Options → Server)
                        أو في رسالة الترحيب من الوسيط.
                      </p>
                    </div>

                    <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/5 border border-green-500/20 text-green-200/70 text-xs leading-relaxed">
                      <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-green-400" />
                      <span>
                        <strong className="text-green-300">
                          خصوصية كاملة:
                        </strong>{" "}
                        كلمة مرورك تُرسل مرة واحدة فقط إلى MetaApi Cloud (عبر
                        قناة HTTPS مشفّرة) لإنشاء الحساب. لا نخزّنها في قاعدة
                        بياناتنا إطلاقاً — نحتفظ فقط بـ MetaApi Account ID +
                        CopyFactory Subscriber ID.
                      </span>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="manual"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="text-sm text-cyan-200/70 mb-4 leading-relaxed">
                    إذا أنشأت Subscriber يدوياً في لوحة MetaApi، أدخل الـ
                    Subscriber ID هنا.
                  </p>

                  {/* Strategy ID panel — needed for manual setup */}
                  <div className="mb-4 p-4 rounded-lg bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/30">
                    <div className="flex items-center gap-2 mb-2">
                      <KeyRound className="w-4 h-4 text-cyan-400" />
                      <span className="text-xs font-bold text-cyan-200 uppercase tracking-wider">
                        Master Strategy ID
                      </span>
                    </div>
                    {strategyLoading ? (
                      <div className="flex items-center gap-2 text-cyan-300/60 text-sm">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        جاري التحميل...
                      </div>
                    ) : strategyInfo?.strategyId ? (
                      <code
                        dir="ltr"
                        className="block font-mono text-xs text-cyan-100 bg-black/40 px-3 py-2 rounded border border-cyan-500/30 break-all"
                      >
                        {strategyInfo.strategyId}
                      </code>
                    ) : (
                      <p className="text-xs text-yellow-300/80">
                        الاستراتيجية غير مفعّلة. تواصل مع الأدمن.
                      </p>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-cyan-100 text-sm flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5" />
                        CopyFactory Subscriber ID
                      </Label>
                      <Input
                        dir="ltr"
                        placeholder="sub-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        value={subscriberId}
                        onChange={(e) =>
                          setSubscriberId(e.target.value.trim())
                        }
                        className="bg-black/40 border-cyan-500/30 text-cyan-50 placeholder:text-cyan-700/50 font-mono text-sm h-11 focus-visible:border-cyan-400 focus-visible:ring-cyan-400/30"
                        disabled={loading}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Help toggle */}
            <button
              type="button"
              onClick={() => setShowHelp(!showHelp)}
              className="mt-4 flex items-center gap-1.5 text-xs text-cyan-300 hover:text-cyan-200"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              {showHelp
                ? "إخفاء التفاصيل"
                : "إزاي أحصل على بيانات MT5؟"}
            </button>

            {showHelp && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="mt-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-200/80 space-y-2"
              >
                <div>
                  <strong className="text-blue-300">1.</strong> افتح تطبيق
                  MT5 على جهازك.
                </div>
                <div>
                  <strong className="text-blue-300">2.</strong> من{" "}
                  <code className="text-blue-300">Tools → Options → Server</code>{" "}
                  هتلاقي اسم السيرفر (مثلاً{" "}
                  <code className="text-blue-300">Exness-MT5Real2</code>).
                </div>
                <div>
                  <strong className="text-blue-300">3.</strong> الـ Login هو
                  رقم حسابك (يظهر فوق في تطبيق MT5).
                </div>
                <div>
                  <strong className="text-blue-300">4.</strong> الباسوورد هو
                  نفس باسوورد الـ MT5 (master أو investor — يُفضّل investor
                  للقراءة فقط).
                </div>
                <div>
                  <strong className="text-blue-300">5.</strong> لو مش متأكد
                  من السيرفر، اسأل الوسيط (Exness support) أو شوف إيميل الترحيب.
                </div>
              </motion.div>
            )}

            <Button
              onClick={handleLogin}
              disabled={loading}
              className="mt-5 w-full h-12 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-base neon-glow transition-all border-0"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                  {mode === "auto"
                    ? "جاري إنشاء الحساب وربط الاستراتيجية..."
                    : "جاري ربط الـ Subscriber..."}
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 ml-2" />
                  {mode === "auto" ? "ربط تلقائي وبدء النسخ" : "ربط وبدء التداول"}
                  <ArrowRight className="w-5 h-5 mr-2" />
                </>
              )}
            </Button>

            {/* Reference: master account info */}
            {strategyInfo?.masterLogin && (
              <div className="mt-4 text-center text-[11px] text-cyan-300/50">
                Master MT5 Login:{" "}
                <span className="font-mono text-cyan-200">
                  {strategyInfo.masterLogin}
                </span>
                {strategyInfo?.strategyId && mode === "auto" && (
                  <>
                    {" • "}
                    Strategy:{" "}
                    <span className="font-mono text-cyan-200/70">
                      {strategyInfo.strategyId.slice(0, 8)}...
                    </span>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
