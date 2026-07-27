#!/usr/bin/env bash
# ============================================================
# ALFA Reports — Safe deployment script for Hostinger VPS
# ============================================================
# This script is idempotent and safe to re-run. It:
#   1. Stops the existing containers (without deleting the DB volume)
#   2. Pulls the latest code from GitHub
#   3. Builds the image ONCE (shared between alfa + alfa-bot)
#   4. Starts the containers
#   5. Waits for the health check
#   6. Prints diagnostics
#
# Usage:
#   ./deploy-hostinger.sh           # full deploy
#   ./deploy-hostinger.sh --pull    # just pull + restart (no rebuild)
#   ./deploy-hostinger.sh --logs    # tail logs after deploy
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.hostinger.yml"
PROJECT_DIR="$(pwd)"

# Pretty log helper
log()  { echo -e "\033[36m[alfa]\033[0m $*"; }
ok()   { echo -e "\033[32m[ok]\033[0m $*"; }
warn() { echo -e "\033[33m[warn]\033[0m $*"; }
err()  { echo -e "\033[31m[err]\033[0m $*" >&2; }

# --- 1. Verify .env exists ---
if [[ ! -f .env ]]; then
  err ".env file not found in $PROJECT_DIR"
  err "Create it from .env.dockerhub (fill in your real values) and re-run."
  exit 1
fi

# Verify required env vars are non-empty (without printing values)
REQ_VARS=(META_API_TOKEN TELEGRAM_BOT_TOKEN ADMIN_TELEGRAM_ID ADMIN_API_TOKEN META_API_MASTER_LOGIN)
MISSING=()
for v in "${REQ_VARS[@]}"; do
  val=$(grep -E "^${v}=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
  if [[ -z "$val" || "$val" == your_*_here ]]; then
    MISSING+=("$v")
  fi
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  err "Required env vars are missing or still set to placeholders:"
  for v in "${MISSING[@]}"; do
    err "  - $v"
  done
  err "Edit .env and fill them in, then re-run this script."
  exit 1
fi
ok ".env verified (all required vars present)"

# --- 2. Stop existing containers (keep DB volume) ---
log "Stopping existing containers..."
docker compose -f "$COMPOSE_FILE" down --remove-orphans 2>&1 | sed 's/^/  /'
ok "Containers stopped"

# --- 3. Pull latest code ---
log "Pulling latest code from git..."
git pull --ff-only 2>&1 | sed 's/^/  /' || {
  warn "git pull failed — continuing with current code"
}

# --- 4. Build the image (or skip if --pull) ---
if [[ "${1:-}" != "--pull" ]]; then
  log "Building image (this can take 3-5 minutes)..."
  # Build only the `alfa` service — `alfa-bot` reuses the same image via `image:` tag
  docker compose -f "$COMPOSE_FILE" build --pull alfa 2>&1 | sed 's/^/  /'
  ok "Image built"
else
  log "Skipping rebuild (--pull mode)"
fi

# --- 5. Start containers ---
log "Starting containers..."
docker compose -f "$COMPOSE_FILE" up -d 2>&1 | sed 's/^/  /'
ok "Containers started"

# --- 6. Wait for web app to be healthy (max 60s) ---
log "Waiting for web app to be healthy (max 60s)..."
for i in $(seq 1 30); do
  health=$(docker inspect --format='{{.State.Health.Status}}' alfa-reports 2>/dev/null || echo "missing")
  if [[ "$health" == "healthy" ]]; then
    ok "Web app is healthy (after ${i}*2s)"
    break
  fi
  if [[ "$i" == "30" ]]; then
    warn "Web app not healthy after 60s — current status: $health"
    warn "Check logs: docker logs --tail=50 alfa-reports"
    break
  fi
  sleep 2
done

# --- 7. Print diagnostics ---
echo ""
log "=== Diagnostics ==="

log "Container status:"
docker compose -f "$COMPOSE_FILE" ps 2>&1 | sed 's/^/  /'

log "Web app mode + MetaApi connection:"
curl -fsS http://localhost:3000/api/system/mode 2>/dev/null | head -c 500 && echo "" || warn "  /api/system/mode not reachable yet"

log "Master account + price test (may take ~10s for first request):"
curl -fsS http://localhost:3000/api/system/diagnose 2>/dev/null | head -c 2000 && echo "" || warn "  /api/system/diagnose not reachable yet"

echo ""
ok "Deployment complete!"
echo ""
log "Useful commands:"
echo "  docker logs -f alfa-reports              # tail web app logs"
echo "  docker logs -f alfa-bot                  # tail Telegram bot logs"
echo "  docker compose -f $COMPOSE_FILE down    # stop everything"
echo "  docker compose -f $COMPOSE_FILE up -d   # start without rebuild"
