#!/usr/bin/env bash
# ============================================================
# ALFA Reports — One-Click Deployment Script for Hostinger VPS
# ============================================================
# This script:
#   1. Stops & removes existing containers/images
#   2. Removes the old project directory
#   3. Clones the latest code from GitHub
#   4. Creates .env with the new strong MetaApi token
#      (copyfactory-api:writer + mt-manager-api:writer on ALL resources)
#   5. Builds & starts the Docker container
#   6. Streams the logs
#
# Usage on VPS:
#   bash <(curl -fsSL https://raw.githubusercontent.com/ali452158/ropot/main/deploy-hostinger.sh)
# ============================================================

set -e

# Colors for nicer output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_step() {
  echo -e "\n${CYAN}=== $1 ===${NC}"
}
print_ok() {
  echo -e "${GREEN}✓ $1${NC}"
}
print_warn() {
  echo -e "${YELLOW}⚠ $1${NC}"
}
print_err() {
  echo -e "${RED}✗ $1${NC}"
}

# ============================================================
print_step "Step 1/6: Stop & remove existing containers and images"
# ============================================================
cd /opt/ropot 2>/dev/null && docker compose -f docker-compose.hostinger.yml down -v --rmi all 2>/dev/null || true
docker rm -f alfa-reports 2>/dev/null || true
docker rmi -f ropot-alfa:latest 2>/dev/null || true
docker system prune -af 2>/dev/null || true
print_ok "Old containers and images removed"

# ============================================================
print_step "Step 2/6: Remove old project directory and clone fresh from GitHub"
# ============================================================
cd /opt
rm -rf ropot
git clone https://github.com/ali452158/ropot.git
cd ropot
print_ok "Project cloned from GitHub"

# Show last commit for verification
echo -e "${YELLOW}Latest commit:${NC}"
git log --oneline -1

# ============================================================
print_step "Step 3/6: Verify new CopyFactory files are present"
# ============================================================
if [ -f "src/app/api/admin/copyfactory/strategy/route.ts" ]; then
  print_ok "admin/copyfactory/strategy endpoint exists"
else
  print_err "admin/copyfactory/strategy endpoint MISSING"
  exit 1
fi

if [ -f "src/app/api/copyfactory/strategy-info/route.ts" ]; then
  print_ok "copyfactory/strategy-info endpoint exists"
else
  print_err "copyfactory/strategy-info endpoint MISSING"
  exit 1
fi

if grep -q "createStrategy" src/lib/copyfactory.ts; then
  print_ok "createStrategy() function present in copyfactory.ts"
else
  print_err "createStrategy() function MISSING in copyfactory.ts"
  exit 1
fi

if grep -q "setStage(\"copyfactory-login\")" src/components/screens/activation-screen.tsx; then
  print_ok "activation screen defaults to CopyFactory flow"
else
  print_err "activation screen NOT defaulting to CopyFactory"
  exit 1
fi

if [ -f "src/bot/polling-bot.ts" ] && [ -f "src/lib/telegram.ts" ]; then
  print_ok "Telegram bot files present (src/bot/polling-bot.ts + src/lib/telegram.ts)"
else
  print_err "Telegram bot files MISSING"
  exit 1
fi

