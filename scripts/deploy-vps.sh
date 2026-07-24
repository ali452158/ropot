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
META_API_TOKEN=eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIm10LXNlcnZlcjokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2IiwiYWNjb3VudDokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJtZXRhYXBpLXJlc3QtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDpmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiXX0seyJpZCI6Im1ldGFhcGktcnBjLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbImFjY291bnQ6JFVTRVJfSUQkOmZlOTA1ZjhhLTM4N2EtNDA1MS1iZjg3LWY4MThhZTEzOTM0NiJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOmZlOTA1ZjhhLTM4N2EtNDA1MS1iZjg3LWY4MThhZTEzOTM0NiJdfSx7ImlkIjoibWV0YXN0YXRzLWFwaSIsIm1ldGhvZHMiOlsibWV0YXN0YXRzLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDpmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiXX0seyJpZCI6InJpc2stbWFuYWdlbWVudC1hcGkiLCJtZXRob2RzIjpbInJpc2stbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiYWNjb3VudDokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2IiwidHJhY2tlcjokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJjb3B5ZmFjdG9yeS1hcGkiLCJtZXRob2RzIjpbImNvcHlmYWN0b3J5LWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDoqZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Iiwic3RyYXRlZ3k6JFVTRVJfSUQkOmZlOTA1ZjhhLTM4N2EtNDA1MS1iZjg3LWY4MThhZTEzOTM0NiIsInBvcnRmb2xpbzokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Iiwic3Vic2NyaWJlcjokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJtdC1tYW5hZ2VyLWFwaSIsIm1ldGhvZHMiOlsibXQtbWFuYWdlci1hcGk6cmVzdDpkZWFsaW5nOio6KiIsIm10LW1hbmFnZXItYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIm10LW1hbmFnZXI6JFVTRVJfSUQkOipmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiLCJtdC1hY2NvdW50OiRVU0VSX0lEJDpmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiLCJtdC1ncm91cDokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJiaWxsaW5nLWFwaSIsIm1ldGhvZHMiOlsiYmlsbGluZy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfV0sImlnbm9yZVJhdGVMaW1pdHMiOmZhbHNlLCJ0b2tlbklkIjoiMjAyMTAyMTMiLCJpbXBlcnNvbmF0ZWQiOmZhbHNlLCJyZWFsVXNlcklkIjoiOWEyNzJkOTBlNmE5ZDkwZTgxMzc4YmE3ZTgxOWMyNzIiLCJpYXQiOjE3ODQ5MTMwOTUsImV4cCI6MTc5MjY4OTA5NX0.R5QcAmFPrBwJG66st7VBTwm4RjYRDD0isp0xDAXMQ4XLn62IucsuFgI2FiYkm6ARAQ01lJz-LVSPabd3ffBgrM2kVJ1Dp37ah41KlRfD512rrxiuK2DfqfdAUTq6LziW9RbUQ0Hn0Z7JhGuy8jAiw_Ef7T-AKRzlPH2sTCjyrXR89vhID6niS8bYiqQUOBenaYUehBItsMMg0YLJtzPfgTxIzd_PaRcQ0TwdTThp870oD4HvIa_gacU5oNTbDXhDHiV-BWYyx7RyWmt7QlnMqxAPcDemPoC920eeiJhqv20U9QBmse--QC5Us0WNiFSd8AzV3-xSQfVVF69y_1vpnbHXKfHDhhGnSCdY0GP2NqDfQ82yQ4WNgJ8qX0ssgmmGoH-jcAu4Qi2d6QpRk-Scojq26N3TG3CrIGowy8EIFjHarSwbpuI6IqoJmKi2MasaENLgRUp54BigeO0V1s0VNvT--DKqstK3i1alxa8w6IGMPCUno4_0XFEEsexm8F3aA_dkIJ7ONpSlBTCGHgKavGD0bLxedRZhNIEt4QRbCV53yTZ9qtb1lV4JufqtowyxKq4o1f3NLEMA-UVRt93PCQgx_SSTwt2e1tPNxcdV_vOdv0CXP0DkjIxu6XYtK5XD_P724TbUVro8bh7b534N_3SDUvsqwRoZWqcaJ9yqiNw

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
