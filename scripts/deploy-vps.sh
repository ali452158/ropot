#!/usr/bin/env bash
# ============================================================
# ALFA Reports — One-shot deployment script for Hostinger VPS
# VPS: 76.13.40.219 (root@Ali@0164569934)
# Run this on the VPS itself (via SSH or Web Terminal)
# ============================================================
set -euo pipefail

echo "============================================================"
echo "  ALFA Reports — Hostinger VPS Deployment"
echo "  Target: 76.13.40.219"
echo "============================================================"
echo ""

# === Config ===
REPO_URL="https://github.com/ali452158/ropot.git"
PROJECT_DIR="/opt/ropot"

# === 1. Install Docker if missing ===
echo "[1/7] Checking Docker..."
if ! command -v docker >/dev/null 2>&1; then
    echo "      Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi
echo "      Docker: $(docker --version)"

# === 2. Clone repo (clean if exists) ===
echo ""
echo "[2/7] Cloning/updating repo at $PROJECT_DIR..."
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR"
    git fetch origin
    git reset --hard origin/main
    git pull origin main
else
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
fi
echo "      Latest commit: $(git rev-parse --short HEAD)"

# === 3. Write .env file with production values ===
echo ""
echo "[3/7] Writing production .env..."
cat > .env <<'ENVEOF'
# ============================================================
# ALFA Reports — Production .env (Hostinger VPS 76.13.40.219)
# Generated: 2026-07-22
# ============================================================

# --- Database ---
DATABASE_URL=file:/app/db/custom.db

# --- MetaAPI Cloud ---
META_API_TOKEN=eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiXSwicmVzb3VyY2VzIjpbImFjY291bnQ6JFVTRVJfSUQkOjdlZmU5MGY3LTg2ZDAtNGYwZC05YjgyLTlmZjE2OTAwOTg0NyJdfSx7ImlkIjoibWV0YWFwaS1yZXN0LWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiYWNjb3VudDokVVNFUl9JRCQ6N2VmZTkwZjctODZkMC00ZjBkLTliODItOWZmMTY5MDA5ODQ3Il19LHsiaWQiOiJtZXRhYXBpLXJwYy1hcGkiLCJtZXRob2RzIjpbIm1ldGFhcGktYXBpOndzOnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDo3ZWZlOTBmNy04NmQwLTRmMGQtOWI4Mi05ZmYxNjkwMDk4NDciXX0seyJpZCI6Im1ldGFhcGktcmVhbC10aW1lLXN0cmVhbWluZy1hcGkiLCJtZXRob2RzIjpbIm1ldGFhcGktYXBpOndzOnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDo3ZWZlOTBmNy04NmQwLTRmMGQtOWI4Mi05ZmYxNjkwMDk4NDciXX0seyJpZCI6Im1ldGFzdGF0cy1hcGkiLCJtZXRob2RzIjpbIm1ldGFzdGF0cy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiYWNjb3VudDokVVNFUl9JRCQ6N2VmZTkwZjctODZkMC00ZjBkLTliODItOWZmMTY5MDA5ODQ3Il19LHsiaWQiOiJyaXNrLW1hbmFnZW1lbnQtYXBpIiwibWV0aG9kcyI6WyJyaXNrLW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiXSwicmVzb3VyY2VzIjpbImFjY291bnQ6JFVTRVJfSUQkOjdlZmU5MGY3LTg2ZDAtNGYwZC05YjgyLTlmZjE2OTAwOTg0NyJdfV0sImlnbm9yZVJhdGVMaW1pdHMiOmZhbHNlLCJ0b2tlbklkIjoiMjAyMTAyMTMiLCJpbXBlcnNvbmF0ZWQiOmZhbHNlLCJyZWFsVXNlcklkIjoiOWEyNzJkOTBlNmE5ZDkwZTgxMzc4YmE3ZTgxOWMyNzIiLCJpYXQiOjE3ODQ3MzE5NjQsImV4cCI6MTc5MjUwNzk2NH0.MEGjdc0SDzgvKnkM8Liyz-vXdVi2gdA20TLIV2OUVYd0jgyZV6_KAzd_h18XaA7xLKvvlblZ2sGaKQOtfZf2TMUNXPUnTmBMRCgYWsW7kUBXB03hivSj2xso_GDsPQWk9jSmABkYxjb6An-tIUy9TQ_D10lL_0xbFFfYy9EWKGaPGgxGp3VAYZXHp6gypCoz93iuS0kvqVbUMMCl4ZD7hvFi5AGobZpstwghv2nYnnigrCk6ai52iZCMMCojPOj8kZMeb51pBqCiLoiihM_lCKwfIet1IpT5hL3wjyMIliqnneUWgl4fZB1bvcZ997RaxESQhyxWm6ebKotYWU1dzusd5WWXJRaCwxyk_TbhDrAulZz4Rv40ZJh4FBRRgmWTMSqiREZRPbZL_PLszzAFVf1ZcXPvku1RACfbU1Zb5U9kamKF6EQYR_vvs9gVhTfhkf3ASzK5uGpUJ7KcuA0E1pBE339oW_m5HnJtUqzVMuTRD6j0agvdpTopuABc9o9G1RuQTwirst9FdX3bfRJw2AWH3ZqYWG6stD2Z517wN43bcJ50Ccu3QIBokbFuDDsX8FUpjwYB5r4MUF3qfXxBw1AHHbmtN9vS8Jp_zpIeeS7NtLilFoyyFHTFfIML_EKbHFthTJTjj8CBDvTztAxRVyz0_ZSHJjOfK8ofsQCGgfc

