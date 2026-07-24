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
# Token v8 permissions (verified by decoding JWT + live API probe):
#   - trading-account-management-api:writer on ALL resources (*:$USER_ID$:*)  <-- KEY PERMISSION
#   - metaapi-rest-api:writer                  on ALL resources (*:$USER_ID$:*)
#   - metaapi-rpc-api:writer                   on ALL resources (*:$USER_ID$:*)
#   - metaapi-real-time-streaming-api:writer   on ALL resources (*:$USER_ID$:*)
#   - metastats-api:reader+writer              on ALL resources (*:$USER_ID$:*)
#   - risk-management-api:reader+writer        on ALL resources (*:$USER_ID$:*)
#   - copyfactory-api:writer                   on ALL resources (*:$USER_ID$:*)  <-- KEY PERMISSION
#   - mt-manager-api:writer                    on ALL resources (*:$USER_ID$:*)  <-- KEY PERMISSION
#   - billing-api:reader                       on ALL resources (*:$USER_ID$:*)
# Token expires: 2026-10-22
# Master account: 86cdebec-ea25-4e07-a208-69c0048dd4fd (login 472266644, Exness-MT5Trial16, london)
# CopyFactory strategy: sYlr (Gold Reade)
cat > .env << 'ENVEOF'
META_API_TOKEN=eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6Im1ldGFhcGktcmVzdC1hcGkiLCJtZXRob2RzIjpbIm1ldGFhcGktYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6Im1ldGFhcGktcnBjLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6Im1ldGFhcGktcmVhbC10aW1lLXN0cmVhbWluZy1hcGkiLCJtZXRob2RzIjpbIm1ldGFhcGktYXBpOndzOnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJtZXRhc3RhdHMtYXBpIiwibWV0aG9kcyI6WyJtZXRhc3RhdHMtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6InJpc2stbWFuYWdlbWVudC1hcGkiLCJtZXRob2RzIjpbInJpc2stbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoiY29weWZhY3RvcnktYXBpIiwibWV0aG9kcyI6WyJjb3B5ZmFjdG9yeS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibXQtbWFuYWdlci1hcGkiLCJtZXRob2RzIjpbIm10LW1hbmFnZXItYXBpOnJlc3Q6ZGVhbGluZzoqOioiLCJtdC1tYW5hZ2VyLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJiaWxsaW5nLWFwaSIsIm1ldGhvZHMiOlsiYmlsbGluZy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfV0sImlnbm9yZVJhdGVMaW1pdHMiOmZhbHNlLCJ0b2tlbklkIjoiMjAyMTAyMTMiLCJpbXBlcnNvbmF0ZWQiOmZhbHNlLCJyZWFsVXNlcklkIjoiOWEyNzJkOTBlNmE5ZDkwZTgxMzc4YmE3ZTgxOWMyNzIiLCJpYXQiOjE3ODQ5MjA2MjAsImV4cCI6MTc5MjY5NjYyMH0.WgsVvVRnUxVI9Khc3Rf8UhCjPo6jxoR72i3wXNDgoXBmK2rWVdjaHdqNUCjIYhvav3yPhfDPbg-imS5YFjWe3Rv7J_-T4jnZzJCs9wRIy1SPo9419nsF56SNXC02uB-zTmJsWfyXINvxiKxs6J6luHFCakoUrrMJ3Wg9yHsN4c6Q8vyMjqvXRBUCRLRNgwdhnSJ8rsawMZxoBPEl4rsqVVDWsDIVX5sPu3QN4PzDoTqQMZebCFMhAP5402Y44VAu-a5G9cOwY2TmexJ77uw_y5Vz-7EUNg9WRCdHqYGGY9i5rf8J4MZhdBeESdQXXysA9S7tWKJb6McDbYc58MdhMVBsIc71TPl1QNlb0Uc2Ndu6NmI_NZ-JJfjzFhcubSi-GSUK-rq1S0kBl00oJassCisMjm6lc0UJ6-QmcP5ZniODTMCcmj_4K8WJLTjCLEPm_f-ATPVUZ__xYVaEI5Im0XERCgd6z8gsGBvO2rKLIjRzLuhQ_04k2I6nuXKJR3Rxs0DeNory9dnu9l86MSsLBoBZBSeJCz01e2DqI8baVA7IgPS9rh9WwmfTkQx43JQ5WQMQ0HZYxCxpmOvGMtQervAdqzY1LiCGl0uXzEjYkU_FXQh-zdwtJBq9bVk2l_FN8-zr1y8e60LWPyzk61TyE1Px8y2885APZkDFHeeljas
META_API_PROVISIONING_DOMAIN=mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai
META_API_MASTER_LOGIN=472266644
ADMIN_API_TOKEN=uosL8m8cV43mBlw2D5qyMKG6Cvio9xyfB1b88K6eLyTi05a9
DATABASE_URL=file:/app/db/custom.db
# CopyFactory — strategy 'sYlr' (Gold Reade) created by user in MetaApi dashboard.
# Strategy is bound to master MetaApi account 86cdebec-ea25-4e07-a208-69c0048dd4fd
# which is connected to MT5 login 472266644 on Exness-MT5Trial16 (region london).
COPYFACTORY_STRATEGY_ID=sYlr
# Telegram bot (long-polling sidecar) — generates activation codes via /api/codes/generate
# Bot token from @BotFather; admin Telegram IDs (comma-separated) who can use the bot.
TELEGRAM_BOT_TOKEN=7247077218:AAF9v9Z0AEzyH91E8cUhSvuF2DLt0y6wBC4
TELEGRAM_ADMIN_IDS=2021972361
ENVEOF

