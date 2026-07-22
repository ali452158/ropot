"use client";

import { motion } from "framer-motion";

export function AlfaLogo({ size = 64 }: { size?: number }) {
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* Outer rotating ring */}
      <motion.svg
        viewBox="0 0 100 100"
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      >
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="url(#ringGrad)"
          strokeWidth="2"
          strokeDasharray="6 4"
        />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00e5ff" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
      </motion.svg>

      {/* Inner static logo */}
      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-700/20 border border-cyan-400/40 flex items-center justify-center neon-glow">
        <svg viewBox="0 0 100 100" className="w-3/4 h-3/4">
          {/* Stylized "A" of ALFA + chart arrow */}
          <path
            d="M50 18 L78 82 L65 82 L60 70 L40 70 L35 82 L22 82 Z M44 60 L56 60 L50 42 Z"
            fill="none"
            stroke="#00e5ff"
            strokeWidth="3"
            strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 0 6px rgba(0,229,255,0.7))" }}
          />
          <path
            d="M20 60 L35 48 L48 56 L62 40 L78 28"
            fill="none"
            stroke="#5cd5ff"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="3 3"
            opacity="0.6"
          />
        </svg>
      </div>
    </div>
  );
}

export function AlfaWordmark({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-black tracking-tight neon-text">ALFA</span>
        <span className="text-3xl font-light tracking-[0.3em] text-white/90 text-glow-white">
          REPORTS
        </span>
      </div>
      {subtitle && (
        <span className="text-[10px] tracking-[0.4em] text-cyan-300/70 uppercase mt-1">
          Automated MT5 Trading Bot
        </span>
      )}
    </div>
  );
}
