"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { ActivationScreen } from "@/components/screens/activation-screen";
import { Mt5LoginScreen } from "@/components/screens/mt5-login-screen";
import { DashboardScreen } from "@/components/screens/dashboard-screen";

export default function Home() {
  const stage = useAppStore((s) => s.stage);
  const activation = useAppStore((s) => s.activation);
  const setStage = useAppStore((s) => s.setStage);

  // Auto-restore stage on first load based on persisted activation state.
  useEffect(() => {
    if (activation.status === "ACTIVE" && activation.code) {
      // If we have a session token, go straight to dashboard.
      // Otherwise, advance to MT5 login.
      setStage(stage === "activation" ? "mt5-login" : stage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 grid-bg opacity-30 pointer-events-none" />
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      <div className="relative z-10">
        {stage === "activation" && <ActivationScreen />}
        {stage === "mt5-login" && <Mt5LoginScreen />}
        {stage === "dashboard" && <DashboardScreen />}
      </div>
    </main>
  );
}
