/**
 * Helper: get the internal MT5Session row id (cuid) by the public session token.
 * All other tables (BotConfig, Trade) reference MT5Session.id via FK.
 */
import { db } from "./db";

export async function getSessionIdByToken(sessionToken: string): Promise<string | null> {
  const row = await db.mT5Session.findUnique({
    where: { sessionId: sessionToken },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function getSessionByToken(sessionToken: string) {
  return db.mT5Session.findUnique({ where: { sessionId: sessionToken } });
}