# ============================================================
print_step "Step 4/6: Create .env with the new strong CopyFactory-enabled token"
# ============================================================
# Token permissions (verified by decoding JWT):
#   - metaapi-rest-api:writer (bound to master account fe905f8a-...)
#   - metaapi-rpc-api:writer (bound to master account)
#   - metaapi-real-time-streaming-api:writer (bound to master account)
#   - metastats-api:reader
#   - risk-management-api:reader
#   - copyfactory-api:writer  on ALL resources (*:$USER_ID$:*)  <-- KEY PERMISSION
#   - mt-manager-api:writer   on ALL resources (*:$USER_ID$:*)
# Token expires: 2026-10-22
cat > .env << 'ENVEOF'
META_API_TOKEN=eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiYWNjb3VudDokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJtZXRhYXBpLXJlc3QtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDpmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiXX0seyJpZCI6Im1ldGFhcGktcnBjLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbImFjY291bnQ6JFVTRVJfSUQkOmZlOTA1ZjhhLTM4N2EtNDA1MS1iZjg3LWY4MThhZTEzOTM0NiJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbImFjY291bnQ6JFVTRVJfSUQkOmZlOTA1ZjhhLTM4N2EtNDA1MS1iZjg3LWY4MThhZTEzOTM0NiJdfSx7ImlkIjoibWV0YXN0YXRzLWFwaSIsIm1ldGhvZHMiOlsibWV0YXN0YXRzLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDpmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiXX0seyJpZCI6InJpc2stbWFuYWdlbWVudC1hcGkiLCJtZXRob2RzIjpbInJpc2stbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiYWNjb3VudDokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJjb3B5ZmFjdG9yeS1hcGkiLCJtZXRob2RzIjpbImN3b3B5ZmFjdG9yeS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibXQtbWFuYWdlci1hcGkiLCJtZXRob2RzIjpbIm10LW1hbmFnZXItYXBpOnJlc3Q6ZGVhbGluZzoqOioiLCJtdC1tYW5hZ2VyLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19XSwiaWdub3JlUmF0ZUxpbWl0cyI6ZmFsc2UsInRva2VuSWQiOiIyMDIxMDIxMyIsImltcGVyc29uYXRlZCI6ZmFsc2UsInJlYWxVc2VySWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImlhdCI6MTc4NDkwMTU0MywiZXhwIjoxNzkyNjc3NTQzfQ.KMZoBn-mAc_LJwM1wcxhuqayam9w-jg10QtllVod3w8fK8MN9qPRATimfFRZb5i1mUOJUvL882S_Z0MZCrf3C3vB2jl1F-He9N9-8yXVeQBdrKeAvuKG11mvtlm5FgGYb7zei4t0dWEx06Kwtg506bpgFALRlpVazC1sqcT2S3ay6thJPs58gNxKrvDx0qrvx2T3UnjBct3L1S0GeYKfZFD8Fof_POKHEBdwUCGolqJ_5Ulh3QqKVnHj-kasWMDpSHRf6puLRkT4ht4sPsezUv3RTl7Qx9Cjc64jURW8tnVrNsAIQTKGNYq3_Fa2roVCb4bss13LWal0o0tMOBXnRgSIi_NSpJInSAHBDpu7XC-w3FxpnmJ1V21Esl7DaTokkfEcaQoGUMYvZSCnvrDUC9P2nf0_JJFDTsqYhgYj4tFkC7Z3qd4jrnnMrW8cVLiFUzgncAQTtz1wPca2nrmqwvj0iaZCDkb51XE5U7DYhVQ7uJB75Cuwe2l-V2x9ew2EtRgmtfKG5-_lrXY23U-LWaU7j0yO62qdoVQpvE9ASPuPOmtJdgykI85jL1x3fIj0XVpFHTmSA-XghRpj9h4m4eowIOLmS_3iFrOe0f6451J85-QofydDgRv7KKgtcZ6cMRQvoeUqvOatlLESsrkBPhQD2MIONNICF_BD89Y-2a8
META_API_PROVISIONING_DOMAIN=mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai
META_API_MASTER_LOGIN=474240052
ADMIN_API_TOKEN=uosL8m8cV43mBlw2D5qyMKG6Cvio9xyfB1b88K6eLyTi05a9
DATABASE_URL=file:/app/db/custom.db
# CopyFactory — strategy already created manually on MetaApi Cloud dashboard.
# Strategy "Gold Reader" is bound to master MetaApi account 7efe90f7-86d0-4f0d-9b82-9ff169009847
# which is connected to MT5 login 474240052 on Exness-MT5Trial15.
COPYFACTORY_STRATEGY_ID=fe905f8a-387a-4051-bf87-f818ae139346
# Telegram bot (long-polling sidecar) — generates activation codes via /api/codes/generate
# Bot token from @BotFather; admin Telegram IDs (comma-separated) who can use the bot.
TELEGRAM_BOT_TOKEN=7247077218:AAF9v9Z0AEzyH91E8cUhSvuF2DLt0y6wBC4
TELEGRAM_ADMIN_IDS=2021972361
ENVEOF

