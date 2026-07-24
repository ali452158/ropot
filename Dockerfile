# syntax=docker/dockerfile:1.7
# ============================================================
# ALFA Reports — Dockerfile (Next.js 16 standalone + Prisma)
# Uses Node.js 22 for maximum compatibility with Next.js 16 build.
# ============================================================

# ---------- Stage 1: deps ----------
FROM node:22-slim AS deps
WORKDIR /app

# OpenSSL for Prisma + curl for healthchecks + ca-certs
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY prisma ./prisma

# Use --legacy-peer-deps to handle React 19 peer dep warnings from Radix UI
# Fallback to plain install if ci fails (lockfile mismatch)
RUN npm ci --legacy-peer-deps --no-audit --no-fund 2>/dev/null || \
    npm install --legacy-peer-deps --no-audit --no-fund

# ---------- Stage 2: builder ----------
FROM node:22-slim AS builder
WORKDIR /app

# OpenSSL needed by prisma generate during install
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Allow Next.js 16 build to use up to 4GB RAM (prevents OOM on small VPS)
ENV NODE_OPTIONS=--max-old-space-size=4096

RUN npm run build

# ============ Compile Telegram bot (standalone ESM) ============
# The polling bot lives in src/bot/polling-bot.ts and uses native fetch.
# We compile it with tsc to dist/bot/polling-bot.mjs so the runner stage can
# execute it via `node dist/bot/polling-bot.mjs`.
#
# The bot imports from ../lib/telegram — tsc preserves the relative import,
# so we compile BOTH files. We rename the output to .mjs to force Node to
# treat it as ESM (package.json has "type": "module" via Next.js 16 default).
RUN npx tsc \
    src/bot/polling-bot.ts \
    src/lib/telegram.ts \
    --module esnext \
    --moduleResolution bundler \
    --target es2022 \
    --skipLibCheck \
    --outDir dist/bot-compiled \
    --rootDir src \
    --esModuleInterop \
    --resolveJsonModule \
    --allowJs false \
    --noEmitOnError false 2>&1 | tail -10 || true

# Verify the bot was compiled (if not, log a warning — bot will be unavailable
# but the web app still works).
RUN ls -la dist/bot-compiled/bot/polling-bot.js 2>&1 || \
    echo "WARNING: Telegram bot was not compiled — bot service will fail to start."

# ---------- Stage 3: runner ----------
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=file:/app/db/custom.db
# Allow runtime Node to use more memory if needed
ENV NODE_OPTIONS=--max-old-space-size=2048

# OpenSSL for Prisma + curl for healthchecks
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

# ============ Copy FULL node_modules from builder ============
# Next.js standalone only bundles app deps. Prisma CLI needs its own
# deps (effect, c12, deepmerge-ts, @prisma/config, etc.) which are
# NOT included in standalone. Copying the full node_modules is the
# safest way to ensure prisma db push works at runtime.
COPY --from=builder /app/node_modules ./node_modules

# ============ Prisma and database files ============
COPY --from=builder /app/prisma ./prisma

# ============ Telegram bot script (compiled by tsc) ============
COPY --from=builder /app/dist/bot-compiled ./dist/bot-compiled

EXPOSE 3000

# Run migrations then start the standalone server
# Use node prisma/build/index.js directly to bypass PATH issues
CMD ["sh", "-c", "node ./node_modules/prisma/build/index.js db push --accept-data-loss --schema=./prisma/schema.prisma && node server.js"]
