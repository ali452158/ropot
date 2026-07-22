# ALFA Reports — Trading Bot

بوت تداول آلي للذهب (XAUUSD) باستراتيجية Wick-to-Wick Rejection على فريم M1.

## المميزات
- بوت تداول آلي متصل بـ MT5 عبر MetaAPI Cloud
- استراتيجية Wick-to-Wick Rejection + نمط التردد العالي (HF)
- دعم متعدد المستخدمين (كل مشترك بحساب MT5 خاص)
- بوابة تفعيل بالكود (كود واحد لكل جهاز، صلاحية شهرية)
- بوت تلجرام لتوليد أكواد التفعيل
- تشغيل تلقائي للبوت بعد تسجيل الدخول إلى MT5
- تصميم أسود/أبيض/أزرق نيون

## التقنيات
- Next.js 16 (App Router, Turbopack)
- React 19 + TypeScript
- Prisma ORM + SQLite
- Tailwind CSS + shadcn/ui
- Framer Motion (animations)
- Zustand (state)
- undici (HTTP client with custom TLS for MetaAPI)
- z-ai-web-dev-sdk (image generation)

## التركيب

```bash
# 1. تثبيت dependencies
npm install

# 2. تهيئة قاعدة البيانات
npx prisma db push

# 3. إنشاء ملف .env من القالب
cp .env.example .env
# ثم عدّل القيم (META_API_TOKEN, TELEGRAM_BOT_TOKEN, ...)

# 4. تشغيل في وضع التطوير
npm run dev

# 5. بناء وتشغيل الإنتاج
npm run build
npm start
```

## متغيرات البيئة (.env)

| Variable | الوصف |
|----------|-------|
| `DATABASE_URL` | مسار قاعدة بيانات SQLite |
| `META_API_TOKEN` | توكن MetaAPI Cloud |
| `META_API_PROVISIONING_DOMAIN` | نطاق Provisioning API (افتراضي: mt-provisioning.cloud-trail.com) |
| `META_API_CLIENT_REGION` | منطقة Client API (new-york / london / hong-kong) |
| `TELEGRAM_BOT_TOKEN` | توكن بوت تلجرام لتوليد الأكواد |
| `ADMIN_TELEGRAM_ID` | معرف الأدمن في تلجرام |
| `ADMIN_API_TOKEN` | سر مشترك بين الموقع وبوت تلجرام |
| `ALFA_APP_BASE_URL` | عنوان URL للموقع |

## الرفع على GitHub (طريقة سريعة)

بدلاً من Web Upload (محدود بـ 100 ملف)، استخدم git CLI:

```bash
# 1. أنشئ repo جديد على GitHub بدون README/license/gitignore

# 2. في مجلد المشروع محلياً:
git init
git add .
git commit -m "Initial commit: ALFA Reports trading bot"

# 3. اربط بـ repo البعيد (استبدل الرابط برابط repo الخاص بك):
git remote add origin https://github.com/USERNAME/alfa-reports.git

# 4. ادفع الكود:
git branch -M main
git push -u origin main
```

## الترخيص
خاص — غير قابل للتوزيع بدون إذن من المالك.
