/**
 * telegram.ts
 *
 * Telegram Bot API helpers.
 *
 * Flow:
 *  1. User enters @telegram_handle in settings and taps the bot link.
 *  2. They open t.me/BOT?start=WALLET — the bot receives a /start message.
 *  3. handleTelegramUpdate() stores their chat_id in contact_reveals.
 *  4. After 3 completed dates with the same partner, sendIntroMessage() fires
 *     for both users (if both have chat_ids registered).
 */

import { dbGetContactReveal, dbUpsertContactReveal } from "./db.js";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? "LemonDatesBot";

async function callTelegram(method: string, body: Record<string, unknown>): Promise<void> {
  if (!BOT_TOKEN) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN not set — skipping.");
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[telegram] ${method} failed:`, text);
  }
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  await callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  });
}

/**
 * Called by POST /telegram/webhook.
 * Handles the /start WALLET command to register a user's chat_id.
 */
export async function handleTelegramUpdate(body: unknown): Promise<void> {
  const update = body as {
    message?: {
      chat: { id: number };
      from?: { username?: string };
      text?: string;
    };
  };

  const msg = update?.message;
  if (!msg?.text) return;

  const chatId = String(msg.chat.id);

  if (msg.text.startsWith("/start")) {
    const parts = msg.text.split(" ");
    const wallet = parts[1] ?? "";

    if (!wallet.startsWith("0x")) {
      await sendTelegramMessage(chatId,
        "🍋 <b>Welcome to Lemon!</b>\n\nTo link your agent, tap the button in your settings page."
      );
      return;
    }

    try {
      const existing = await dbGetContactReveal(wallet) ?? {
        wallet,
        telegram_handle: msg.from?.username ? `@${msg.from.username}` : "",
        telegram_chat_id: "",
        email: "",
        phone: "",
        reveal_price_cents: 0,
      };

      await dbUpsertContactReveal({
        ...existing,
        telegram_chat_id: chatId,
        telegram_handle: existing.telegram_handle || (msg.from?.username ? `@${msg.from.username}` : ""),
      });

      await sendTelegramMessage(chatId,
        "🍋 <b>Linked!</b>\n\nYour Lemon agent is now connected to this chat. After 3 dates with a partner, I'll send you their contact details here automatically."
      );
      console.log(`[telegram] chat_id ${chatId} linked to wallet ${wallet}`);
    } catch (err) {
      console.error("[telegram] handleTelegramUpdate error:", err);
    }
  }
}

/**
 * After a pair completes their 3rd date together, send an intro message
 * to both agents (if both have registered chat_ids).
 */
export async function sendIntroMessage(
  walletA: string,
  walletB: string,
  nameA: string,
  nameB: string
): Promise<void> {
  const [contactA, contactB] = await Promise.all([
    dbGetContactReveal(walletA),
    dbGetContactReveal(walletB),
  ]);

  const formatContact = (c: typeof contactA) => {
    if (!c) return "(no contact info shared)";
    const lines: string[] = [];
    if (c.telegram_handle) lines.push(`Telegram: ${c.telegram_handle}`);
    if (c.email)           lines.push(`Email: ${c.email}`);
    if (c.phone)           lines.push(`Phone: ${c.phone}`);
    return lines.length ? lines.join("\n") : "(no contact info shared)";
  };

  const msgForA =
    `🍋 <b>3 dates done — time to take it further!</b>\n\n` +
    `You and <b>${nameB}</b> have completed 3 great dates together. ` +
    `Your agent thinks you two should keep talking. Here's how to reach them:\n\n` +
    `<b>${nameB}'s contact:</b>\n${formatContact(contactB)}\n\n` +
    `They've been sent your details too. The rest is up to you. ✨`;

  const msgForB =
    `🍋 <b>3 dates done — time to take it further!</b>\n\n` +
    `You and <b>${nameA}</b> have completed 3 great dates together. ` +
    `Your agent thinks you two should keep talking. Here's how to reach them:\n\n` +
    `<b>${nameA}'s contact:</b>\n${formatContact(contactA)}\n\n` +
    `They've been sent your details too. The rest is up to you. ✨`;

  if (contactA?.telegram_chat_id) {
    await sendTelegramMessage(contactA.telegram_chat_id, msgForA);
    console.log(`[telegram] intro sent to ${walletA}`);
  }
  if (contactB?.telegram_chat_id) {
    await sendTelegramMessage(contactB.telegram_chat_id, msgForB);
    console.log(`[telegram] intro sent to ${walletB}`);
  }
}

export { BOT_USERNAME };
