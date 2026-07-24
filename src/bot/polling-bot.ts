/**
 * ALFA Reports — Telegram Bot (Long-Polling).
 *
 * This is a STANDALONE Node.js script that runs as a sidecar to the main
 * Next.js app. It:
 *   1. Long-polls Telegram for updates via getUpdates().
 *   2. Parses commands from authorized admin users.
 *   3. Calls the local API endpoints (/api/codes/generate, etc.) to perform
 *      actions — reusing the same logic as the web UI.
 *   4. Sends responses back via sendMessage().
 *
 * Why a sidecar instead of a Next.js API route (webhook)?
 *   - Webhooks require HTTPS with a valid public cert. The VPS is currently
 *     HTTP-only on port 3000. Long-polling works behind any network (the bot
 *     initiates the connection outbound).
 *   - Long-polling is simpler to deploy — no DNS, no cert, no reverse proxy.
 *
 * Commands supported:
 *   /start              — greeting + help
 *   /help               — full command list
 *   /gen                — generate 1 generic code (30-day expiry)
 *   /gen <count>        — generate N generic codes (max 20)
 *   /gen <count> <days> — generate N generic codes with custom expiry (days)
 *   /mt5 <login>        — generate a code bound to MT5 login (30-day expiry)
 *   /mt5 <login> <days> — bound code with custom expiry
 *   /list               — list last 10 codes
 *   /status             — bot status + config sanity check
 *
 * Auth:
 *   Only Telegram user IDs listed in TELEGRAM_ADMIN_IDS env var can use the bot.
 *   Non-admins receive a polite "not authorized" message.
 *
 * Env vars:
 *   TELEGRAM_BOT_TOKEN     — bot token from @BotFather
 *   TELEGRAM_ADMIN_IDS     — comma-separated admin Telegram user IDs
 *   ADMIN_API_TOKEN        — used to call /api/codes/generate (must match .env)
 *   ALFA_API_BASE          — base URL of the Next.js app (default: http://localhost:3000)
 *   BOT_POLL_TIMEOUT       — long-poll timeout in seconds (default: 30)
 */

import "dotenv/config";
import {
  isTelegramConfigured,
  getMe,
  getUpdates,
  sendMessage,
  sendChatAction,
  deleteWebhook,
  isAdmin,
  type TelegramUpdate,
} from "../lib/telegram.js";

const ALFA_API_BASE =
  process.env.ALFA_API_BASE || "http://localhost:3000";
const ADMIN_API_TOKEN =
  process.env.ADMIN_API_TOKEN || process.env.TELEGRAM_ADMIN_TOKEN || "";
const POLL_TIMEOUT = Number(process.env.BOT_POLL_TIMEOUT || 30);

// ============================================================
// Command handlers
// ============================================================

type CommandResult = { text: string; success: boolean };

async function handleStart(): Promise<CommandResult> {
  return {
    success: true,
    text:
      "👋 <b>أهلاً بك في بوت ALFA Reports</b>\n\n" +
      "هذا البوت يولّد أكواد تفعيل للمشتركين.\n\n" +
      "<b>الأوامر المتاحة:</b>\n" +
      "• <code>/gen</code> — توليد كود واحد (30 يوم)\n" +
      "• <code>/gen 5</code> — توليد 5 أكواد\n" +
      "• <code>/gen 3 60</code> — 3 أكواد بصلاحية 60 يوم\n" +
      "• <code>/mt5 5012345</code> — كود مرتبط بحساب MT5\n" +
      "• <code>/mt5 5012345 90</code> — مرتبط بـ MT5 + 90 يوم\n" +
      "• <code>/list</code> — آخر 10 أكواد\n" +
      "• <code>/status</code> — حالة البوت\n" +
      "• <code>/help</code> — هذه القائمة\n\n" +
      "⚠️ هذا البوت للأدمن فقط — الأرقام غير المصرّح بها لا يمكنها استخدامه.",
  };
}

