/**
 * ALFA Reports — Telegram Bot for Subscription Code Generation
 *
 * This bot is owned by the operator (admin). Subscribers contact the operator,
 * the operator sends a command to this bot, and the bot generates a new
 * monthly activation code by calling the secure /api/codes/generate endpoint
 * of the main app.
 *
 * Setup:
 *   1. Create a Telegram bot via @BotFather — get the BOT_TOKEN.
 *   2. Get your own Telegram user ID (via @userinfobot).
 *   3. Set env vars:
 *        TELEGRAM_BOT_TOKEN  — the bot token from BotFather
 *        ADMIN_TELEGRAM_ID   — your numeric Telegram user ID (only this user can use the bot)
 *        ALFA_APP_BASE_URL   — e.g. https://your-app.example.com
 *        ADMIN_API_TOKEN     — shared secret with the main app
 *   4. Run: bun run dev
 *
 * Commands (only ADMIN_TELEGRAM_ID can use them):
 *   /start          — greeting + help
 *   /generate [n]   — generate n (default 1, max 50) new activation codes
 *   /list           — list the 20 most recent codes with their status
 *   /stats          — quick stats (active / unused / expired counts)
 *
 * The bot uses long-polling, so it can run anywhere (no public URL needed).
 */
import "dotenv/config";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const ADMIN_ID = Number(process.env.ADMIN_TELEGRAM_ID || 0);
const APP_BASE_URL = process.env.ALFA_APP_BASE_URL || "http://localhost:3000";
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || "";

if (!BOT_TOKEN || !ADMIN_ID) {
  console.error("❌ Missing TELEGRAM_BOT_TOKEN or ADMIN_TELEGRAM_ID");
  console.error("   Set them in .env or your shell environment.");
  process.exit(1);
}

const TG = `https://api.telegram.org/bot${BOT_TOKEN}`;

type TgUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
  };
};

let lastUpdateId = 0;

async function tg(method: string, payload: any) {
  const res = await fetch(`${TG}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

async function sendText(chatId: number, text: string, parseMode: "HTML" | "Markdown" = "HTML") {
  await tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: true,
  });
}

async function generateCodes(count: number, notes?: string) {
  const res = await fetch(`${APP_BASE_URL}/api/codes/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Token": ADMIN_API_TOKEN,
    },
    body: JSON.stringify({ count, notes }),
  });
  return res.json();
}

async function listCodes() {
  const res = await fetch(`${APP_BASE_URL}/api/codes/generate`, {
    headers: { "X-Admin-Token": ADMIN_API_TOKEN },
  });
  return res.json();
}

