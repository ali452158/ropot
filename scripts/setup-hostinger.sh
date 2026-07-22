#!/usr/bin/env bash
# ============================================================
# ALFA Reports — One-shot setup script for Hostinger VPS
# Run as root: bash setup-hostinger.sh
# ============================================================
set -euo pipefail

PROJECT_DIR="/opt/alfa"
REPO_URL="https://github.com/ali452158/ropot.git"

echo "=== ALFA Reports — Setup on Hostinger VPS ==="
echo ""

# 1. Detect package manager
PKG=""
if command -v apt >/dev/null 2>&1; then PKG="apt"
elif command -v dnf >/dev/null 2>&1; then PKG="dnf"
elif command -v yum >/dev/null 2>&1; then PKG="yum"
else echo "Unsupported distro"; exit 1; fi

echo "[1/7] Updating system packages..."
$PKG update -y >/dev/null

echo "[2/7] Installing curl + git + ca-certificates..."
$PKG install -y curl git ca-certificates >/dev/null

echo "[3/7] Installing Docker..."
if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi
echo "      Docker version: $(docker --version)"

echo "[4/7] Cloning repo into $PROJECT_DIR..."
if [ -d "$PROJECT_DIR" ]; then
    echo "      Directory exists — pulling latest..."
    cd "$PROJECT_DIR" && git pull --rebase
else
    git clone "$REPO_URL" "$PROJECT_DIR"
    cd "$PROJECT_DIR"
fi

echo "[5/7] Preparing .env..."
if [ ! -f "$PROJECT_DIR/.env" ]; then
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    echo "      .env created from template — EDIT IT NOW: nano $PROJECT_DIR/.env"
    echo "      Then re-run this script OR continue to step 6."
    echo ""
    echo "      Press Enter after editing .env (or Ctrl+C to abort)..."
    read -r
fi

echo "[6/7] Building and starting Docker container..."
docker compose up -d --build

echo "[7/7] Opening firewall port 3000..."
if command -v ufw >/dev/null 2>&1; then
    ufw allow 3000/tcp >/dev/null 2>&1 || true
fi

echo ""
echo "=== SETUP COMPLETE ==="
echo ""
echo "Container status:"
docker compose ps
echo ""
echo "App URL: http://$(curl -s ifconfig.me):3000"
echo "Health:   curl http://localhost:3000/api/system/mode"
echo ""
echo "Logs:     docker compose logs -f alfa"
echo "Stop:     docker compose down"
echo "Update:   git pull && docker compose up -d --build"