if grep -q "^META_API_TOKEN=eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiYWNjb3VudDokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJtZXRhYXBpLXJlc3QtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDpmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiXX0seyJpZCI6Im1ldGFhcGktcnBjLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbImFjY291bnQ6JFVTRVJfSUQkOmZlOTA1ZjhhLTM4N2EtNDA1MS1iZjg3LWY4MThhZTEzOTM0NiJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbImFjY291bnQ6JFVTRVJfSUQkOmZlOTA1ZjhhLTM4N2EtNDA1MS1iZjg3LWY4MThhZTEzOTM0NiJdfSx7ImlkIjoibWV0YXN0YXRzLWFwaSIsIm1ldGhvZHMiOlsibWV0YXN0YXRzLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIl0sInJlc291cmNlcyI6WyJhY2NvdW50OiRVU0VSX0lEJDpmZTkwNWY4YS0zODdhLTQwNTEtYmY4Ny1mODE4YWUxMzkzNDYiXX0seyJpZCI6InJpc2stbWFuYWdlbWVudC1hcGkiLCJtZXRob2RzIjpbInJpc2stbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiYWNjb3VudDokVVNFUl9JRCQ6ZmU5MDVmOGEtMzg3YS00MDUxLWJmODctZjgxOGFlMTM5MzQ2Il19LHsiaWQiOiJjb3B5ZmFjdG9yeS1hcGkiLCJtZXRob2RzIjpbImN3b3B5ZmFjdG9yeS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibXQtbWFuYWdlci1hcGkiLCJtZXRob2RzIjpbIm10LW1hbmFnZXItYXBpOnJlc3Q6ZGVhbGluZzoqOioiLCJtdC1tYW5hZ2VyLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19XSwiaWdub3JlUmF0ZUxpbWl0cyI6ZmFsc2UsInRva2VuSWQiOiIyMDIxMDIxMyIsImltcGVyc29uYXRlZCI6ZmFsc2UsInJlYWxVc2VySWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImlhdCI6MTc4NDkwMTU0MywiZXhwIjoxNzkyNjc3NTQzfQ.KMZoBn-mAc_LJwM1wcxhuqayam9w-jg10QtllVod3w8fK8MN9qPRATimfFRZb5i1mUOJUvL882S_Z0MZCrf3C3vB2jl1F-He9N9-8yXVeQBdrKeAvuKG11mvtlm5FgGYb7zei4t0dWEx06Kwtg506bpgFALRlpVazC1sqcT2S3ay6thJPs58gNxKrvDx0qrvx2T3UnjBct3L1S0GeYKfZFD8Fof_POKHEBdwUCGolqJ_5Ulh3QqKVnHj-kasWMDpSHRf6puLRkT4ht4sPsezUv3RTl7Qx9Cjc64jURW8tnVrNsAIQTKGNYq3_Fa2roVCb4bss13LWal0o0tMOBXnRgSIi_NSpJInSAHBDpu7XC-w3FxpnmJ1V21Esl7DaTokkfEcaQoGUMYvZSCnvrDUC9P2nf0_JJFDTsqYhgYj4tFkC7Z3qd4jrnnMrW8cVLiFUzgncAQTtz1wPca2nrmqwvj0iaZCDkb51XE5U7DYhVQ7uJB75Cuwe2l-V2x9ew2EtRgmtfKG5-_lrXY23U-LWaU7j0yO62qdoVQpvE9ASPuPOmtJdgykI85jL1x3fIj0XVpFHTmSA-XghRpj9h4m4eowIOLmS_3iFrOe0f6451J85-QofydDgRv7KKgtcZ6cMRQvoeUqvOatlLESsrkBPhQD2MIONNICF_BD89Y-2a8" .env; then
  print_ok ".env created with the new CopyFactory-enabled token"
else
  print_err ".env creation failed"
  exit 1
fi

# ============================================================
print_step "Step 5/6: Build and start the Docker container"
# ============================================================
echo -e "${YELLOW}Building (this will take 3-5 minutes)...${NC}"
docker compose -f docker-compose.hostinger.yml up -d --build
print_ok "Container built and started"

# ============================================================
print_step "Step 6/6: Post-deploy CopyFactory setup instructions"
# ============================================================
echo -e "\n${GREEN}=== Deployment complete! ===${NC}"
echo -e "${YELLOW}Container is starting up. Streaming logs (Ctrl+C to exit):${NC}\n"
sleep 3
docker compose -f docker-compose.hostinger.yml logs -f --tail=50
