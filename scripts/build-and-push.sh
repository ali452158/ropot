#!/usr/bin/env bash
# ============================================================
# ALFA Reports — Build & Push Docker Image to Docker Hub
# ============================================================
# This script runs on YOUR local machine (or any machine with Docker installed)
# — NOT on Hostinger VPS.
#
# Hostinger Docker Manager does NOT build from Dockerfile.
# It only accepts pre-built images from Docker Hub / GHCR.
# So we build here, push to Docker Hub, then Hostinger pulls the image.
#
# Prerequisites:
#   1. Docker Desktop installed (https://www.docker.com/products/docker-desktop/)
#   2. Docker Hub account (https://hub.docker.com/signup)
#   3. Run: docker login
#
# Usage:
#   chmod +x scripts/build-and-push.sh
#   ./scripts/build-and-push.sh <dockerhub-username>
#
# Example:
#   ./scripts/build-and-push.sh ali452158
# ============================================================

set -euo pipefail

# ---------- Args ----------
DOCKER_USER="${1:-}"
if [[ -z "$DOCKER_USER" ]]; then
  echo "❌ Usage: $0 <dockerhub-username>"
  echo "   Example: $0 ali452158"
  exit 1
fi

IMAGE_NAME="alfa-reports"
TAG_LATEST="${DOCKER_USER}/${IMAGE_NAME}:latest"
TAG_VERSIONED="${DOCKER_USER}/${IMAGE_NAME}:$(date +%Y%m%d-%H%M%S)"

# ---------- Pre-flight checks ----------
echo "🔍 Pre-flight checks..."

if ! command -v docker &> /dev/null; then
  echo "❌ Docker is not installed."
  echo "   Install: https://www.docker.com/products/docker-desktop/"
  exit 1
fi

if ! docker info &> /dev/null; then
  echo "❌ Docker daemon is not running. Start Docker Desktop first."
  exit 1
fi

# Make sure we're in the project root (where Dockerfile lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

if [[ ! -f "Dockerfile" ]]; then
  echo "❌ Dockerfile not found at $PROJECT_ROOT/Dockerfile"
  exit 1
fi

echo "✅ Project root: $PROJECT_ROOT"
echo "✅ Docker is running"
echo "✅ Docker Hub user: $DOCKER_USER"
echo ""

# ---------- Docker Hub login (if not already logged in) ----------
if ! docker system info 2>/dev/null | grep -q "Username:"; then
  echo "🔑 You need to log in to Docker Hub..."
  docker login
  if [[ $? -ne 0 ]]; then
    echo "❌ Docker login failed."
    exit 1
  fi
fi
echo "✅ Logged in to Docker Hub"
echo ""

# ---------- Build ----------
echo "🔨 Building image: $TAG_LATEST"
echo "   (This will take 5-15 minutes the first time — Next.js build is heavy)"
echo ""

docker build \
  --platform linux/amd64 \
  -t "$TAG_LATEST" \
  -t "$TAG_VERSIONED" \
  -f Dockerfile \
  .

if [[ $? -ne 0 ]]; then
  echo "❌ Docker build failed. Check the errors above."
  exit 1
fi

echo ""
echo "✅ Build successful!"
echo "   - $TAG_LATEST"
echo "   - $TAG_VERSIONED"
echo ""

# ---------- Push ----------
echo "📤 Pushing to Docker Hub..."

docker push "$TAG_LATEST"
if [[ $? -ne 0 ]]; then
  echo "❌ Failed to push $TAG_LATEST"
  exit 1
fi

docker push "$TAG_VERSIONED"
if [[ $? -ne 0 ]]; then
  echo "❌ Failed to push $TAG_VERSIONED"
  exit 1
fi

echo ""
echo "✅ Push successful!"
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "🎉  IMAGE IS NOW ON DOCKER HUB"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Image: $TAG_LATEST"
echo ""
echo "Next steps:"
echo "  1. Go to Hostinger → Docker Manager"
echo "  2. Create new container from image: $TAG_LATEST"
echo "  3. Set port: 3000 → 3000"
echo "  4. Set environment variables (or mount .env file)"
echo "  5. Set volume: /app/db for SQLite persistence"
echo ""
echo "Or use docker-compose.hostinger.yml:"
echo "  - Edit it and replace YOUR_DOCKERHUB_USERNAME with: $DOCKER_USER"
echo "  - Upload it to Hostinger and run: docker compose -f docker-compose.hostinger.yml up -d"
echo ""
