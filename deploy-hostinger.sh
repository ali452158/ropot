#!/usr/bin/env bash
# ============================================================
# ALFA Reports — One-Click Deployment Script for Hostinger VPS
# ============================================================
# This script:
#   1. Stops & removes existing containers/images
#   2. Removes the old project directory
#   3. Clones the latest code from GitHub
#   4. Creates .env with the correct MetaApi token (writer role + mt-server access)
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
print_step "Step 3/6: Verify new files are present"
# ============================================================
if [ -f "src/app/api/admin/check-provisioned/route.ts" ]; then
  print_ok "check-provisioned endpoint exists"
else
  print_err "check-provisioned endpoint MISSING"
  exit 1
fi

if grep -q "mt5Login" prisma/schema.prisma; then
  print_ok "mt5Login field present in Prisma schema"
else
  print_err "mt5Login field MISSING in schema"
  exit 1
fi

if grep -q "mt5Login" src/app/api/mt5/login/route.ts; then
  print_ok "login route updated with mt5Login binding"
else
  print_err "login route NOT updated"
  exit 1
fi

# ============================================================
print_step "Step 4/6: Create .env with the new MetaApi token"
# ============================================================
cat > .env << 'ENVEOF'
META_API_TOKEN=eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOio3ZWZlOTBmNy04NmQwLTRmMGQtOWI4Mi05ZmYxNjkwMDk4NDciLCJtdC1zZXJ2ZXI6JFVTRVJfSUQkOjdlZmU5MGY3LTg2ZDAtNGYwZC05YjgyLTlmZjE2OTAwOTg0NyJdfSx7ImlkIjoibWV0YWFwaS1yZXN0LWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KjdlZmU5MGY3LTg2ZDAtNGYwZC05YjgyLTlmZjE2OTAwOTg0NyIsImFjY291bnQ6JFVTRVJfSUQkOjdlZmU5MGY3LTg2ZDAtNGYwZC05YjgyLTlmZjE2OTAwOTg0NyJdfSx7ImlkIjoibWV0YWFwaS1ycGMtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTp3czpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KjdlZmU5MGY3LTg2ZDAtNGYwZC05YjgyLTlmZjE2OTAwOTg0NyJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOio3ZWZlOTBmNy04NmQwLTRmMGQtOWI4Mi05ZmYxNjkwMDk4NDciXX0seyJpZCI6Im1ldGFzdGF0cy1hcGkiLCJtZXRob2RzIjpbIm1ldGFzdGF0cy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KjdlZmU5MGY3LTg2ZDAtNGYwZC05YjgyLTlmZjE2OTAwOTg0NyJdfSx7ImlkIjoicmlzay1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsicmlzay1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqN2VmZTkwZjctODZkMC00ZjBkLTliODItOWZmMTY5MDA5ODQ3Il19LHsiaWQiOiJjb3B5ZmFjdG9yeS1hcGkiLCJtZXRob2RzIjpbImNvcHlmYWN0b3J5LWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqN2VmZTkwZjctODZkMC00ZjBkLTliODItOWZmMTY5MDA5ODQ3Il19LHsiaWQiOiJtdC1tYW5hZ2VyLWFwaSIsIm1ldGhvZHMiOlsibXQtbWFuYWdlci1hcGk6cmVzdDpkZWFsaW5nOio6KiIsIm10LW1hbmFnZXItYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOio3ZWZlOTBmNy04NmQwLTRmMGQtOWI4Mi05ZmYxNjkwMDk4NDciXX0seyJpZCI6ImJpbGxpbmctYXBpIiwibWV0aG9kcyI6WyJiaWxsaW5nLWFwaTpyZXN0OnB1YmxpYzpwYXltZW50OioiXSwicm9sZXMiOlsicmVhZGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqN2VmZTkwZjctODZkMC00ZjBkLTliODItOWZmMTY5MDA5ODQ3Il19XSwiaWdub3JlUmF0ZUxpbWl0cyI6ZmFsc2UsInRva2VuSWQiOiIyMDIxMDIxMyIsImltcGVyc29uYXRlZCI6ZmFsc2UsInJlYWxVc2VySWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImlhdCI6MTc4NDg1ODMzOSwiZXhwIjoxNzkyNjM0MzM5fQ.f6dm_uj2eCsjFvy5ZdCfKe_aEWqEdf-zqpxuLBk_C7NBGbKtMsvUNMjxe3O8klPjgDKNiDjmsFpjW-5O7pOas3EnqxDuk85yBP9DFPK4YD2sWiZC7NAbaZ9l9X08Ur1aXea38V-q9O6uBGrxl6lLuwymSow2Ke8sPUFt68fGlluZZpEGXsUZtB2j7ycgEZHNzWvx6LmyTwrV5m4MY1BEkWLkIc9ZBGWoeyPwLsshxK2khz2OlsYAPIQwIqDJ0RHWBcI3f3PALbZFEC69faSI9xPtXbz4MsDR7YUjcOw1MhfqwQv_nBnsVrMaoDzFpko6YfBxo39fyfoNRQ2kExvidWnwGAGYA0scLjuMslhtyBxnejBq67tU4qbjzjjYsBG9yOzUgxEBQUz4g01j2rXJrCrPfuyjM_c4hO4RZUB3DhJYc6fBeTXO7f5Wqqst2I8nhmb6kHxjNWT-D0v3Cxs72yyO17kDmkpBWQSiduoNrUmyw7Qg9xOZaerhfhxQGlPSMe_jxiuMKOAORJJp0NYOZpndnlVfwOhY8YqtUxSoPVdZZapNB6Vz2gH6bKn-xY4TIRzxKzwzlR2m_sgZlqhWcUdDWlMgK8RPJrGrVO_46F8IDQQv2iSTlu5S7eel-O5FZSsknNLoSuKqwhb7iQCoQR48hAnGgA4gpEUD9YmSjUU
META_API_PROVISIONING_DOMAIN=mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai
META_API_MASTER_LOGIN=474240052
ADMIN_API_TOKEN=uosL8m8cV43mBlw2D5qyMKG6Cvio9xyfB1b88K6eLyTi05a9
DATABASE_URL=file:/app/db/custom.db
ENVEOF

