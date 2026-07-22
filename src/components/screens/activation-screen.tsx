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
  ShieldCheck,
  KeyRound,
  Cpu,
  Clock,
  Lock,
  Sparkles,
  Zap,
  Activity,
  AlertCircle,
} from "lucide-react";

export function ActivationScreen() {
  const { activation, setActivation, setStage } = useAppStore();
  const [code, setCode] = useState(activation.code || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const handleVerify = async () => {
    setError("");
    if (!code.trim()) {
      setError("الرجاء إدخال كود التفعيل");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/activation/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || "فشل في التحقق من الكود");
        toast({
          title: "فشل التفعيل",
          description: data.error,
          variant: "destructive",
        });
        return;
      }
      setActivation({
        code: code.trim().toUpperCase(),
        status: "ACTIVE",
        activatedAt: data.activatedAt,
        expiresAt: data.expiresAt,
        deviceId: data.deviceId,
      });
      toast({
        title: "تم تفعيل الكود",
        description: data.message || "يمكنك الآن تسجيل الدخول إلى MT5",
      });
      setStage("mt5-login");
    } catch (e: any) {
      setError(e?.message || "حدث خطأ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 md:p-8">
      {/* Hero header with robot mascot */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-4xl mb-8"
      >
        <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10">
          {/* Robot mascot image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 0.8, delay: 0.15, type: "spring" }}
            className="relative shrink-0"
          >
            <div className="absolute inset-0 rounded-full bg-cyan-500/20 blur-3xl scale-110 animate-pulse" />
            <img
              src="/alfa-robot.png"
              alt="ALFA Trading Robot"
              className="relative w-40 h-40 md:w-52 md:h-52 object-cover rounded-2xl neon-border-soft"
              style={{ filter: "drop-shadow(0 0 25px rgba(0, 229, 255, 0.45))" }}
            />
            {/* Status badge floating on robot */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/80 border border-cyan-400/50 text-cyan-300 text-[10px] font-mono whitespace-nowrap">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 ml-1.5 animate-pulse" />
              AI ONLINE
            </div>
          </motion.div>

          {/* Title block */}
          <div className="flex flex-col items-center md:items-start text-center md:text-right">
            <div className="mb-3">
              <AlfaLogo size={64} />
            </div>
            <AlfaWordmark />
            <p className="mt-3 text-sm md:text-base text-cyan-100/80 max-w-md leading-relaxed">
              بوت تداول آلي للمتاجرة في الذهب (XAUUSD) باستراتيجية{" "}
              <span className="neon-text-soft font-semibold">تسليم الأذيل</span> على
              فريم M1 — تنفيذ لحظي صاروخي.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Bot showcase image (candle chart) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="mb-8 w-full max-w-3xl"
      >
        <BotShowcase />
      </motion.div>

      {/* Activation card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="w-full max-w-md"
      >
        <Card className="glass-panel neon-border-soft rounded-2xl overflow-hidden scanline relative">
          <CardContent className="p-6 md:p-8">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-cyan-400" />
                <h2 className="text-lg font-bold text-white">تفعيل الاشتراك</h2>
              </div>
              <Badge
                variant="outline"
                className="border-cyan-400/40 text-cyan-300 bg-cyan-500/10"
              >
                <Lock className="w-3 h-3 ml-1" />
                اشتراك شهري
              </Badge>
            </div>

            <div className="space-y-2 mb-4">
              <Label htmlFor="code" className="text-cyan-100 text-sm">
                كود التفعيل
              </Label>
              <Input
                id="code"
                dir="ltr"
                placeholder="ALFA-XXXX-XXXX-XXXX"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                className="bg-black/40 border-cyan-500/30 text-cyan-50 placeholder:text-cyan-700/50 font-mono tracking-wider text-center text-lg h-12 focus-visible:border-cyan-400 focus-visible:ring-cyan-400/30"
                disabled={loading}
              />
              <p className="text-xs text-cyan-200/60 leading-relaxed">
                أدخل الكود الذي استلمته من بوت تلجرام. كل كود يعمل على جهاز واحد
                فقط لمدة 30 يوماً.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              onClick={handleVerify}
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-base neon-glow transition-all border-0"
            >
              {loading ? (
                <>
                  <Activity className="w-5 h-5 ml-2 animate-spin" />
                  جاري التحقق...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-5 h-5 ml-2" />
                  تفعيل الكود
                </>
              )}
            </Button>

            {/* Feature pills */}
            <div className="grid grid-cols-3 gap-2 mt-6">
              <FeaturePill icon={<Zap className="w-3.5 h-3.5" />} text="تنفيذ لحظي" />
              <FeaturePill icon={<Cpu className="w-3.5 h-3.5" />} text="MT5 حقيقي" />
              <FeaturePill icon={<Clock className="w-3.5 h-3.5" />} text="30 يوماً" />
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-cyan-200/40 mt-4 flex items-center justify-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          ALFA Reports — استثمارك الذكي في سوق الذهب
        </p>
      </motion.div>
    </div>
  );
}

function FeaturePill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg bg-cyan-500/5 border border-cyan-500/20 text-cyan-200/80 text-[11px]">
      {icon}
      {text}
    </div>
  );
}

/** Animated SVG illustration showing the bot's Wick-to-Wick strategy */
function BotShowcase() {
  return (
    <div className="relative rounded-2xl overflow-hidden glass-panel neon-border-soft aspect-[16/7]">
      <div className="absolute inset-0 grid-bg opacity-40" />
      <svg
        viewBox="0 0 800 350"
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="candleUp" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3a7" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
          <linearGradient id="candleDown" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fb7185" />
            <stop offset="100%" stopColor="#e11d48" />
          </linearGradient>
          <linearGradient id="wickHighlight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,229,255,0.9)" />
            <stop offset="100%" stopColor="rgba(0,229,255,0.1)" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Subtle baseline grid */}
        {[50, 100, 150, 200, 250, 300].map((y) => (
          <line
            key={y}
            x1="0"
            y1={y}
            x2="800"
            y2={y}
            stroke="rgba(0,229,255,0.05)"
            strokeWidth="1"
          />
        ))}

        {/* Candles with the central one showing a long lower wick */}
        {[
          { x: 80, o: 180, c: 200, h: 170, l: 210, up: true },
          { x: 160, o: 200, c: 195, h: 185, l: 215, up: false },
          { x: 240, o: 195, c: 220, h: 180, l: 280, up: true, wick: true },
          { x: 320, o: 220, c: 215, h: 200, l: 235, up: false },
          { x: 400, o: 215, c: 195, h: 205, l: 220, up: false },
          { x: 480, o: 195, c: 175, h: 185, l: 200, up: false },
          { x: 560, o: 175, c: 165, h: 155, l: 180, up: false },
          { x: 640, o: 165, c: 145, h: 135, l: 170, up: false },
          { x: 720, o: 145, c: 130, h: 115, l: 150, up: false },
        ].map((c, i) => (
          <g key={i}>
            {/* wick line */}
            <line
              x1={c.x}
              y1={c.h}
              x2={c.x}
              y2={c.l}
              stroke={c.up ? "#22d3a7" : "#fb7185"}
              strokeWidth="1.5"
              opacity={c.wick ? 1 : 0.6}
            />
            {/* body */}
            <rect
              x={c.x - 12}
              y={Math.min(c.o, c.c)}
              width="24"
              height={Math.abs(c.c - c.o) || 2}
              fill={c.up ? "url(#candleUp)" : "url(#candleDown)"}
              rx="2"
            />
            {/* highlight wick tip on the rejection candle */}
            {c.wick && (
              <>
                <line
                  x1={c.x - 30}
                  y1={c.l}
                  x2={c.x + 30}
                  y2={c.l}
                  stroke="#00e5ff"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                  filter="url(#glow)"
                />
                <circle cx={c.x} cy={c.l} r="5" fill="#00e5ff" filter="url(#glow)">
                  <animate
                    attributeName="r"
                    values="3;7;3"
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                </circle>
                <text
                  x={c.x + 35}
                  y={c.l + 4}
                  fill="#00e5ff"
                  fontSize="11"
                  fontFamily="monospace"
                >
                  WICK TIP
                </text>
              </>
            )}
          </g>
        ))}

        {/* Arrow showing price revisiting the wick */}
        <path
          d="M 600 110 Q 500 90 350 200 Q 280 250 245 270"
          fill="none"
          stroke="#00e5ff"
          strokeWidth="2"
          strokeDasharray="6 4"
          opacity="0.7"
          markerEnd="url(#arrowHead)"
        />
        <defs>
          <marker
            id="arrowHead"
            markerWidth="8"
            markerHeight="8"
            refX="4"
            refY="4"
            orient="auto"
          >
            <path d="M 0 0 L 8 4 L 0 8 Z" fill="#00e5ff" />
          </marker>
        </defs>

        {/* BUY entry tag */}
        <g transform="translate(220, 295)">
          <rect
            x="0"
            y="0"
            width="70"
            height="22"
            rx="4"
            fill="rgba(34,211,167,0.15)"
            stroke="#22d3a7"
            strokeWidth="1"
          />
          <text x="35" y="15" fill="#22d3a7" fontSize="11" textAnchor="middle" fontWeight="bold">
            BUY ENTRY
          </text>
        </g>
      </svg>

      {/* Caption */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center justify-between text-xs">
          <span className="text-cyan-300 font-mono">XAUUSD · M1</span>
          <span className="text-white/70">استراتيجية تسليم الأذيل — Wick-to-Wick Rejection</span>
          <span className="text-cyan-300 font-mono">TP 10 / SL 7 pips</span>
        </div>
      </div>
    </div>
  );
}
