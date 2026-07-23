# دليل نشر ALFA Reports على Hostinger VPS

> ⚠️ **مهم:** Hostinger Docker Manager **لا يبني من Dockerfile** — هو بيشيل صور جاهزة من Docker Hub فقط.
>
> هذا الدليل يشرح الطريقة الصحيحة للنشر على Hostinger عبر Docker Hub.
>
> ### الطرق المتاحة:
> 1. **الطريقة A — Docker Hub Image** (الطريقة الوحيدة المتاحة على Hostinger Docker Manager)
> 2. **الطريقة B — VPS + docker compose يدويًا** (لبناء محلي على VPS عبر SSH)

---

## المتطلبات الأساسية

- خطة Hostinger VPS (KVM 1 على الأقل — 1 vCPU / 1 GB RAM).
- وصول **SSH** أو **Web Terminal** من لوحة Hostinger.
- **حساب Docker Hub** (مجاني): https://hub.docker.com/signup
- **Docker Desktop** على جهازك الشخصي (لبناء الصورة): https://www.docker.com/products/docker-desktop/
- حساب MetaApi Cloud + توكن صالح (https://app.metaapi.cloud/api-token).
- بوت تيليجرام (من @BotFather) + معرفك (من @userinfobot).
- اسم نطاق اختياري (مثل `bot.scalper.com`) إذا أردت HTTPS.

---

## الطريقة A — Docker Hub Image (الطريقة الموصى بها على Hostinger)

### نظرة عامة على الخطوات

```
[جهازك الشخصي]              [Docker Hub]              [Hostinger VPS]
     │                            │                           │
  1. بناء الصورة                    │                           │
     docker build ─────────────►  رفع الصورة                    │
                                   alfa-reports:latest           │
                                                                 │
                              2. سحب الصورة  ◄─────────────────
                                 docker pull
                                                                 │
                              3. تشغيل الحاوية                    │
                                 docker run ──► الموقع يعمل ✅
```

### الخطوة 1: بناء الصورة ورفعها من جهازك الشخصي

#### 1.1 تثبيت Docker Desktop (إذا لم يكن مثبتًا)

نزّل Docker Desktop من: https://www.docker.com/products/docker-desktop/

#### 1.2 إنشاء حساب Docker Hub

1. سجّل في https://hub.docker.com/signup (مجاني)
2. احفظ اسم المستخدم (مثلاً: `ali452158`)

#### 1.3 استنساخ المشروع من GitHub

```bash
git clone https://github.com/ali452158/ropot.git alfa-reports
cd alfa-reports
```

#### 1.4 تسجيل الدخول إلى Docker Hub

```bash
docker login
# أدخل اسم مستخدم Docker Hub وكلمة المرور
```

#### 1.5 بناء الصورة ورفعها

استخدم السكربت الجاهز:

```bash
chmod +x scripts/build-and-push.sh
./scripts/build-and-push.sh ali452158
# استبدل ali452158 باسم مستخدم Docker Hub الخاص بك
```

**أو يدويًا:**

```bash
# بناء الصورة (5-15 دقيقة)
docker build --platform linux/amd64 \
  -t ali452158/alfa-reports:latest \
  -t ali452158/alfa-reports:$(date +%Y%m%d-%H%M%S) \
  .

# رفعها إلى Docker Hub
docker push ali452158/alfa-reports:latest
```

#### 1.6 التحقق من رفع الصورة

- اذهب إلى: https://hub.docker.com/r/YOUR_USERNAME/alfa-reports
- يجب أن ترى الصورة مع tag `latest`

---

### الخطوة 2: إعداد Hostinger VPS

#### 2.1 الدخول إلى Web Terminal

من لوحة تحكم Hostinger:
- **VPS → خادمك → Server management → Browser terminal**
- أو اربط SSH من جهازك: `ssh root@YOUR_VPS_IP`

#### 2.2 تثبيت Docker (إذا لم يكن مثبتًا)

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker
```

#### 2.3 إعداد مجلد المشروع على الـ VPS

```bash
mkdir -p /opt/alfa-reports
cd /opt/alfa-reports
```

#### 2.4 إنشاء ملف `.env`

```bash
cat > .env << 'EOF'
DATABASE_URL=file:/app/db/custom.db
META_API_TOKEN=ضع_التوكن_هنا
META_API_PROVISIONING_DOMAIN=mt-provisioning.cloud-trail.com
META_API_CLIENT_REGION=new-york
TELEGRAM_BOT_TOKEN=ضع_توكن_البوت_هنا
ADMIN_TELEGRAM_ID=ضع_معرفك_هنا
ALFA_APP_BASE_URL=http://YOUR_VPS_IP:3000
ADMIN_API_TOKEN=uosL8m8cV43mBlw2D5qyMKG6Cvio9xyfB1b88K6eLyTi05a9
EOF

chmod 600 .env
nano .env  # عدّل القيم
```

#### 2.5 تحميل `docker-compose.hostinger.yml`

```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/ali452158/ropot/main/docker-compose.hostinger.yml
```

#### 2.6 تعديل اسم مستخدم Docker Hub في الملف

```bash
sed -i 's/YOUR_DOCKERHUB_USERNAME/ali452158/g' docker-compose.yml
# استبدل ali452158 باسم مستخدم Docker Hub الخاص بك
```

---

### الخطوة 3: تشغيل الحاوية

#### 3.1 سحب الصورة وتشغيلها

```bash
cd /opt/alfa-reports
docker compose up -d
```

#### 3.2 التحقق من حالة الحاوية

```bash
docker compose ps
docker compose logs -f --tail=50
```

#### 3.3 فتح المنفذ في Firewall (إذا لزم)

```bash
ufw allow 3000/tcp
```

#### 3.4 اختبار الموقع

افتح في المتصفح:
```
http://YOUR_VPS_IP:3000
```

يجب أن ترى صفحة بوابة تفعيل الكود.

---

### الخطوة 4: (اختياري) إعداد HTTPS عبر Traefik

إذا أردت تشغيل الموقع على نطاق مثل `bot.scalper.com` بـ HTTPS تلقائي:

#### 4.1 تثبيت Traefik

```bash
# إنشاء شبكة خارجية
docker network create traefik-public

# تشغيل Traefik مع Let's Encrypt
docker run -d \
  --name traefik \
  --restart=unless-stopped \
  --network traefik-public \
  -p 80:80 \
  -p 443:443 \
  -p 8080:8080 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v traefik-letsencrypt:/letsencrypt \
  traefik:v3.1 \
  --api.dashboard=true \
  --providers.docker=true \
  --providers.docker.exposedbydefault=false \
  --entrypoints.http.address=:80 \
  --entrypoints.https.address=:443 \
  --certificatesresolvers.letsencrypt.acme.tlschallenge=true \
  --certificatesresolvers.letsencrypt.acme.email=your-email@example.com \
  --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json

docker volume create traefik-letsencrypt
```

#### 4.2 توجيه DNS

في إدارة DNS لنطاقك:
- أضف سجل A: `bot` → `YOUR_VPS_IP`

#### 4.3 تشغيل ALFA مع labels لـ Traefik

استخدم ملف `docker-compose.yml` الكامل (الذي فيه labels) بدل المبسّط:

```bash
curl -o docker-compose.yml https://raw.githubusercontent.com/ali452158/ropot/main/docker-compose.yml
# عدّل bot.scalper.com إلى نطاقك + YOUR_DOCKERHUB_USERNAME
nano docker-compose.yml
```

ثم:
```bash
docker compose up -d
```

---

## الطريقة B — VPS + docker compose يدويًا (لبناء على الـ VPS نفسه)

> هذه الطريقة تتطلب VPS بـ 4GB RAM على الأقل (لبناء Next.js 16).

### الخطوة 1: تثبيت Git + Docker على الـ VPS

```bash
apt update && apt install -y git curl
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker
```

### الخطوة 2: استنساخ المشروع

```bash
cd /opt
git clone https://github.com/ali452158/ropot.git alfa-reports
cd alfa-reports
```

### الخطوة 3: إنشاء `.env`

```bash
cp .env.example .env
nano .env  # املأ القيم
```

### الخطوة 4: البناء والتشغيل

```bash
docker compose up -d --build
```

---

## استكشاف الأخطاء

### المشكلة: `image not found` على Hostinger

**السبب:** نسيت تعديل `YOUR_DOCKERHUB_USERNAME` في `docker-compose.hostinger.yml`.

**الحل:**
```bash
sed -i 's/YOUR_DOCKERHUB_USERNAME/ali452158/g' docker-compose.yml
docker compose pull
docker compose up -d
```

### المشكلة: `docker login` فشل

**الحل:**
- تأكد من اسم المستخدم وكلمة المرور
- إذا فعّلت 2FA على Docker Hub، استخدم Access Token بدلاً من كلمة المرور: https://hub.docker.com/settings/security

### المشكلة: الحاوية تخرج فورًا بعد التشغيل

**التشخيص:**
```bash
docker compose logs --tail=50
```

**الأسباب الشائعة:**
- ملف `.env` ناقص أو فيه قيم placeholder (`your_metaapi_token_here`)
- قاعدة البيانات لا يمكن إنشاؤها (تحقق من volume `/app/db`)

### المشكلة: الموقع لا يفتح على `http://VPS_IP:3000`

**التشخيص:**
```bash
# داخل الـ VPS
curl -I http://localhost:3000

# من خارج الـ VPS (تأكد من فتح المنفذ)
ufw status
ufw allow 3000/tcp
```

### المشكلة: `npm ci` يفشل أثناء البناء

**السبب:** `package-lock.json` لا يطابق `package.json`.

**الحل:** السكربت يستخدم fallback تلقائيًا (`npm install --legacy-peer-deps`). لو فشل أيضًا:
```bash
rm package-lock.json
docker build -t ali452158/alfa-reports:latest .
```

### المشكلة: نفاد الذاكرة أثناء البناء (OOM)

**الأعراض:**
```
FATAL ERROR: Ineffective mark-compactions near heap limit Allocation failed
```

**الحل:** Dockerfile فيه `NODE_OPTIONS=--max-old-space-size=4096`، لكن لو VPS جهازك صغير:
- استخدم جهاز بـ 8GB RAM للبناء
- أو ابنِ على Docker Hub عبر GitHub Actions (انظر القسم التالي)

---

## (متقدم) البناء التلقائي عبر GitHub Actions

بدلاً من البناء على جهازك الشخصي، يمكنك جعل GitHub Actions يبني ويرفع الصورة تلقائيًا عند كل push.

### الإعداد:

1. اذهب إلى: https://hub.docker.com/settings/security
2. أنشئ Access Token جديد
3. اذهب إلى: https://github.com/ali452158/ropot/settings/secrets/actions
4. أضف secrets:
   - `DOCKERHUB_USERNAME` = اسم مستخدم Docker Hub
   - `DOCKERHUB_TOKEN` = Access Token من الخطوة 2
5. ارفع ملف `.github/workflows/docker-publish.yml` (يمكنك طلبه مني)

عند كل push إلى `main`، GitHub Actions سيبني الصورة ويرفعها إلى Docker Hub تلقائيًا.

---

## ملخص سريع (Quick Start)

```bash
# === على جهازك الشخصي ===
git clone https://github.com/ali452158/ropot.git alfa-reports
cd alfa-reports
docker login
./scripts/build-and-push.sh ali452158

# === على Hostinger VPS ===
ssh root@YOUR_VPS_IP
mkdir -p /opt/alfa && cd /opt/alfa
curl -o docker-compose.yml https://raw.githubusercontent.com/ali452158/ropot/main/docker-compose.hostinger.yml
sed -i 's/YOUR_DOCKERHUB_USERNAME/ali452158/g' docker-compose.yml
nano .env  # اكتب المتغيرات (انظر .env.example)
docker compose up -d

# اختبار
curl http://localhost:3000
```

---

## ملاحظات أمنية

- 🔴 **بعد النشر:** احذف GitHub PAT من https://github.com/settings/tokens
- 🔴 **لا ترفع `.env` إلى GitHub** (الملف `.gitignore` يستثنيه بالفعل)
- 🟡 **استخدم HTTPS** قبل الإطلاق الرسمي (Traefik + Let's Encrypt)
- 🟡 **غيّر `ADMIN_API_TOKEN`** إلى قيمة عشوائية جديدة خاصة بك
