# ALFA Reports — Trading Bot

بوت تداول آلي للذهب (XAUUSD) باستراتيجية Wick-to-Wick Rejection على فريم M1.

> **ملاحظة حول بنية المشروع:**
> هذا المشروع يستخدم Next.js 16 App Router مع `src/app/` (وليس `app/` في الجذر).
> مجلدات `app/` و `pages/` الموجودة في الجذر هي مجرد markers لإرضاء فحص بنية Hostinger
> ولا تؤثر على سلوك Next.js (Next 16 يفضّل `src/app/` تلقائيًا عند وجوده).
> التطبيق الفعلي في: **`src/app/`**.

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

## النشر على Hostinger VPS (Docker)

```bash
# على Hostinger VPS (Web Terminal أو SSH):
git clone https://github.com/ali452158/ropot.git
cd ropot
cp .env.example .env
nano .env  # املأ META_API_TOKEN والإعدادات الأخرى
docker compose up -d --build
```

التفاصيل الكاملة في [DEPLOY-HOSTINGER.md](./DEPLOY-HOSTINGER.md).

## التركيب محليًا (للتطوير)

```bash
# 1. تثبيت dependencies
bun install

# 2. تهيئة قاعدة البيانات
bunx prisma db push

# 3. إنشاء ملف .env من القالب
cp .env.example .env
# ثم عدّل القيم (META_API_TOKEN, TELEGRAM_BOT_TOKEN, ...)

# 4. تشغيل في وضع التطوير
bun run dev

# 5. بناء وتشغيل الإنتاج
bun run build
bun run start
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

## الترخيص
خاص — غير قابل للتوزيع بدون إذن من المالك.
