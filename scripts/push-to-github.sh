#!/usr/bin/env bash
# ============================================================
# ALFA Reports — Force push complete project to GitHub
# ============================================================
# Solves: "GitHub repo only has Dockerfile + docker-compose.yml,
#          missing all Next.js files (package.json, prisma/, src/)"
#
# Usage (run from inside the project directory that has all files):
#   bash scripts/push-to-github.sh
#
# Or with custom repo URL:
#   GITHUB_REPO=https://github.com/user/repo.git bash scripts/push-to-github.sh
#
# Prerequisites:
#   - git installed
#   - GitHub Personal Access Token (PAT) with "repo" scope
#     Create one: https://github.com/settings/tokens/new?scopes=repo
# ============================================================
set -euo pipefail

# === Config (override via env vars) ===
GITHUB_REPO="${GITHUB_REPO:-https://github.com/ali452158/ropot.git}"
BRANCH="${BRANCH:-main}"
COMMIT_MSG="${COMMIT_MSG:-Push complete ALFA Reports project (Next.js + Prisma + Docker)}"

echo "============================================================"
echo "  ALFA Reports — Force Push to GitHub"
echo "============================================================"
echo ""
echo "Repository: $GITHUB_REPO"
echo "Branch:     $BRANCH"
echo ""

# === Sanity checks ===
if [ ! -f "package.json" ]; then
    echo "ERROR: package.json not found in current directory."
    echo "       Run this script from the project root (where package.json lives)."
    exit 1
fi

if [ ! -f "Dockerfile" ]; then
    echo "ERROR: Dockerfile not found."
    exit 1
fi

if [ ! -d "prisma" ]; then
    echo "ERROR: prisma/ directory not found."
    exit 1
fi

if [ ! -d "src" ]; then
    echo "ERROR: src/ directory not found."
    exit 1
fi

echo "Project structure OK — all critical files present."
echo ""

# === Check git installed ===
if ! command -v git >/dev/null 2>&1; then
    echo "ERROR: git not installed. Install with: apt install -y git"
    exit 1
fi

# === Configure git if needed ===
if [ -z "$(git config user.name)" ]; then
    git config user.name "ALFA Reports Bot"
fi
if [ -z "$(git config user.email)" ]; then
    git config user.email "alfa@users.noreply.github.com"
fi

# === Init git repo if not already ===
if [ ! -d ".git" ]; then
    echo "[1/5] Initializing git repo..."
    git init -b "$BRANCH" 2>/dev/null || git init
else
    echo "[1/5] Existing git repo detected."
fi

# === Stage ALL files (respecting .gitignore) ===
echo "[2/5] Staging files..."
git add -A

# Show summary
ADDED=$(git diff --cached --name-only | wc -l | tr -d ' ')
echo "      Files staged: $ADDED"

if [ "$ADDED" -lt 50 ]; then
    echo ""
    echo "WARNING: Only $ADDED files staged. Expected ~150+."
    echo "         Check .gitignore — it may be too aggressive."
    echo ""
    read -p "Continue anyway? (y/N) " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "Aborted."
        exit 1
    fi
fi

# === Commit ===
echo "[3/5] Committing..."
git commit -m "$COMMIT_MSG" --allow-empty 2>&1 | tail -3 || true

# === Add remote ===
echo "[4/5] Adding remote..."
if git remote get-url origin >/dev/null 2>&1; then
    git remote set-url origin "$GITHUB_REPO"
else
    git remote add origin "$GITHUB_REPO"
fi

# === Push ===
echo "[5/5] Pushing to GitHub..."
echo ""
echo "  If asked for credentials:"
echo "    Username: your-github-username"
echo "    Password: your-github-PAT (NOT your password)"
echo "  Or set: export GIT_ASKPASS= ; git -c credential.helper= push"
echo ""

# Try push — may prompt for credentials
if git push -u origin "$BRANCH" --force 2>&1; then
    echo ""
    echo "============================================================"
    echo "  SUCCESS — Project pushed to GitHub"
    echo "============================================================"
    echo ""
    echo "Repo: $GITHUB_REPO"
    echo "Files: $ADDED"
    echo ""
    echo "Now on Hostinger VPS:"
    echo "  git clone $GITHUB_REPO"
    echo "  cd ropot"
    echo "  cp .env.example .env && nano .env"
    echo "  docker compose up -d --build"
else
    echo ""
    echo "============================================================"
    echo "  PUSH FAILED — likely auth issue"
    echo "============================================================"
    echo ""
    echo "Fix option 1 — use a Personal Access Token (PAT) in the URL:"
    echo "  GITHUB_REPO=https://<USERNAME>:<PAT>@github.com/ali452158/ropot.git \\"
    echo "  bash scripts/push-to-github.sh"
    echo ""
    echo "Fix option 2 — configure credential helper:"
    echo "  git config --global credential.helper store"
    echo "  echo 'https://<USERNAME>:<PAT>@github.com' > ~/.git-credentials"
    echo "  bash scripts/push-to-github.sh"
    echo ""
    echo "Create a PAT at:"
    echo "  https://github.com/settings/tokens/new?scopes=repo"
    exit 1
fi