async function handleHelp(): Promise<CommandResult> {
  return {
    success: true,
    text:
      "📖 <b>دليل الأوامر</b>\n\n" +
      "<b>توليد الأكواد:</b>\n" +
      "• <code>/gen</code> — كود واحد بصلاحية 30 يوم\n" +
      "• <code>/gen 5</code> — 5 أكواد\n" +
      "• <code>/gen 5 90</code> — 5 أكواد بصلاحية 90 يوم\n\n" +
      "<b>أكواد مرتبطة بـ MT5:</b>\n" +
      "• <code>/mt5 5012345</code> — كود لرقم MT5 محدد (30 يوم)\n" +
      "• <code>/mt5 5012345 60</code> — مرتبط + 60 يوم\n\n" +
      "<b>الإدارة:</b>\n" +
      "• <code>/list</code> — آخر 10 أكواد تم توليدها\n" +
      "• <code>/status</code> — حالة البوت والاتصال\n\n" +
      "<b>ملاحظات:</b>\n" +
      "• الحد الأقصى للأكواد في الأمر الواحد: 20\n" +
      "• الحد الأقصى للصلاحية: 365 يوم\n" +
      "• الكود المرتبط بـ MT5 لا يعمل إلا مع رقم الحساب المحدد",
  };
}

async function handleGenerate(args: string[]): Promise<CommandResult> {
  const count = Math.min(Math.max(Number(args[0] || "1") || 1, 1), 20);
  const expiresDays = Math.min(
    Math.max(Number(args[1] || "30") || 30, 1),
    365
  );

  try {
    const res = await fetch(`${ALFA_API_BASE}/api/codes/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": ADMIN_API_TOKEN,
      },
      body: JSON.stringify({ count, expiresDays, notes: "telegram-bot" }),
    });
    const data = await res.json();
    if (!data.ok) {
      return {
        success: false,
        text: `❌ <b>فشل التوليد</b>\n\n${data.error || "خطأ غير معروف"}`,
      };
    }
    const codes: Array<{ code: string; createdAt: string }> = data.codes;
    if (!codes || codes.length === 0) {
      return { success: false, text: "❌ لم يتم توليد أي أكواد." };
    }
    const lines = codes.map((c) => `• <code>${c.code}</code>`);
    return {
      success: true,
      text:
        `✅ <b>تم توليد ${codes.length} كود</b>\n` +
        `📅 الصلاحية: ${expiresDays} يوم\n\n` +
        lines.join("\n") +
        `\n\n🔗 <a href="${ALFA_API_BASE}">افتح لوحة المشترك</a>`,
    };
  } catch (e: any) {
    return {
      success: false,
      text: `❌ <b>خطأ في الاتصال بالـ API</b>\n\n${e?.message || e}`,
    };
  }
}

async function handleMt5(args: string[]): Promise<CommandResult> {
  const mt5Login = String(args[0] || "").trim();
  if (!mt5Login) {
    return {
      success: false,
      text:
        "❌ <b>الاستخدام:</b> <code>/mt5 &lt;MT5_LOGIN&gt; [days]</code>\n\n" +
        "مثال: <code>/mt5 5012345</code>\n" +
        "مثال: <code>/mt5 5012345 90</code>",
    };
  }
  const expiresDays = Math.min(
    Math.max(Number(args[1] || "30") || 30, 1),
    365
  );

  try {
    const res = await fetch(`${ALFA_API_BASE}/api/codes/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-token": ADMIN_API_TOKEN,
      },
      body: JSON.stringify({
        mt5Login,
        expiresDays,
        notes: `Bound to MT5 ${mt5Login}`,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      return {
        success: false,
        text: `❌ <b>فشل التوليد</b>\n\n${data.error || "خطأ غير معروف"}`,
      };
    }
    return {
      success: true,
      text:
        `✅ <b>تم توليد كود مرتبط بـ MT5</b>\n\n` +
        `🔑 الكود: <code>${data.code}</code>\n` +
        `📞 MT5 Login: <code>${data.mt5Login}</code>\n` +
        `📅 ينتهي في: ${new Date(data.expiresAt).toLocaleString("ar-EG", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}\n\n` +
        `⚠️ هذا الكود لا يعمل إلا مع حساب MT5 رقم <code>${data.mt5Login}</code>`,
    };
  } catch (e: any) {
    return {
      success: false,
      text: `❌ <b>خطأ في الاتصال بالـ API</b>\n\n${e?.message || e}`,
    };
  }
}

async function handleList(): Promise<CommandResult> {
  try {
    const res = await fetch(`${ALFA_API_BASE}/api/codes/generate`, {
      headers: { "x-admin-token": ADMIN_API_TOKEN },
    });
    const data = await res.json();
    if (!data.ok) {
      return {
        success: false,
        text: `❌ <b>فشل جلب القائمة</b>\n\n${data.error || ""}`,
      };
    }
    const codes: Array<{
      code: string;
      status: string;
      mt5Login: string | null;
      createdAt: string;
      expiresAt: string | null;
    }> = data.codes || [];
    if (codes.length === 0) {
      return { success: true, text: "📭 لا توجد أكواد في قاعدة البيانات." };
    }
    const last10 = codes.slice(0, 10);
    const lines = last10.map((c) => {
      const status =
        c.status === "UNUSED"
          ? "🟢"
          : c.status === "ACTIVE"
          ? "🔵"
          : c.status === "EXPIRED"
          ? "🔴"
          : "⚫";
      const mt5 = c.mt5Login ? ` [<code>${c.mt5Login}</code>]` : "";
      const date = new Date(c.createdAt).toLocaleDateString("ar-EG");
      return `${status} <code>${c.code}</code>${mt5} — ${date}`;
    });
    return {
      success: true,
      text:
        `📋 <b>آخر ${last10.length} كود</b>\n\n` +
        lines.join("\n") +
        `\n\n<b>الإجمالي:</b> ${codes.length} كود`,
    };
  } catch (e: any) {
    return {
      success: false,
      text: `❌ <b>خطأ في الاتصال بالـ API</b>\n\n${e?.message || e}`,
    };
  }
}

async function handleStatus(): Promise<CommandResult> {
  const me = await getMe();
  const adminIds = (process.env.TELEGRAM_ADMIN_IDS || "")
    .split(/[,\s]+/)
    .filter(Boolean)
    .join(", ");
  return {
    success: true,
    text:
      `📊 <b>حالة البوت</b>\n\n` +
      `🤖 البوت: @${me?.username || "(غير متصل)"}\n` +
      `🆔 Bot ID: <code>${me?.id || "—"}</code>\n` +
      `🌐 API Base: <code>${ALFA_API_BASE}</code>\n` +
      `👥 Admin IDs: <code>${adminIds || "—"}</code>\n` +
      `🔑 Admin Token: ${ADMIN_API_TOKEN ? "✅ مضبوط" : "❌ ناقص"}\n` +
      `⏱️ Poll timeout: ${POLL_TIMEOUT}s`,
  };
}

// ============================================================
// Update dispatcher
// ============================================================

async function processUpdate(update: TelegramUpdate): Promise<void> {
  if (!update.message || !update.message.text) return;
  const msg = update.message;
  const chatId = msg.chat.id;
  const userId = msg.from?.id;
  const text = msg.text.trim();

  // Only handle messages that start with a bot command.
  const cmdEntity = msg.entities?.find((e) => e.type === "bot_command");
  if (!cmdEntity) return;
  const cmdText = text.slice(cmdEntity.offset, cmdEntity.offset + cmdEntity.length);
  const argsStr = text.slice(cmdEntity.offset + cmdEntity.length).trim();
  const args = argsStr ? argsStr.split(/\s+/) : [];
  const command = cmdText.toLowerCase().split("@")[0]; // strip @botname suffix

  // Auth check — only admins can use the bot.
  if (!userId || !isAdmin(userId)) {
    await sendMessage({
      chat_id: chatId,
      text:
        "⛔ <b>غير مصرّح</b>\n\n" +
        "هذا البوت للأدمن فقط. معرّفك: <code>" +
        userId +
        "</code>\n" +
        "تواصل مع الأدمن لإضافتك لقائمة المصرّح لهم.",
      reply_to_message_id: msg.message_id,
    });
    return;
  }

  // Show "typing..." indicator while we process.
  await sendChatAction(chatId, "typing");

  let result: CommandResult;
  try {
    switch (command) {
      case "/start":
        result = await handleStart();
        break;
      case "/help":
        result = await handleHelp();
        break;
      case "/gen":
      case "/generate":
      case "/new":
        result = await handleGenerate(args);
        break;
      case "/mt5":
      case "/bind":
        result = await handleMt5(args);
        break;
      case "/list":
      case "/codes":
        result = await handleList();
        break;
      case "/status":
        result = await handleStatus();
        break;
      default:
        result = {
          success: false,
          text:
            `❓ <b>أمر غير معروف</b>: <code>${command}</code>\n\n` +
            "اكتب <code>/help</code> لعرض قائمة الأوامر.",
        };
    }
  } catch (e: any) {
    result = {
      success: false,
      text: `❌ <b>خطأ في المعالجة</b>\n\n${e?.message || e}`,
    };
  }

  await sendMessage({
    chat_id: chatId,
    text: result.text,
    reply_to_message_id: msg.message_id,
  });
}

// ============================================================
// Main polling loop
// ============================================================

async function main() {
  console.log("[ALFA Bot] Starting Telegram polling bot...");

  if (!isTelegramConfigured()) {
    console.error("[ALFA Bot] TELEGRAM_BOT_TOKEN not set — exiting.");
    process.exit(1);
  }
  if (!ADMIN_API_TOKEN) {
    console.error("[ALFA Bot] ADMIN_API_TOKEN not set — bot won't be able to call /api/codes/generate.");
  }

  // Verify the bot token is valid.
  const me = await getMe();
  if (!me) {
    console.error("[ALFA Bot] Failed to verify bot token (getMe returned null). Check TELEGRAM_BOT_TOKEN.");
    process.exit(1);
  }
  console.log(`[ALFA Bot] Connected as @${me.username} (id=${me.id})`);

  // Make sure no webhook is set (would conflict with long-polling).
  await deleteWebhook();
  console.log("[ALFA Bot] Webhook deleted (if any).");

  const adminIds = (process.env.TELEGRAM_ADMIN_IDS || "")
    .split(/[,\s]+/)
    .filter(Boolean)
    .join(", ");
  console.log(`[ALFA Bot] Admin IDs: ${adminIds || "(none — no one can use the bot!)"}`);
  console.log(`[ALFA Bot] API base: ${ALFA_API_BASE}`);
  console.log(`[ALFA Bot] Polling timeout: ${POLL_TIMEOUT}s`);
  console.log("[ALFA Bot] Polling started. Press Ctrl+C to stop.\n");

  let offset = 0;
  // Graceful shutdown flag
  let shuttingDown = false;
  const shutdown = (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[ALFA Bot] ${sig} received — shutting down gracefully...`);
    // The next getUpdates call (if in-flight) will be aborted by the fetch
    // timeout. We just exit here.
    setTimeout(() => process.exit(0), 500);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  while (!shuttingDown) {
    const updates = await getUpdates(offset, POLL_TIMEOUT);
    for (const upd of updates) {
      offset = Math.max(offset, upd.update_id + 1);
      try {
        await processUpdate(upd);
      } catch (e: any) {
        console.warn("[ALFA Bot] Error processing update:", e?.message || e);
      }
    }
  }
}

main().catch((e) => {
  console.error("[ALFA Bot] Fatal error:", e);
  process.exit(1);
});
