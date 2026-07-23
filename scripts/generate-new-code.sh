#!/bin/bash
# ============================================================================
# ALFA Reports — توليد كود تفعيل جديد (للاختبار)
# يعمل عبر Docker على VPS
# ============================================================================

cd /opt/alfa && \

# 1) توليد كود بالفورمات الصحيح ALFA-XXXX-XXXX-XXXX
ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
gen_block() {
  local out=""
  for i in 1 2 3 4; do
    out+="${ALPHABET:$((RANDOM % ${#ALPHABET})):1}"
  done
  echo -n "$out"
}
NEW_CODE="ALFA-$(gen_block)-$(gen_block)-$(gen_block)"

echo ""
echo "================================================================"
echo "🆕 كود التفعيل الجديد: $NEW_CODE"
echo "================================================================"

# 2) إدراج مباشر في قاعدة البيانات عبر SQLite
docker compose exec -T alfa sqlite3 /app/prisma/dev.db \
  "INSERT INTO ActivationCode (id, code, status, createdAt, updatedAt, createdBy) VALUES (lower(hex(randomblob(24))), '${NEW_CODE}', 'UNUSED', datetime('now'), datetime('now'), 'admin-vps-script');" 2>&1 | head -5

# 3) التحقق من الإدراج
echo ""
echo "================================================================"
echo "✅ التحقق من القاعدة..."
echo "================================================================"
docker compose exec -T alfa sqlite3 /app/prisma/dev.db \
  "SELECT code, status, datetime(createdAt) FROM ActivationCode WHERE code = '${NEW_CODE}';"

echo ""
echo "================================================================"
echo "🎉 الكود جاهز للاستخدام: $NEW_CODE"
echo "================================================================"
echo "افتح المتصفح: http://76.13.40.219:3000"
echo "واستخدم الكود مع بيانات MT5:"
echo "  - MT5 ID: 260852986"
echo "  - Password: Ali@0164569934"
echo "  - Server: Exness-MT5Trial15"
echo "================================================================"
