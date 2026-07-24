/**
 * Telegram Bot API client (minimal, no external deps — uses native fetch).
 *
 * Used by the long-polling bot in src/bot/polling-bot.ts to:
 *   - Receive updates (getUpdates with long-polling)
 *   - Send messages (sendMessage)
 *   - Send chat actions (sendChatAction — "typing..." indicator)
 *
 * Env vars:
 *   TELEGRAM_BOT_TOKEN  — bot token from @BotFather (e.g. "7247077218:AAF...")
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API_BASE = "https://api.telegram.org";

if (!TELEGRAM_BOT_TOKEN) {
  console.warn(
    "[Telegram] TELEGRAM_BOT_TOKEN not set — bot will not be able to send or receive messages."
  );
}

export function isTelegramConfigured(): boolean {
  return !!TELEGRAM_BOT_TOKEN;
}

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      is_bot: boolean;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    chat: {
      id: number;
      type: "private" | "group" | "supergroup" | "channel";
      title?: string;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    date: number;
    text?: string;
    entities?: Array<{
      type: "bot_command" | "mention" | "url" | "email" | string;
      offset: number;
      length: number;
    }>;
    reply_to_message?: any;
  };
  callback_query?: any;
};

export type TelegramSendMessageParams = {
  chat_id: number | string;
  text: string;
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  reply_to_message_id?: number;
  disable_web_page_preview?: boolean;
};

/**
 * Send a message via Telegram Bot API.
 * Returns the sent message on success, null on failure.
 */
export async function sendMessage(
  params: TelegramSendMessageParams
): Promise<{ message_id: number } | null> {
  if (!TELEGRAM_BOT_TOKEN) return null;
  try {
    const res = await fetch(
      `${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: params.chat_id,
          text: params.text,
          parse_mode: params.parse_mode || "HTML",
          reply_to_message_id: params.reply_to_message_id,
          disable_web_page_preview: params.disable_web_page_preview ?? true,
        }),
      }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(
        `[Telegram] sendMessage failed: ${res.status} ${res.statusText} — ${txt}`
      );
      return null;
    }
    const data = await res.json();
    if (!data.ok) {
      console.warn(`[Telegram] sendMessage returned !ok:`, data);
      return null;
    }
    return { message_id: data.result.message_id };
  } catch (e: any) {
    console.warn(`[Telegram] sendMessage error:`, e?.message || e);
    return null;
  }
}

/**
 * Show a "typing..." indicator in the chat (good UX while processing a command).
 */
export async function sendChatAction(
  chat_id: number | string,
  action: "typing" | "upload_photo" | "upload_document" | "find_location" = "typing"
): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(
      `${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, action }),
      }
    );
  } catch {
    // ignore — chat action is best-effort
  }
}

/**
 * Long-poll Telegram for new updates.
 *
 * @param offset  The update_id to start from (last seen + 1). Pass 0 for first call.
 * @param timeoutSeconds  Long-poll timeout (Telegram holds the connection for up to this many seconds).
 * @returns Array of updates, or empty array on error.
 */
export async function getUpdates(
  offset: number,
  timeoutSeconds = 30
): Promise<TelegramUpdate[]> {
  if (!TELEGRAM_BOT_TOKEN) return [];
  try {
    const url = new URL(
      `${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/getUpdates`
    );
    url.searchParams.set("timeout", String(timeoutSeconds));
    url.searchParams.set("allowed_updates", JSON.stringify(["message"]));
    if (offset > 0) url.searchParams.set("offset", String(offset));

    // Use AbortController with a generous timeout (polling timeout + 15s buffer)
    const ctrl = new AbortController();
    const abortTimer = setTimeout(
      () => ctrl.abort(),
      (timeoutSeconds + 15) * 1000
    );
    let res: Response;
    try {
      res = await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(abortTimer);
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(
        `[Telegram] getUpdates failed: ${res.status} ${res.statusText} — ${txt}`
      );
      return [];
    }
    const data = await res.json();
    if (!data.ok) {
      console.warn(`[Telegram] getUpdates returned !ok:`, data);
      return [];
    }
    return Array.isArray(data.result) ? data.result : [];
  } catch (e: any) {
    // AbortError is normal when we're shutting down — don't log it loudly
    if (e?.name === "AbortError") return [];
    console.warn(`[Telegram] getUpdates error:`, e?.message || e);
    return [];
  }
}

/**
 * Delete a webhook if one was previously set (otherwise getUpdates won't work).
 * Safe to call on every bot startup.
 */
export async function deleteWebhook(): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(
      `${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`,
      { method: "POST", headers: { "Content-Type": "application/json" } }
    );
  } catch {
    // ignore
  }
}

/**
 * Get information about the bot (used on startup for verification).
 */
export async function getMe(): Promise<{
  id: number;
  username: string;
  first_name: string;
} | null> {
  if (!TELEGRAM_BOT_TOKEN) return null;
  try {
    const res = await fetch(
      `${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/getMe`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok) return null;
    return data.result;
  } catch {
    return null;
  }
}

/**
 * Check if a Telegram user ID is in the admin allowlist.
 *
 * Admin IDs come from env var TELEGRAM_ADMIN_IDS — comma-separated list of
 * numeric Telegram user IDs (e.g. "2021972361,123456789").
 */
export function isAdmin(userId: number): boolean {
  const raw = process.env.TELEGRAM_ADMIN_IDS || "";
  const ids = raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => !isNaN(n) && n > 0);
  return ids.includes(userId);
}
