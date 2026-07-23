#!/usr/bin/env bash
# ============================================================
# ALFA Reports — ONE-COMMAND INSTALLER for Hostinger VPS
# ============================================================
# This script does EVERYTHING on the VPS:
#   1. Installs Docker
#   2. Clones the project from GitHub
#   3. Builds the Docker image locally (no Docker Hub needed)
#   4. Creates .env from template
#   5. Starts the container
#
# USAGE — just paste this ONE line into Hostinger Browser Terminal:
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/ali452158/ropot/main/scripts/install-hostinger.sh)
#
# After it finishes, edit /opt/alfa/.env with your real tokens,
# then run:  cd /opt/alfa && docker compose restart
# ============================================================

set -e

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ALFA Reports — One-Command Installer for Hostinger VPS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ---------- Step 1: Install Docker ----------
echo "▶ [1/5] Checking Docker..."
if ! command -v docker &> /dev/null; then
  echo "  Docker not found. Installing..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "  ✅ Docker installed"
else
  echo "  ✅ Docker already installed: $(docker --version)"
fi

# ---------- Step 2: Clone project ----------
echo ""
echo "▶ [2/5] Cloning project from GitHub..."
mkdir -p /opt/alfa
cd /opt/alfa

if [ -d ".git" ]; then
  echo "  Project folder exists. Pulling latest..."
  git pull --rebase || true
else
  git clone https://github.com/ali452158/ropot.git .
fi
echo "  ✅ Project cloned to /opt/alfa"

# ---------- Step 3: Create .env if not exists ----------
echo ""
echo "▶ [3/5] Setting up .env file..."
if [ -f ".env" ]; then
  echo "  .env already exists. Skipping (won't overwrite your secrets)."
else
  if [ -f ".env.example" ]; then
    cp .env.example .env
    echo "  ✅ Created .env from .env.example"
    echo "  ⚠️  IMPORTANT: You MUST edit /opt/alfa/.env and fill in your real tokens!"
  fi
fi

# ---------- Step 4: Build & Start ----------
echo ""
echo "▶ [4/5] Building Docker image (this takes 5-15 minutes)..."
echo "  Building on the VPS directly (no Docker Hub needed)..."
echo ""
docker compose build

echo ""
echo "▶ [5/5] Starting container..."
docker compose up -d

# ---------- Final check ----------
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  🎉 INSTALLATION COMPLETE!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Container status:"
docker compose ps
echo ""
echo "───────────────────────────────────────────────────────────────"
echo "  NEXT STEPS:"
echo "───────────────────────────────────────────────────────────────"
echo ""
echo "1. Edit the .env file with your real tokens:"
echo ""
echo "   nano /opt/alfa/.env"
echo ""
echo "   Fill in these values (replace placeholder text):"
echo "     META_API_TOKEN       (from https://app.metaapi.cloud)"
echo "     TELEGRAM_BOT_TOKEN   (from @BotFather)"
echo "     ADMIN_TELEGRAM_ID    (from @userinfobot)"
echo "     ALFA_APP_BASE_URL    (http://YOUR_VPS_IP:3000)"
echo ""
echo "   Save: Ctrl+O, Enter, Ctrl+X"
echo ""
echo "2. Restart the container to apply .env:"
echo ""
echo "   cd /opt/alfa && docker compose restart"
echo ""
echo "3. Open in your browser:"
echo ""
echo "   http://YOUR_VPS_IP:3000"
echo ""
echo "───────────────────────────────────────────────────────────────"
echo ""
echo "Useful commands:"
echo "  View logs:    cd /opt/alfa && docker compose logs -f"
echo "  Stop:         cd /opt/alfa && docker compose down"
echo "  Restart:      cd /opt/alfa && docker compose restart"
echo ""
