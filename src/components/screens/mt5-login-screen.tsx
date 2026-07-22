"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { AlfaLogo, AlfaWordmark } from "@/components/alfa-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  LogIn,
  Server,
  User,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

const COMMON_SERVERS = [
  "ICMarketsSC-Demo",
  "ICMarketsSC-Live",
  "ICMarketsEU-Demo",
  "ICMarketsEU-Live",
  "Pepperstone-Demo",
  "Pepperstone-Live",
  "FTMO-Demo",
  "FTMO-Server",
  "Exness-Demo",
  "Exness-Real",
  "FXTM-Demo",
  "FXTM-Real",
];

export function Mt5LoginScreen() {
  const { activation, setMT5, setStage } = useAppStore();
  const [mt5Login, setMt5Login] = useState("");
  const [mt5Password, setMt5Password] = useState("");
  const [mt5Server, setMt5Server] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const handleLogin = async () => {
    setError("");
    if (!mt5Login.trim() || !mt5Password || !mt5Server.trim()) {
      setError("الرجاء إدخال جميع بيانات MT5: ID / Password / Server");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/mt5/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: activation.code,
          mt5Login: mt5Login.trim(),
          mt5Password,
          mt5Server: mt5Server.trim(),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "فشل تسجيل الدخول إلى MT5");
        toast({
          title: "فشل الاتصال بـ MT5",
          description: data.error,
          variant: "destructive",
        });
        return;
      }
      setMT5({
        sessionId: data.sessionId,
        mt5Login: data.account.login,
        mt5Server: data.account.server,
        connected: data.account.connected,
        balance: data.account.balance,
        equity: data.account.equity,
        currency: data.account.currency,
      });
      toast({
        title: "تم الاتصال بـ MT5 ✓",
        description: data.botAutoStarted
          ? `مرحباً ${data.account.login} — البوت بدأ التداول تلقائياً على حسابك`
          : `مرحباً ${data.account.login} (${data.mode})`,
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
      {/* Compact header */}
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
              <Badge
                variant="outline"
                className="border-cyan-400/40 text-cyan-300 bg-cyan-500/10 text-[10px]"
              >
                STEP 2 / 3
              </Badge>
            </div>

            <div className="flex items-center gap-2 mb-6">
              <LogIn className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-bold text-white">تسجيل الدخول إلى MT5</h2>
            </div>

            <div className="space-y-4">
              {/* MT5 ID */}
              <div className="space-y-2">
                <Label className="text-cyan-100 text-sm flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  MT5 ID — رقم الحساب
                </Label>
                <Input
                  dir="ltr"
                  placeholder="12345678"
                  value={mt5Login}
                  onChange={(e) =>
                    setMt5Login(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  className="bg-black/40 border-cyan-500/30 text-cyan-50 placeholder:text-cyan-700/50 font-mono text-lg h-11 focus-visible:border-cyan-400 focus-visible:ring-cyan-400/30"
                  disabled={loading}
                />
              </div>

              {/* MT5 Password */}
              <div className="space-y-2">
                <Label className="text-cyan-100 text-sm flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  MT5 Password — كلمة المرور
                </Label>
                <div className="relative">
                  <Input
                    dir="ltr"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={mt5Password}
                    onChange={(e) => setMt5Password(e.target.value)}
                    className="bg-black/40 border-cyan-500/30 text-cyan-50 placeholder:text-cyan-700/50 font-mono h-11 pr-10 focus-visible:border-cyan-400 focus-visible:ring-cyan-400/30"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-cyan-400/60 hover:text-cyan-300 p-1"
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

              {/* MT5 Server */}
              <div className="space-y-2">
                <Label className="text-cyan-100 text-sm flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5" />
                  MT5 Server — السيرفر
                </Label>
                <Input
                  dir="ltr"
                  placeholder="ICMarketsSC-Live"
                  value={mt5Server}
                  onChange={(e) => setMt5Server(e.target.value)}
                  list="mt5-servers"
                  className="bg-black/40 border-cyan-500/30 text-cyan-50 placeholder:text-cyan-700/50 font-mono h-11 focus-visible:border-cyan-400 focus-visible:ring-cyan-400/30"
                  disabled={loading}
                />
                <datalist id="mt5-servers">
                  {COMMON_SERVERS.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-start gap-2 p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20 text-cyan-200/70 text-xs leading-relaxed">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-cyan-400" />
                <span>
                  بيانات MT5 تُرسَل بأمان إلى MetaAPI Cloud لربط حسابك. كلمة المرور
                  تُخزَّن مشفّرة (scrypt + salt) ولا تُستخدم إلا لتنفيذ الصفقات.
                </span>
              </div>

              <Button
                onClick={handleLogin}
                disabled={loading}
                className="w-full h-12 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-base neon-glow transition-all border-0"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                    جاري الاتصال بـ MT5...
                  </>
                ) : (
                  <>
                    اتصال وانتقال للوحة التحكم
                    <ArrowRight className="w-5 h-5 mr-2" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