if grep -q "^META_API_TOKEN=eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6Im1ldGFhcGktcmVzdC1hcGkiLCJtZXRob2RzIjpbIm1ldGFhcGktYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6Im1ldGFhcGktcnBjLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6Im1ldGFhcGktcmVhbC10aW1lLXN0cmVhbWluZy1hcGkiLCJtZXRob2RzIjpbIm1ldGFhcGktYXBpOndzOnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJtZXRhc3RhdHMtYXBpIiwibWV0aG9kcyI6WyJtZXRhc3RhdHMtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOioiXX0seyJpZCI6InJpc2stbWFuYWdlbWVudC1hcGkiLCJtZXRob2RzIjpbInJpc2stbWFuYWdlbWVudC1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoiY29weWZhY3RvcnktYXBpIiwibWV0aG9kcyI6WyJjb3B5ZmFjdG9yeS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfSx7ImlkIjoibXQtbWFuYWdlci1hcGkiLCJtZXRob2RzIjpbIm10LW1hbmFnZXItYXBpOnJlc3Q6ZGVhbGluZzoqOioiLCJtdC1tYW5hZ2VyLWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqIl19LHsiaWQiOiJiaWxsaW5nLWFwaSIsIm1ldGhvZHMiOlsiYmlsbGluZy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KiJdfV0sImlnbm9yZVJhdGVMaW1pdHMiOmZhbHNlLCJ0b2tlbklkIjoiMjAyMTAyMTMiLCJpbXBlcnNvbmF0ZWQiOmZhbHNlLCJyZWFsVXNlcklkIjoiOWEyNzJkOTBlNmE5ZDkwZTgxMzc4YmE3ZTgxOWMyNzIiLCJpYXQiOjE3ODQ5MjA2MjAsImV4cCI6MTc5MjY5NjYyMH0.WgsVvVRnUxVI9Khc3Rf8UhCjPo6jxoR72i3wXNDgoXBmK2rWVdjaHdqNUCjIYhvav3yPhfDPbg-imS5YFjWe3Rv7J_-T4jnZzJCs9wRIy1SPo9419nsF56SNXC02uB-zTmJsWfyXINvxiKxs6J6luHFCakoUrrMJ3Wg9yHsN4c6Q8vyMjqvXRBUCRLRNgwdhnSJ8rsawMZxoBPEl4rsqVVDWsDIVX5sPu3QN4PzDoTqQMZebCFMhAP5402Y44VAu-a5G9cOwY2TmexJ77uw_y5Vz-7EUNg9WRCdHqYGGY9i5rf8J4MZhdBeESdQXXysA9S7tWKJb6McDbYc58MdhMVBsIc71TPl1QNlb0Uc2Ndu6NmI_NZ-JJfjzFhcubSi-GSUK-rq1S0kBl00oJassCisMjm6lc0UJ6-QmcP5ZniODTMCcmj_4K8WJLTjCLEPm_f-ATPVUZ__xYVaEI5Im0XERCgd6z8gsGBvO2rKLIjRzLuhQ_04k2I6nuXKJR3Rxs0DeNory9dnu9l86MSsLBoBZBSeJCz01e2DqI8baVA7IgPS9rh9WwmfTkQx43JQ5WQMQ0HZYxCxpmOvGMtQervAdqzY1LiCGl0uXzEjYkU_FXQh-zdwtJBq9bVk2l_FN8-zr1y8e60LWPyzk61TyE1Px8y2885APZkDFHeeljas" .env; then
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
