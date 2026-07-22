#!/usr/bin/env bash
# ALFA Reports — GitHub Upload Helper
#
# USAGE:
#   ./scripts/upload-to-github.sh <github-repo-url>
#
# EXAMPLE:
#   ./scripts/upload-to-github.sh https://github.com/username/alfa-reports.git
#
# This script:
#   1. Initializes a git repo (if not already initialized)
#   2. Adds ONLY essential files (skips node_modules, .next, db, logs, etc.)
#   3. Creates an initial commit
#   4. Pushes to the GitHub repo you specify
#
# WHY THIS INSTEAD OF WEB UPLOAD:
#   GitHub's web uploader is limited to 100 files per upload. This project has
#   ~110+ source files. Using git CLI bypasses that limit entirely.

set -e

REPO_URL="${1:-}"
if [ -z "$REPO_URL" ]; then
  echo "ERROR: missing repo URL"
  echo "Usage: $0 <github-repo-url>"
  echo "Example: $0 https://github.com/username/alfa-reports.git"
  exit 1
fi

cd "$(dirname "$0")/.."
echo "Working directory: $(pwd)"
echo "Target repo:       $REPO_URL"
echo ""

# Step 1: Initialize git if needed
if [ ! -d ".git" ]; then
  echo ">>> Initializing git repository..."
  git init -q
  git branch -M main
else
  echo ">>> git repository already exists, skipping init."
fi

# Step 2: Make sure .gitignore is in place
if [ ! -f ".gitignore" ]; then
  echo ">>> Creating .gitignore..."
  cat > .gitignore <<'EOF'
node_modules/
.next/
out/
build/
dist/
*.log
.env
.env.local
.env.*.local
db/*.db
db/*.db-journal
*.tsbuildinfo
.npm
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions
coverage/
.DS_Store
*.pem
.idea/
.vscode/
*.swp
.tox
EOF
fi

# Step 3: Configure git user if not set (GitHub Actions-safe)
if ! git config user.email > /dev/null; then
  git config user.email "alfa-reports@local"
  git config user.name  "ALFA Reports"
fi

# Step 4: Add files (git respects .gitignore automatically)
echo ">>> Adding files (respecting .gitignore)..."
git add -A

# Show what's about to be committed
echo ""
echo ">>> Files staged for commit (count):"
git diff --cached --name-only | wc -l
echo ""
echo ">>> First 20 files:"
git diff --cached --name-only | head -20
echo "..."

# Step 5: Commit
echo ""
echo ">>> Creating commit..."
git commit -q -m "Initial commit: ALFA Reports trading bot" || {
  echo ">>> Nothing to commit — repository already up to date."
}

# Step 6: Add remote
echo ">>> Adding remote 'origin'..."
if git remote get-url origin > /dev/null 2>&1; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

# Step 7: Push
echo ""
echo ">>> Pushing to GitHub..."
echo "    (you may be prompted for your GitHub username + Personal Access Token)"
git push -u origin main

echo ""
echo "✓ Done! Your project is now on GitHub at:"
echo "  ${REPO_URL%.git}"
