#!/bin/bash
# Test different Exness MT5 server name variations against MetaApi createAccount API.
# This script helps identify the exact server name string MetaApi expects.
#
# Usage on VPS:
#   bash /opt/alfa/scripts/test-exness-servers.sh
# Or copy-paste the inline version below.
#
# Notes:
# - Uses the META_API_TOKEN from /opt/alfa/.env
# - Tries 8+ common Exness MT5 server name variations
# - Stops at the first one that returns 200/201 (success)
# - The actual login attempt with password is safe — MetaApi validates
#   the server name first; if it's wrong, no account is created.

set -e
TOKEN=$(grep '^META_API_TOKEN=' /opt/alfa/.env | sed 's/^META_API_TOKEN=//' | tr -d '\r\n')
API="https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts"

if [ -z "$TOKEN" ]; then
  echo "❌ META_API_TOKEN not found in /opt/alfa/.env"
  exit 1
fi

echo "=== جرب أسماء سيرفرات Exness MT5 ==="
echo "Token length: ${#TOKEN} chars"
echo ""

# Array of common Exness server name variations for trial accounts
SERVERS=(
  "Exness-MT5Trial15"
  "ExnessMT5Trial15"
  "Exness-MT5Trial-15"
  "Exness-MT5Trial"
  "Exness-MT5TrialServer15"
  "ExnessServer-MT5Trial15"
  "Exness-Real-MT5"
  "Exness-MT5Real"
  "Exness-MT5Real15"
  "Exness-MT5-Real"
  "ExnessReal-MT515"
  "Exness-MT5Demo"
  "Exness-MT5Demo15"
  "Exness-Demo-MT5"
)

SUCCESS=""
for SERVER_NAME in "${SERVERS[@]}"; do
  printf "→ Testing: %-30s " "$SERVER_NAME"
  RES=$(curl -sk -w "\n@@@HTTP:%{http_code}" -X POST \
    -H "auth-token: $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"login\":\"260852986\",\"password\":\"Ali@0164569934\",\"server\":\"$SERVER_NAME\",\"name\":\"ALFA Test $SERVER_NAME\",\"type\":\"cloud-g2\",\"platform\":\"mt5\",\"application\":\"ALFA-Reports\",\"magic\":770077}" \
    "$API" 2>&1)
  HTTP_CODE=$(echo "$RES" | grep -oE '@@@HTTP:[0-9]+' | cut -d: -f2)

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
    echo "✅ SUCCESS ($HTTP_CODE)"
    echo ""
    echo "🎉 Server name that works: $SERVER_NAME"
    echo ""
    echo "Full response:"
    echo "$RES" | sed 's/@@@HTTP:[0-9]*//' | head -c 600
    SUCCESS="$SERVER_NAME"
    break
  elif [ "$HTTP_CODE" = "400" ]; then
    # Check if validation error is specifically about server
    if echo "$RES" | grep -q "server"; then
      echo "❌ server unknown"
    else
      echo "⚠️  400 (other validation)"
    fi
  elif [ "$HTTP_CODE" = "409" ]; then
    echo "✅ EXISTS (409) — server name is valid!"
    SUCCESS="$SERVER_NAME"
    break
  else
    echo "❌ HTTP $HTTP_CODE"
  fi
done

echo ""
if [ -n "$SUCCESS" ]; then
  echo "========================================"
  echo "✅ النتيجة: اسم السيرفر الصحيح هو: $SUCCESS"
  echo "========================================"
  echo "استخدم هذا الاسم في واجهة ALFA Reports."
else
  echo "========================================"
  echo "⚠️  لم ينجح أي اسم من القائمة."
  echo "========================================"
  echo "افتح تطبيق MT5 على جهازك وابحث عن اسم السيرفر الكامل"
  echo "غالباً يظهر في: File → Open Account → Search → اكتب 'Exness'"
  echo ""
  echo "أو جرّب القائمة الكاملة من سيرفرات Exness من:"
  echo "https://www.exness.com/server-names/"
fi
