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
  Link2,
  Copy,
  ExternalLink,
  CheckCircle2,
  ArrowRight,
  Loader2,
  ShieldCheck,
  AlertCircle,
  LogOut,
  HelpCircle,
  LogIn,
} from "lucide-react";

export function CopyfactoryLoginScreen() {
  const { activation, setMT5, setStage, reset } = useAppStore();
  const [subscriberId, setSubscriberId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const { toast } = useToast();

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
    if (!subscriberId.trim()) {
      setError("الرجاء إدخال CopyFactory Subscriber ID");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/subscriber/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: activation.code,
          subscriberId: subscriberId.trim(),
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "فشل ربط الـ Subscriber");
        toast({
          title: "فشل الاتصال",
          description: data.error,
          variant: "destructive",
        });
        return;
      }
      setMT5({
        sessionId: data.sessionId,
        mt5Login: data.subscriber.subscriberId,
        mt5Server: "copyfactory",
        connected: true,
        balance: 0,
        equity: 0,
        currency: "USD",
      });
      toast({
        title: "تم ربط الـ Subscriber ✓",
        description: "البوت بدأ يستقبل الصفقات المنسوخة من الماستر تلقائياً",
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
              <h2 className="text-lg font-bold text-white">ربط CopyFactory</h2>
            </div>

            <p className="text-sm text-cyan-200/70 mb-5 leading-relaxed">
              أدخل CopyFactory Subscriber ID الخاص بك لربط حسابك بالاستراتيجية
              الذهبية. سيقوم البوت تلقائياً بنسخ صفقات الماستر إلى حسابك دون
              الحاجة لمشاركة كلمة مرور MT5.
            </p>

            {/* Steps summary */}
            <div className="space-y-2 mb-5 p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
              <div className="flex items-start gap-2 text-xs text-cyan-200/80">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-400" />
                <span>
                  أنشأت حساباً على{" "}
                  <a
                    href="https://app.metaapi.cloud"
                    target="_blank"
                    rel="noopener"
                    className="text-cyan-300 underline inline-flex items-center gap-0.5"
                  >
                    app.metaapi.cloud
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </span>
              </div>
              <div className="flex items-start gap-2 text-xs text-cyan-200/80">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-400" />
                <span>أضفت حساب MT5 الخاص بك في MetaApi dashboard</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-cyan-200/80">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-green-400" />
                <span>أنشأت CopyFactory Subscriber ونسخت الـ ID</span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Subscriber ID input */}
              <div className="space-y-2">
                <Label className="text-cyan-100 text-sm flex items-center gap-1.5">
                  <Copy className="w-3.5 h-3.5" />
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

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Help toggle */}
              <button
                type="button"
                onClick={() => setShowHelp(!showHelp)}
                className="flex items-center gap-1.5 text-xs text-cyan-300 hover:text-cyan-200"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                {showHelp ? "إخفاء الخطوات التفصيلية" : "كيف أحصل على Subscriber ID؟"}
              </button>

              {showHelp && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-200/80 space-y-2"
                >
                  <div>
                    <strong className="text-blue-300">1.</strong> اذهب إلى{" "}
                    <a
                      href="https://app.metaapi.cloud"
                      target="_blank"
                      rel="noopener"
                      className="text-blue-300 underline inline-flex items-center gap-0.5"
                    >
                      app.metaapi.cloud
                      <ExternalLink className="w-3 h-3" />
                    </a>{" "}
                    وأنشئ حساباً مجانياً
                  </div>
                  <div>
                    <strong className="text-blue-300">2.</strong> من قائمة
                    MetaTrader Accounts → Add Account، أضف حساب MT5 الخاص بك
                    (Login + Password + Server)
                  </div>
                  <div>
                    <strong className="text-blue-300">3.</strong> من قائمة
                    CopyFactory → Subscribers → Create Subscriber
                  </div>
                  <div>
                    <strong className="text-blue-300">4.</strong> في خانة
                    Strategy ID، الصق الـ ID الذي حصلت عليه من الأدمن
                  </div>
                  <div>
                    <strong className="text-blue-300">5.</strong> احفظ → انسخ
                    الـ Subscriber ID الذي يظهر في الأعلى
                  </div>
                  <div>
                    <strong className="text-blue-300">6.</strong> الصق الـ ID هنا
                    واضغط "ربط وبدء التداول"
                  </div>
                </motion.div>
              )}

              <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/5 border border-green-500/20 text-green-200/70 text-xs leading-relaxed">
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-green-400" />
                <span>
                  <strong className="text-green-300">خصوصية كاملة:</strong>{" "}
                  كلمة مرور MT5 تبقى عندك فقط في حسابك على MetaApi. لا يصل للأدمن
                  أي بيانات حساسة — فقط الـ Subscriber ID العام.
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
                    جاري ربط الـ Subscriber...
                  </>
                ) : (
                  <>
                    ربط وبدء التداول
                    <ArrowRight className="w-5 h-5 mr-2" />
                  </>
                )}
              </Button>

              {/* Divider */}
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-cyan-500/20" />
                <span className="text-[10px] text-cyan-700/60 uppercase tracking-wider">
                  أو
                </span>
                <div className="flex-1 h-px bg-cyan-500/20" />
              </div>

              {/* MT5 credentials alternative */}
              <button
                onClick={() => useAppStore.getState().setStage("mt5-login")}
                className="w-full h-11 rounded-md border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 hover:border-cyan-400 text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                تسجيل دخول MT5 المباشر (مشاركة بيانات MT5)
              </button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
