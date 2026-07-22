# syntax=docker/dockerfile:1.7
# ============================================================
# ALFA Reports — Dockerfile (Next.js 16 standalone + Prisma + Bun)
# Simplified for Hostinger Docker Manager compatibility
# ============================================================

# ---------- Stage 1: deps ----------
FROM oven/bun:1.1 AS deps
WORKDIR /app

COPY package.json bun.lock* package-lock.json* ./
COPY prisma ./prisma

RUN bun install --frozen-lockfile || bun install

# ---------- Stage 2: builder ----------
FROM oven/bun:1.1 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN bun run build

# ---------- Stage 3: runner ----------
FROM oven/bun:1.1 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=file:/app/db/custom.db

# OpenSSL for Prisma + curl for healthchecks + ca-certs
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Persistent data dir for SQLite
RUN mkdir -p /app/db

# ============ Copy Next.js standalone output ============
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# ============ Prisma and database files ============
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Also copy undici explicitly (required by MetaApi SSL fix)
COPY --from=builder /app/node_modules/undici ./node_modules/undici

EXPOSE 3000

# Run migrations then start the standalone server
CMD ["sh", "-c", "bunx prisma db push --accept-data-loss --schema=./prisma/schema.prisma && bun server.js"]
