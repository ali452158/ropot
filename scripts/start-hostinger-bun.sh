#!/usr/bin/env bash
# ============================================================
# ALFA Reports — Quick start (no Docker, Bun only)
# For Hostinger VPS Web Terminal — minimal footprint
# ============================================================
set -euo pipefail

PROJECT_DIR="/opt/alfa"
REPO_URL="https://github.com/ali452158/ropot.git"

echo "=== ALFA Reports — Quick Start (Bun, no Docker) ==="

# Install Bun if missing
if ! command -v bun >/dev/null 2>&1; then
    echo "[1/6] Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
    # Persist in shell rc
    grep -q 'BUN_INSTALL' "$HOME/.bashrc" 2>/dev/null || \
        echo 'export BUN_INSTALL="$HOME/.bun"' >> "$HOME/.bashrc"
    grep -q 'BUN_INSTALL/bin' "$HOME/.bashrc" 2>/dev/null || \
        echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> "$HOME/.bashrc"
fi
echo "      Bun: $(bun --version)"

# Clone or pull
echo "[2/6] Cloning repo..."
if [ -d "$PROJECT_DIR" ]; then
    cd "$PROJECT_DIR" && git pull --rebase
else
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
fi

# .env
echo "[3/6] Preparing .env..."
if [ ! -f "$PROJECT_DIR/.env" ]; then
    cp .env.example .env
    # Fix DATABASE_URL to absolute path
    sed -i "s|DATABASE_URL=.*|DATABASE_URL=file:$PROJECT_DIR/db/custom.db|" .env
    echo "      .env created. Edit it: nano $PROJECT_DIR/.env"
    echo "      Then re-run this script."
    exit 0
fi

# Install + generate Prisma
echo "[4/6] Installing dependencies + generating Prisma client..."
bun install

# Build
echo "[5/6] Building Next.js..."
bun run build

# DB push
echo "[6/6] Pushing database schema..."
bun run db:push

# Start
echo ""
echo "=== READY ==="
echo "Starting app on port 3000..."
echo "Logs: tail -f $PROJECT_DIR/server.log"
echo "Stop: kill \$(cat /tmp/alfa.pid)"
echo ""
nohup bun run start > server.log 2>&1 &
echo $! > /tmp/alfa.pid
sleep 3
echo "PID: $(cat /tmp/alfa.pid)"
echo "URL: http://$(curl -s ifconfig.me 2>/dev/null || echo localhost):3000"
echo ""
echo "Health check:"
curl -s http://localhost:3000/api/system/mode || echo "(waiting for boot...)"
