# syntax=docker/dockerfile:1.7
# ============================================================
# ALFA Reports — Dockerfile (Next.js 16 standalone + Prisma + Bun)
# Works on Hostinger VPS, Fly.io, Render, Railway, etc.
# ============================================================

# ---------- Stage 1: deps ----------
FROM oven/bun:1.1 AS deps
WORKDIR /app

# Copy lockfile + manifest first for better layer caching
COPY package.json bun.lock* package-lock.json* ./
COPY prisma ./prisma

# Install dependencies (prisma generate runs via postinstall)
RUN bun install --frozen-lockfile || bun install

# ---------- Stage 2: builder ----------
FROM oven/bun:1.1 AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time env (no secrets here — secrets come from .env at runtime)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the standalone Next.js output
RUN bun run build

# ---------- Stage 3: runner (minimal image) ----------
FROM oven/bun:1.1 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Default SQLite path inside container (overridable via .env)
ENV DATABASE_URL=file:/app/db/custom.db

# Install only what we need at runtime: openssl for Prisma + curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for safety
RUN groupadd --system --gid 1001 alfa \
    && useradd --system --uid 1001 --gid alfa --shell /bin/bash --create-home alfa

# Copy standalone build output
COPY --from=builder --chown=alfa:alfa /app/.next/standalone ./
COPY --from=builder --chown=alfa:alfa /app/.next/static ./.next/static
COPY --from=builder --chown=alfa:alfa /app/public ./public

# Copy Prisma schema + migrations so `prisma db push` works on first run
COPY --from=builder --chown=alfa:alfa /app/prisma ./prisma
COPY --from=builder --chown=alfa:alfa /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=alfa:alfa /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=alfa:alfa /app/node_modules/prisma ./node_modules/prisma

# Persistent data dir for SQLite
RUN mkdir -p /app/db && chown -R alfa:alfa /app/db

USER alfa
EXPOSE 3000

# Healthcheck: hit the API mode endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:3000/api/system/mode || exit 1

# Run migrations then start the standalone server
CMD ["sh", "-c", "bunx prisma db push --accept-data-loss --schema=./prisma/schema.prisma && bun server.js"]