async function handleUpdate(update: TgUpdate) {
  const msg = update.message;
  if (!msg || !msg.text) return;
  const fromId = msg.from?.id;
  if (fromId !== ADMIN_ID) {
    await sendText(
      msg.chat.id,
      "⛔ غير مصرح. هذا البوت مخصص لمالك النظام فقط."
    );
    return;
  }
  const text = msg.text.trim();
  const [cmd, ...args] = text.split(/\s+/);
  const command = cmd.toLowerCase().split("@")[0];

  try {
    if (command === "/start" || command === "/help") {
      await sendText(
        msg.chat.id,
        `🤖 <b>ALFA Reports — بوت توليد الأكواد</b>\n\n` +
          `الأوامر المتاحة:\n` +
          `• <code>/generate [n]</code> — توليد n أكواد جديدة (افتراضي 1، حد أقصى 50)\n` +
          `• <code>/list</code> — عرض آخر 20 كود\n` +
          `• <code>/stats</code> — إحصائيات سريعة\n\n` +
          `كل كود يعمل على جهاز واحد فقط لمدة 30 يوماً.`
      );
      return;
    }

    if (command === "/generate") {
      const n = Math.min(Math.max(parseInt(args[0] || "1", 10) || 1, 1), 50);
      const notes = args.slice(1).join(" ") || `telegram-${fromId}`;
      await sendText(msg.chat.id, `⏳ جاري توليد ${n} كود تفعيل...`);
      const data = await generateCodes(n, notes);
      if (!data.ok) {
        await sendText(
          msg.chat.id,
          `❌ فشل التوليد: <code>${data.error || "unknown"}</code>`
        );
        return;
      }
      const lines: string[] = [];
      lines.push(`✅ تم توليد <b>${data.codes.length}</b> كود تفعيل جديد:\n`);
      for (const c of data.codes) {
        lines.push(`• <code>${c.code}</code>`);
      }
      lines.push(
        `\n📅 الصلاحية: 30 يوماً من أول استخدام\n🔒 كل كود مرتبط بجهاز واحد فقط`
      );
      await sendText(msg.chat.id, lines.join("\n"));
      return;
    }

    if (command === "/list") {
      const data = await listCodes();
      if (!data.ok) {
        await sendText(msg.chat.id, `❌ فشل: <code>${data.error}</code>`);
        return;
      }
      const codes = (data.codes || []).slice(0, 20);
      if (codes.length === 0) {
        await sendText(msg.chat.id, "📭 لا توجد أكواد بعد. استخدم /generate لإنشاء كود.");
        return;
      }
      const statusEmoji: Record<string, string> = {
        UNUSED: "🟦",
        ACTIVE: "🟢",
        EXPIRED: "🔴",
        REVOKED: "⚫",
      };
      const lines: string[] = [`📋 آخر ${codes.length} كود:`];
      for (const c of codes) {
        const emoji = statusEmoji[c.status] || "⚪";
        const daysLeft = c.expiresAt
          ? Math.max(
              0,
              Math.ceil(
                (new Date(c.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              )
            )
          : "—";
        lines.push(
          `${emoji} <code>${c.code}</code> · ${c.status}` +
            (c.status === "ACTIVE" ? ` · ${daysLeft}ي` : "")
        );
      }
      await sendText(msg.chat.id, lines.join("\n"));
      return;
    }

    if (command === "/stats") {
      const data = await listCodes();
      if (!data.ok) {
        await sendText(msg.chat.id, `❌ فشل: <code>${data.error}</code>`);
        return;
      }
      const codes = data.codes || [];
      const unused = codes.filter((c: any) => c.status === "UNUSED").length;
      const active = codes.filter((c: any) => c.status === "ACTIVE").length;
      const expired = codes.filter((c: any) => c.status === "EXPIRED").length;
      const revoked = codes.filter((c: any) => c.status === "REVOKED").length;
      await sendText(
        msg.chat.id,
        `📊 <b>إحصائيات الأكواد</b>\n\n` +
          `الإجمالي: <b>${codes.length}</b>\n` +
          `🟦 غير مستخدمة: <b>${unused}</b>\n` +
          `🟢 مفعّلة: <b>${active}</b>\n` +
          `🔴 منتهية: <b>${expired}</b>\n` +
          `⚫ ملغاة: <b>${revoked}</b>`
      );
      return;
    }

    await sendText(
      msg.chat.id,
      `❓ أمر غير معروف. أرسل /help لعرض الأوامر المتاحة.`
    );
  } catch (e: any) {
    console.error("handler error:", e);
    await sendText(msg.chat.id, `❌ خطأ: <code>${e?.message || e}</code>`);
  }
}

async function poll() {
  while (true) {
    try {
      const res = await fetch(
        `${TG}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`
      );
      const data = await res.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const u of data.result as TgUpdate[]) {
          if (u.update_id > lastUpdateId) lastUpdateId = u.update_id;
          await handleUpdate(u);
        }
      }
    } catch (e) {
      console.error("poll error:", e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

console.log("🤖 ALFA Reports Telegram bot starting...");
console.log(`   Admin ID: ${ADMIN_ID}`);
console.log(`   App URL:  ${APP_BASE_URL}`);
console.log(`   Polling...`);
poll();
