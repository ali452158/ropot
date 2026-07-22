# دليل نشر ALFA Reports على Hostinger VPS

> هذا الدليل يشرح طريقتين للنشر على Hostinger VPS:
> 1. **الطريقة A — Docker Compose** (الأسهل والأكثر توافقًا مع لوحة Hostinger)
> 2. **الطريقة B — Bun مباشرة** (إذا فضّلت التحكم اليدوي عبر Web Terminal)
>
> اختر طريقة واحدة فقط. الطريقة A موصى بها لأن Hostinger يدعمها أصليًا.

---

## المتطلبات الأساسية

- خطة Hostinger VPS (KVM 1 على الأقل — 1 vCPU / 1 GB RAM).
- وصول **SSH** أو **Web Terminal** من لوحة Hostinger.
- حساب MetaApi Cloud + توكن صالح (https://app.metaapi.cloud/api-token).
- اسم نطاق اختياري (مثل `alfa.yourdomain.com`) إذا أردت HTTPS.

---

## الطريقة A — Docker Compose (موصى بها)

### الخطوة 1: ادخل إلى Web Terminal من لوحة Hostinger

من لوحة تحكم Hostinger:
- **VPS → خادمك → Server management → Browser terminal**
- أو اربط SSH من جهازك: `ssh root@YOUR_VPS_IP`

### الخطوة 2: تثبيت Docker + Docker Compose (إذا لم يكن مثبتًا)

```bash
# تحديث الحزم
apt update && apt upgrade -y

# تثبيت Docker
curl -fsSL https://get.docker.com | sh

# تفعيل Docker
systemctl enable docker && systemctl start docker

# التحقق
docker --version
docker compose version
```

### الخطوة 3: استنساخ المشروع

```bash
cd /opt
git clone https://github.com/ali452158/ropot.git alfa
cd alfa
```

### الخطوة 4: إعداد ملف `.env`

```bash
cp .env.example .env
nano .env
```

عدّل القيم التالية (الأهم):

```env
# قاعدة البيانات — اتركها كما هي (SQLite داخل volume)
DATABASE_URL=file:/app/db/custom.db

# MetaApi Cloud — ضع توكنك الحقيقي
META_API_TOKEN=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX

# منطقة خادم MetaApi (الأقرب لوسيطك)
META_API_CLIENT_REGION=new-york

# تيليجرام (اختياري لكن موصى به للمشغل)
TELEGRAM_BOT_TOKEN=YYYYYYYYYYYY:AAAAAAAAAAAAAAAAAAAAAAAA
ADMIN_TELEGRAM_ID=123456789
ADMIN_API_TOKEN=ضع-سر-طويل-عشوائي-هنا
ALFA_APP_BASE_URL=http://YOUR_VPS_IP:3000
```

احفظ (`Ctrl+O`, `Enter`, `Ctrl+X`).

### الخطوة 5: تشغيل الحاوية

```bash
docker compose up -d --build
```

أول بناء يستغرق 5–10 دقائق (تنزيل الصور + `bun install` + `next build`).

### الخطوة 6: التحقق

```bash
# حالة الحاوية
docker compose ps

# اللوجات الحية
docker compose logs -f alfa

# فحص الـ API
curl http://localhost:3000/api/system/mode
# المفروض يرجع: {"mode":"LIVE","hasToken":true,...}
```

افتح المتصفح: `http://YOUR_VPS_IP:3000` — سترى واجهة ALFA Reports مع صورة الروبوت.

### الخطوة 7: فتح المنفذ 3000 في جدار الحماية

```bash
ufw allow 3000/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### الخطوة 8 (اختياري): تفعيل HTTPS عبر اسم النطاق

Hostinger VPS يأتي بـ Caddy أحيانًا. أو ثبّته يدويًا:

```bash
apt install caddy -y
systemctl enable caddy
```

أنشئ `/etc/caddy/Caddyfile`:

```caddy
alfa.yourdomain.com {
    reverse_proxy localhost:3000
}
```

ثم:

```bash
systemctl restart caddy
```

سيصدر Caddy شهادة Let's Encrypt تلقائيًا. الموقع متاح على `https://alfa.yourdomain.com`.

### أوامر الإدارة اليومية (Docker)

```bash
# إعادة تشغيل
docker compose restart alfa

# إيقاف
docker compose down

# تحديث بعد git pull
git pull && docker compose up -d --build

# لوجات آخر 100 سطر
docker compose logs --tail=100 alfa

# دخول إلى الحاوية
docker compose exec alfa sh
```

---

## الطريقة B — Bun مباشرة (بلا Docker)

### الخطوة 1: تثبيت Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun --version
```

### الخطوة 2: استنساخ المشروع

```bash
cd /opt
git clone https://github.com/ali452158/ropot.git alfa
cd alfa
```

### الخطوة 3: إعداد `.env`

```bash
cp .env.example .env
nano .env
# املأ القيم كما في الطريقة A
```

> ⚠️ **مهم:** في الطريقة B، اضبط مسار SQLite ليكون مطلقًا:
> ```env
> DATABASE_URL=file:/opt/alfa/db/custom.db
> ```

### الخطوة 4: تثبيت الحزم + توليد Prisma

```bash
bun install
```

`postinstall` سيُشغّل `prisma generate` تلقائيًا.

### الخطوة 5: بناء المشروع

```bash
bun run build
```

### الخطوة 6: دفع قاعدة البيانات (إنشاء الجداول)

```bash
bun run db:push
```

### الخطوة 7: تشغيل التطبيق

```bash
# تشغيل مباشر (سينقطع عند إغلاق التيرمنال)
bun run start

# تشغيل دائم عبر nohup
nohup bun run start > server.log 2>&1 &
echo $! > /tmp/alfa.pid

# إيقافه لاحقًا
kill $(cat /tmp/alfa.pid)
```

### الخطوة 8 (موصى به): تشغيل كـ service عبر systemd

أنشئ ملف `/etc/systemd/system/alfa.service`:

```ini
[Unit]
Description=ALFA Reports Next.js App
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/alfa
EnvironmentFile=/opt/alfa/.env
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
ExecStart=/root/.bun/bin/bun /opt/alfa/.next/standalone/server.js
Restart=on-failure
RestartSec=5
StandardOutput=append:/opt/alfa/server.log
StandardError=append:/opt/alfa/server.log

[Install]
WantedBy=multi-user.target
```

ثم فعّله:

```bash
systemctl daemon-reload
systemctl enable alfa
systemctl start alfa
systemctl status alfa
```

---

## استكشاف الأخطاء الشائعة

### 1) `unable to verify the first certificate`

هذا خطأ SSL من MetaApi. الحل مدمج في الكود (`undici` مع `rejectUnauthorized: false`). إذا ظهر مجددًا، تأكد أن `undici` مثبت:

```bash
# Docker
docker compose exec alfa sh -c "ls node_modules/undici"

# Bun
ls /opt/alfa/node_modules/undici
```

### 2) `Can't reach database server`

- في Docker: تأكد أن volume `alfa_db` موجود (`docker volume ls`).
- في Bun: تأكد أن المسار في `DATABASE_URL` مطلق ويشير إلى مجلد موجود.

### 3) البناء يفشل بسبب الذاكرة (OOM)

خوادم 1 GB RAM قد تنفد ذاكرتها أثناء `next build`. الحل:

```bash
# إضافة swap مؤقت
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

ثم أعد البناء.

### 4) المنفذ 3000 محجوب

```bash
# Hostinger firewall من اللوحة: Settings → Firewall → Add rule → TCP 3000
# أو UFW:
ufw allow 3000/tcp
```

### 5) الحاوية تعيد التشغيل باستمرار

```bash
docker compose logs --tail=200 alfa
```

أكثر الأسباب شيوعًا:
- `META_API_TOKEN` فارغ أو غير صالح.
- `DATABASE_URL` غير صحيح.
- ملف `.env` غير محمّل (`docker compose` يقرأ `.env` افتراضيًا من نفس المجلد).

### 6) أريد إعادة إنشاء قاعدة البيانات من الصفر

```bash
# Docker
docker compose exec alfa bunx prisma db push --accept-data-loss --force-reset

# Bun
cd /opt/alfa && bunx prisma db push --accept-data-loss --force-reset
```

### 7) توليد أكواد تفعيل تجريبية

```bash
# Docker
docker compose exec alfa bun run scripts/generate-test-codes.ts

# Bun
cd /opt/alfa && bun run scripts/generate-test-codes.ts
```

---

## ما بعد النشر

1. **افتح** `http://YOUR_VPS_IP:3000` (أو نطاقك).
2. **أدخل كود التفعيل** التجريبي (يولّد عبر السكربت في الأعلى).
3. **ادخل بيانات MT5**: ID + كلمة المرور + السيرفر.
4. سيبدأ البوت التداول تلقائيًا على XAUUSD/M1 — راقب من لوحة التحكم.

---

## ملخص سريع للأوامر (Docker)

```bash
# نشر أول مرة
cd /opt && git clone https://github.com/ali452158/ropot.git alfa && cd alfa
cp .env.example .env && nano .env
docker compose up -d --build

# إدارة يومية
docker compose logs -f alfa        # لوجات
docker compose restart alfa        # إعادة تشغيل
docker compose down                # إيقاف
git pull && docker compose up -d --build   # تحديث
```

---

## بيانات مهمة (احفظها)

| العنصر | القيمة |
|---|---|
| Repo URL | `https://github.com/ali452158/ropot.git` |
| المنفذ الافتراضي | `3000` |
| مسار قاعدة البيانات (Docker) | volume `alfa_db` → `/app/db/custom.db` |
| مسار قاعدة البيانات (Bun) | `/opt/alfa/db/custom.db` |
| Endpoint فحص الصحة | `GET /api/system/mode` |
| Endpoint التشخيص | `GET /api/system/diagnose` |
| صورة الروبوت | `/alfa-robot.png` |

---

أي مشكلة أخرى — شارك اللوج من `docker compose logs --tail=200 alfa` وسأساعدك.