if grep -q "^META_API_TOKEN=eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImFjY2Vzc1J1bGVzIjpbeyJpZCI6InRyYWRpbmctYWNjb3VudC1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsidHJhZGluZy1hY2NvdW50LW1hbmFnZW1lbnQtYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOio3ZWZlOTBmNy04NmQwLTRmMGQtOWI4Mi05ZmYxNjkwMDk4NDciLCJtdC1zZXJ2ZXI6JFVTRVJfSUQkOjdlZmU5MGY3LTg2ZDAtNGYwZC05YjgyLTlmZjE2OTAwOTg0NyJdfSx7ImlkIjoibWV0YWFwaS1yZXN0LWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KjdlZmU5MGY3LTg2ZDAtNGYwZC05YjgyLTlmZjE2OTAwOTg0NyIsImFjY291bnQ6JFVTRVJfSUQkOjdlZmU5MGY3LTg2ZDAtNGYwZC05YjgyLTlmZjE2OTAwOTg0NyJdfSx7ImlkIjoibWV0YWFwaS1ycGMtYXBpIiwibWV0aG9kcyI6WyJtZXRhYXBpLWFwaTp3czpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KjdlZmU5MGY3LTg2ZDAtNGYwZC05YjgyLTlmZjE2OTAwOTg0NyJdfSx7ImlkIjoibWV0YWFwaS1yZWFsLXRpbWUtc3RyZWFtaW5nLWFwaSIsIm1ldGhvZHMiOlsibWV0YWFwaS1hcGk6d3M6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOio3ZWZlOTBmNy04NmQwLTRmMGQtOWI4Mi05ZmYxNjkwMDk4NDciXX0seyJpZCI6Im1ldGFzdGF0cy1hcGkiLCJtZXRob2RzIjpbIm1ldGFzdGF0cy1hcGk6cmVzdDpwdWJsaWM6KjoqIl0sInJvbGVzIjpbInJlYWRlciIsIndyaXRlciJdLCJyZXNvdXJjZXMiOlsiKjokVVNFUl9JRCQ6KjdlZmU5MGY3LTg2ZDAtNGYwZC05YjgyLTlmZjE2OTAwOTg0NyJdfSx7ImlkIjoicmlzay1tYW5hZ2VtZW50LWFwaSIsIm1ldGhvZHMiOlsicmlzay1tYW5hZ2VtZW50LWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqN2VmZTkwZjctODZkMC00ZjBkLTliODItOWZmMTY5MDA5ODQ3Il19LHsiaWQiOiJjb3B5ZmFjdG9yeS1hcGkiLCJtZXRob2RzIjpbImNvcHlmYWN0b3J5LWFwaTpyZXN0OnB1YmxpYzoqOioiXSwicm9sZXMiOlsicmVhZGVyIiwid3JpdGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqN2VmZTkwZjctODZkMC00ZjBkLTliODItOWZmMTY5MDA5ODQ3Il19LHsiaWQiOiJtdC1tYW5hZ2VyLWFwaSIsIm1ldGhvZHMiOlsibXQtbWFuYWdlci1hcGk6cmVzdDpkZWFsaW5nOio6KiIsIm10LW1hbmFnZXItYXBpOnJlc3Q6cHVibGljOio6KiJdLCJyb2xlcyI6WyJyZWFkZXIiLCJ3cml0ZXIiXSwicmVzb3VyY2VzIjpbIio6JFVTRVJfSUQkOio3ZWZlOTBmNy04NmQwLTRmMGQtOWI4Mi05ZmYxNjkwMDk4NDciXX0seyJpZCI6ImJpbGxpbmctYXBpIiwibWV0aG9kcyI6WyJiaWxsaW5nLWFwaTpyZXN0OnB1YmxpYzpwYXltZW50OioiXSwicm9sZXMiOlsicmVhZGVyIl0sInJlc291cmNlcyI6WyIqOiRVU0VSX0lEJDoqN2VmZTkwZjctODZkMC00ZjBkLTliODItOWZmMTY5MDA5ODQ3Il19XSwiaWdub3JlUmF0ZUxpbWl0cyI6ZmFsc2UsInRva2VuSWQiOiIyMDIxMDIxMyIsImltcGVyc29uYXRlZCI6ZmFsc2UsInJlYWxVc2VySWQiOiI5YTI3MmQ5MGU2YTlkOTBlODEzNzhiYTdlODE5YzI3MiIsImlhdCI6MTc4NDg1ODMzOSwiZXhwIjoxNzkyNjM0MzM5fQ.f6dm_uj2eCsjFvy5ZdCfKe_aEWqEdf-zqpxuLBk_C7NBGbKtMsvUNMjxe3O8klPjgDKNiDjmsFpjW-5O7pOas3EnqxDuk85yBP9DFPK4YD2sWiZC7NAbaZ9l9X08Ur1aXea38V-q9O6uBGrxl6lLuwymSow2Ke8sPUFt68fGlluZZpEGXsUZtB2j7ycgEZHNzWvx6LmyTwrV5m4MY1BEkWLkIc9ZBGWoeyPwLsshxK2khz2OlsYAPIQwIqDJ0RHWBcI3f3PALbZFEC69faSI9xPtXbz4MsDR7YUjcOw1MhfqwQv_nBnsVrMaoDzFpko6YfBxo39fyfoNRQ2kExvidWnwGAGYA0scLjuMslhtyBxnejBq67tU4qbjzjjYsBG9yOzUgxEBQUz4g01j2rXJrCrPfuyjM_c4hO4RZUB3DhJYc6fBeTXO7f5Wqqst2I8nhmb6kHxjNWT-D0v3Cxs72yyO17kDmkpBWQSiduoNrUmyw7Qg9xOZaerhfhxQGlPSMe_jxiuMKOAORJJp0NYOZpndnlVfwOhY8YqtUxSoPVdZZapNB6Vz2gH6bKn-xY4TIRzxKzwzlR2m_sgZlqhWcUdDWlMgK8RPJrGrVO_46F8IDQQv2iSTlu5S7eel-O5FZSsknNLoSuKqwhb7iQCoQR48hAnGgA4gpEUD9YmSjUU" .env; then
  print_ok ".env created with the new token"
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
print_step "Step 6/6: Show logs (press Ctrl+C to exit)"
# ============================================================
echo -e "\n${GREEN}=== Deployment complete! ===${NC}"
echo -e "${YELLOW}Streaming logs (press Ctrl+C to exit):${NC}\n"
sleep 3
docker compose -f docker-compose.hostinger.yml logs -f --tail=50