META_API_PROVISIONING_DOMAIN=mt-provisioning.cloud-trail.com
META_API_CLIENT_REGION=new-york

# --- Telegram bot ---
TELEGRAM_BOT_TOKEN=8923618974:AAGW5G3-PTCWGUxv42VTn_oOEE8vXHnbzGg
ADMIN_TELEGRAM_ID=8258176711

# --- Shared admin secret ---
ADMIN_API_TOKEN=gApkk9OFa5LW7EtjkfSZSQybNU3JnVcv2zHlpBzjLB5Z8EF5

# --- App base URL ---
ALFA_APP_BASE_URL=http://76.13.40.219:3000
ENVEOF
chmod 600 .env
echo "      .env written (perms: 600, $(wc -c < .env) bytes)"

# === 4. Build + start the container ===
echo ""
echo "[4/7] Building + starting ALFA container (this takes 5-10 min)..."
docker compose down 2>/dev/null || true
docker compose up -d --build

# === 5. Wait for boot ===
echo ""
echo "[5/7] Waiting for container to boot..."
for i in {1..30}; do
    if curl -fsS http://localhost:3000/api/system/mode >/dev/null 2>&1; then
        echo "      Container is UP after ${i}0 seconds!"
        break
    fi
    sleep 10
    echo "      Still waiting... (${i}0s)"
done

# === 6. Verify deployment ===
echo ""
echo "[6/7] Verifying deployment..."
echo ""
echo "      Container status:"
docker compose ps
echo ""
echo "      Health check:"
curl -sS http://localhost:3000/api/system/mode | python3 -m json.tool 2>/dev/null || curl -sS http://localhost:3000/api/system/mode
echo ""
echo "      Robot image:"
curl -sI http://localhost:3000/alfa-robot.png | head -3

# === 7. Final summary ===
echo ""
echo "[7/7] Deployment summary"
echo "      ================================================="
echo "      App URL:        http://76.13.40.219:3000"
echo "      Container name: alfa-reports"
echo "      Service name:   alfa"
echo "      ================================================="
echo ""
echo "      Next steps:"
echo "        1. Open http://76.13.40.219:3000 in your browser"
echo "        2. Generate activation codes:"
echo "             docker exec alfa-reports bun run scripts/generate-test-codes.ts"
echo "        3. For HTTPS via Traefik + bot.scalper.com:"
echo "             See DEPLOY-HOSTINGER.md section 'Step 8'"
echo ""
echo "      Management commands:"
echo "        docker logs -f alfa-reports"
echo "        docker compose restart alfa"
echo "        docker compose down"
echo ""
echo "============================================================"
echo "  ✅ ALFA Reports is LIVE"
echo "============================================================"
