/**
 * Next.js instrumentation hook — runs ONCE on server startup (before any
 * request is handled). Used here to AUTO-RESUME bot loops for any sessions
 * that were marked `botRunning: true` in the DB but lost their in-memory
 * loop when the container restarted (e.g., after a redeploy).
 *
 * Without this hook, every container restart silently kills all running
 * bot loops — the DB still says `botRunning: true` but no `setInterval`
 * is actually firing, so the bot "freezes" and stops opening trades.
 *
 * Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register() {
  // Only run on the server (not on edge runtime / build).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Defer the actual resume work to a tick later — the DB client and
  // bot-runner module need to be fully loaded first, and importing them
  // synchronously inside `register()` can cause circular-import issues.
  setImmediate(async () => {
    try {
      const { db } = await import("./src/lib/db");
      const { startBot } = await import("./src/lib/bot-runner");

      // Find all sessions whose bot was running when the container last stopped.
      const configs = await db.botConfig.findMany({
        where: { botRunning: true },
        include: { session: true },
      });

      if (configs.length === 0) {
        console.log(
          "[instrumentation] No bot sessions to resume (none marked botRunning=true)."
        );
        return;
      }

      console.log(
        `[instrumentation] Resuming ${configs.length} bot session(s) after container restart...`
      );

      let resumed = 0;
      let failed = 0;
      for (const cfg of configs) {
        const session = (cfg as any).session;
        if (!session) {
          console.warn(
            `[instrumentation] BotConfig ${cfg.id} has no associated session — skipping.`
          );
          failed++;
          continue;
        }
        // Only resume sessions that are still ACTIVE (not CLOSED/EXPIRED).
        if (session.status !== "ACTIVE") {
          console.log(
            `[instrumentation] Session ${session.sessionId.slice(0, 8)}... status=${session.status} — skipping.`
          );
          continue;
        }
        const token = session.sessionId;
        const result = await startBot(token);
        if (result.ok) {
          resumed++;
          console.log(
            `[instrumentation] ✓ Resumed bot for session ${token.slice(0, 8)}... (login=${session.mt5Login})`
          );
        } else {
          failed++;
          console.warn(
            `[instrumentation] ✗ Failed to resume session ${token.slice(0, 8)}... : ${result.error}`
          );
        }
      }

      console.log(
        `[instrumentation] Resume complete: ${resumed} resumed, ${failed} failed.`
      );
    } catch (e: any) {
      console.error(
        `[instrumentation] Auto-resume error:`,
        e?.message || String(e)
      );
    }
  });
}
