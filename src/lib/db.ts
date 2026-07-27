import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Prisma client.
 *
 * Logging: We used to enable `log: ['query']` which prints EVERY SQL query
 * to stdout. That floods the container logs and obscures real errors (e.g.
 * MetaApi 429s, bot exceptions). Query logging is now gated behind the
 * PRISMA_LOG_QUERY env var so it can be toggled at runtime for debugging
 * without flooding production logs by default.
 *
 * Global caching: Always cache on globalThis (not just in dev). Next.js
 * dev hot-reloads modules and would otherwise create a new PrismaClient
 * on every reload, exhausting DB connections.
 */
const enableQueryLog = process.env.PRISMA_LOG_QUERY === '1' ||
  process.env.PRISMA_LOG_QUERY === 'true';

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: enableQueryLog
      ? ['query', 'error', 'warn']
      : ['error', 'warn'],
  })

// Always cache the singleton on globalThis to survive Next.js HMR.
if (!globalForPrisma.prisma) globalForPrisma.prisma = db
