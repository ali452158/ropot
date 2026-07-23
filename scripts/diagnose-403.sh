#!/bin/bash
# ============================================================================
# ALFA Reports — MetaApi 403 Diagnostic
# ينسخ هذا السكربت ويلصق في VPS مباشرة
# ============================================================================

cd /opt/alfa && \
TOKEN=$(grep '^META_API_TOKEN=' .env | sed 's/^META_API_TOKEN=//' | tr -d '\r\n') && \
API_BASE="https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai" && \

echo "" && \
echo "================================================================" && \
echo "1️⃣  JWT Payload — فحص الصلاحيات الفعلية في التوكن" && \
echo "================================================================" && \
PAYLOAD=$(echo "$TOKEN" | cut -d'.' -f2 | tr '_-' '/+') && \
PAD=$((4 - ${#PAYLOAD} % 4)) && \
[ "$PAD" -ne 4 ] && PAYLOAD="${PAYLOAD}$(printf '=%.0s' $(seq 1 $PAD))" && \
echo "$PAYLOAD" | base64 -d 2>/dev/null | python3 -m json.tool 2>/dev/null && \

echo "" && \
echo "================================================================" && \
echo "2️⃣  403 Error Body — نص الخطأ الكامل من POST /accounts" && \
echo "================================================================" && \
curl -sk -X POST -H "auth-token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"login":"260852986","password":"Ali@0164569934","serverName":"Exness-MT5Trial15","name":"ALFA-Test-260852986","type":"cloud-g2","platform":"mt5","application":"ALFA-Reports","magic":770077}' \
  "$API_BASE/users/current/accounts" && \

echo "" && \
echo "" && \
echo "================================================================" && \
echo "3️⃣  Broker Servers — محاولة استرجاع قائمة سيرفرات Exness" && \
echo "================================================================" && \
for EP in \
  "/users/current/servers/mt-provisioning?filter=Exness" \
  "/users/current/servers?filter=Exness" \
  "/users/current/broker-servers?filter=Exness" \
  "/users/current/brokers/Exness/servers" \
  "/users/current/brokerServers?filter=Exness" \
  "/users/current/brokers" \
  "/users/current/servers/mt5?filter=Exness" \
  "/users/current/broker-servers/mt5?filter=Exness"; do
  echo "→ GET $EP"
  RESP=$(curl -sk -w "@@@HTTP:%{http_code}" -H "auth-token: $TOKEN" "$API_BASE$EP")
  HC=$(echo "$RESP" | grep -oE '@@@HTTP:[0-9]+' | cut -d: -f2)
  BODY=$(echo "$RESP" | sed 's/@@@HTTP:[0-9]*//')
  echo "  HTTP $HC"
  echo "  Body: ${BODY:0:500}"
  echo ""
done && \

echo "================================================================" && \
echo "4️⃣  Existing Accounts — تأكيد أن التوكن يعمل للقراءة" && \
echo "================================================================" && \
curl -sk -H "auth-token: $TOKEN" "$API_BASE/users/current/accounts" | python3 -m json.tool 2>/dev/null | head -80 && \

echo "" && \
echo "================================================================" && \
echo "5️⃣  Test بدون application field" && \
echo "================================================================" && \
curl -sk -X POST -H "auth-token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"login":"260852986","password":"Ali@0164569934","serverName":"Exness-MT5Trial15","name":"ALFA-Test-260852986","type":"cloud-g2","platform":"mt5","magic":770077}' \
  "$API_BASE/users/current/accounts" && \

echo "" && \
echo "" && \
echo "================================================================" && \
echo "6️⃣  Test مع type=cloud (بدون -g2)" && \
echo "================================================================" && \
curl -sk -X POST -H "auth-token: $TOKEN" -H "Content-Type: application/json" \
  -d '{"login":"260852986","password":"Ali@0164569934","serverName":"Exness-MT5Trial15","name":"ALFA-Test-260852986","type":"cloud","platform":"mt5","application":"MetaApi","magic":770077}' \
  "$API_BASE/users/current/accounts" && \

echo "" && \
echo "================================================================" && \
echo "✅ انتهى التشخيص — افتح المتصفح: http://76.13.40.219:3000" && \
echo "================================================================"
