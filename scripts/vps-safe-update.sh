#!/bin/bash
# ============================================================================
# ALFA Reports — سحب الكود الجديد مع الحفاظ على تعديلات docker-compose.yml
# ============================================================================

cd /opt/alfa && \

echo "===== 1. نسخ احتياطي لـ docker-compose.yml =====" && \
cp docker-compose.yml /tmp/docker-compose.yml.backup && \
echo "✅ تم النسخ الاحتياطي إلى: /tmp/docker-compose.yml.backup" && \

echo "" && \
echo "===== 2. حفظ التعديلات المحلية (git stash) =====" && \
git stash push -m "vps-local-changes-$(date +%Y%m%d-%H%M%S)" 2>&1 | tail -3 && \

echo "" && \
echo "===== 3. سحب الكود الجديد من GitHub =====" && \
git pull origin main 2>&1 | tail -10 && \

echo "" && \
echo "===== 4. استرجاع التعديلات المحلية =====" && \
git stash pop 2>&1 | tail -5 && \

echo "" && \
echo "===== 5. التحقق من أن docker-compose.yml ما زال محتوياً على تعديلاتك =====" && \
echo "(إذا ظهر تعارض، سنحله يدوياً)" && \
git status --short docker-compose.yml && \

echo "" && \
echo "===== 6. التحقق من أن ملف زر الخروج موجود =====" && \
grep -c "خروج" src/components/screens/mt5-login-screen.tsx 2>/dev/null && \
echo "✅ زر الخروج موجود في الكود" || echo "⚠️ زر الخروج غير موجود — تحقق من الـ pull" && \

echo "" && \
echo "===== 7. إعادة بناء Docker =====" && \
docker compose up -d --build --force-recreate 2>&1 | tail -15 && \

echo "" && \
echo "===== 8. انتظار جاهزية الخادم =====" && \
sleep 10 && \
curl -sk -o /dev/null -w "HTTP: %{http_code}\n" http://localhost:3000 && \

echo "" && \
echo "✅ تم النشر — افتح المتصفح: http://76.13.40.219:3000"
echo "✅ ستجد زر \"خروج\" أحمر في أعلى صفحة تسجيل دخول MT5"
