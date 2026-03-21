/**
 * conversationAgent.ts
 *
 * Runs the 30-minute AI-driven conversation between two matched agents.
 * Both agents are simulated by Claude, each seeded with their profile.
 * The system monitors deal breaker flags in real time — if 3+ flags are
 * triggered the conversation is terminated early.
 */

import OpenAI from "openai";
import type { AgentProfile } from "./matchingEngine.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CONVERSATION_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_DEAL_BREAKER_FLAGS = 3;
const MESSAGE_INTERVAL_MS = 60 * 1000; // one exchange per minute → ~30 exchanges
const CALL_TIMEOUT_MS = 30_000;        // 30s per OpenAI call — abort if hung
const CONVERSATION_TIMEOUT_MS = 3 * 60 * 1000; // 3 min overall cap for simulate mode

/** Races a promise against a timeout. Throws with a clear message if time runs out. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[conversationAgent] ${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export interface ConversationMessage {
  speaker: "A" | "B";
  text: string;
  timestamp: number;
  dealBreakerFlagged?: string | null;
  phase?: "chat" | "proposal" | "accepted";
}

export interface ConversationResult {
  agentA: string;
  agentB: string;
  messages: ConversationMessage[];
  dealBreakerFlags: string[];
  passed: boolean; // true if fewer than MAX_DEAL_BREAKER_FLAGS triggered
  suggestedDateTemplate?: string;
}

/**
 * Builds the system prompt for a single agent role.
 */
function agentSystemPrompt(profile: AgentProfile, role: "A" | "B"): string {
  return `
You are an AI dating agent named "${profile.name}" (Agent ${role}) on the Lemon platform.
You are having a getting-to-know-you conversation with a potential match.

Your personality: ${profile.personality}
What you are looking for: ${profile.preferences}
Your deal breakers (things that would make you end the date): ${profile.dealBreakers.join(", ") || "none"}

Rules:
- Stay in character at all times.
- Be warm, curious, and genuine.
- Ask one meaningful question per message.
- Keep each reply to 2-3 sentences.
- If the other person says something that conflicts with one of your deal breakers, note it clearly with "[DEAL BREAKER: <reason>]" at the end of your message.
`.trim();
}

/**
 * Generates one reply from an agent given the conversation history.
 */
async function generateReply(
  profile: AgentProfile,
  role: "A" | "B",
  history: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const response = await withTimeout(
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 256,
      messages: [
        { role: "system", content: agentSystemPrompt(profile, role) },
        ...history,
      ],
    }),
    CALL_TIMEOUT_MS,
    `generateReply (Agent ${role})`
  );
  const text = response.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("[conversationAgent] OpenAI returned no content");
  return text;
}

/**
 * Checks a single message for deal breaker flags.
 * Returns the flagged reason or null.
 */
function extractDealBreakerFlag(text: string): string | null {
  const match = text.match(/\[DEAL BREAKER:\s*(.+?)\]/i);
  return match ? match[1].trim() : null;
}

/**
 * Runs the full 30-minute conversation between two agent profiles.
 * In production this would be time-gated; in this implementation we
 * simulate up to 30 exchanges (one per simulated minute).
 */
export async function runConversation(
  profileA: AgentProfile,
  profileB: AgentProfile,
  simulate = true,
  onMessage?: (msg: ConversationMessage) => Promise<void>
): Promise<ConversationResult> {
  // In simulate mode, the whole conversation should finish in well under 3 minutes.
  // If it doesn't, something is hung — bail out so the server's catch block can clean up.
  if (simulate) {
    return withTimeout(
      _runConversation(profileA, profileB, simulate, onMessage),
      CONVERSATION_TIMEOUT_MS,
      `runConversation (${profileA.name} ↔ ${profileB.name})`
    );
  }
  return _runConversation(profileA, profileB, simulate, onMessage);
}

async function _runConversation(
  profileA: AgentProfile,
  profileB: AgentProfile,
  simulate = true,
  onMessage?: (msg: ConversationMessage) => Promise<void>
): Promise<ConversationResult> {
  const messages: ConversationMessage[] = [];
  const dealBreakerFlags: string[] = [];

  const historyA: { role: "user" | "assistant"; content: string }[] = [];
  const historyB: { role: "user" | "assistant"; content: string }[] = [];

  // 9 regular exchanges (18 messages) then proposal + accepted = 20 total
  const CHAT_EXCHANGES = 9;
  const PROPOSAL_AT = CHAT_EXCHANGES - 1; // last iteration index

  const TEMPLATE_ACTIVITIES: Record<string, string> = {
    COFFEE: "grab coffee", BEACH: "spend a day at the beach",
    WORK: "co-work together", ROOFTOP_DINNER: "have dinner on a rooftop",
    GALLERY_WALK: "do an art gallery walk",
  };

  // Agent A opens
  let lastReply = await generateReply(profileA, "A", [
    { role: "user", content: `Hi! I'm ${profileB.name}. Great to meet you!` },
  ]);

  const firstMsg: ConversationMessage = { speaker: "A", text: lastReply, timestamp: Date.now(), phase: "chat" };
  messages.push(firstMsg);
  await onMessage?.(firstMsg);
  const flag = extractDealBreakerFlag(lastReply);
  if (flag) dealBreakerFlags.push(flag);

  historyA.push({ role: "user", content: `Hi! I'm ${profileB.name}. Great to meet you!` });
  historyA.push({ role: "assistant", content: lastReply });

  let suggestedDateTemplate: string | undefined;

  for (let i = 0; i < CHAT_EXCHANGES; i++) {
    if (dealBreakerFlags.length >= MAX_DEAL_BREAKER_FLAGS) break;
    if (!simulate) await new Promise((r) => setTimeout(r, MESSAGE_INTERVAL_MS));

    // Agent B replies
    historyB.push({ role: "user", content: lastReply });
    const replyB = await generateReply(profileB, "B", historyB);
    historyB.push({ role: "assistant", content: replyB });

    const flagB = extractDealBreakerFlag(replyB);
    if (flagB) dealBreakerFlags.push(flagB);
    const msgB: ConversationMessage = { speaker: "B", text: replyB, timestamp: Date.now(), dealBreakerFlagged: flagB, phase: "chat" };
    messages.push(msgB);
    await onMessage?.(msgB);

    if (dealBreakerFlags.length >= MAX_DEAL_BREAKER_FLAGS) break;

    // ── Last exchange: Agent A proposes a date, B accepts ────────────────────
    if (i === PROPOSAL_AT) {
      suggestedDateTemplate = await suggestDateTemplate(profileA, profileB, messages);
      const activity = TEMPLATE_ACTIVITIES[suggestedDateTemplate] ?? "meet up";

      const proposalRes = await withTimeout(
        openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 100,
          messages: [{
            role: "user",
            content: `You are ${profileA.name}, an AI dating agent wrapping up a great conversation with ${profileB.name}. Naturally suggest you two should ${activity} together. Warm and genuine, 1-2 sentences. Do NOT use clichés like "love your vibe".`,
          }],
        }),
        CALL_TIMEOUT_MS,
        "proposal generation"
      );
      const proposalText = proposalRes.choices[0]?.message?.content?.trim()
        ?? `I've really enjoyed talking — we should ${activity} sometime!`;

      const proposalMsg: ConversationMessage = { speaker: "A", text: proposalText, timestamp: Date.now(), phase: "proposal" };
      messages.push(proposalMsg);
      await onMessage?.(proposalMsg);

      const acceptRes = await withTimeout(
        openai.chat.completions.create({
          model: "gpt-4o-mini",
          max_tokens: 80,
          messages: [{
            role: "user",
            content: `You are ${profileB.name}. ${profileA.name} just said: "${proposalText}". Respond with genuine enthusiasm. 1-2 sentences, natural.`,
          }],
        }),
        CALL_TIMEOUT_MS,
        "acceptance generation"
      );
      const acceptText = acceptRes.choices[0]?.message?.content?.trim()
        ?? `Yes! That sounds amazing, I'd love that!`;

      const acceptMsg: ConversationMessage = { speaker: "B", text: acceptText, timestamp: Date.now(), phase: "accepted" };
      messages.push(acceptMsg);
      await onMessage?.(acceptMsg);
      break;
    }

    // Regular Agent A reply
    historyA.push({ role: "user", content: replyB });
    const replyA = await generateReply(profileA, "A", historyA);
    historyA.push({ role: "assistant", content: replyA });

    const flagA = extractDealBreakerFlag(replyA);
    if (flagA) dealBreakerFlags.push(flagA);
    const msgA: ConversationMessage = { speaker: "A", text: replyA, timestamp: Date.now(), dealBreakerFlagged: flagA, phase: "chat" };
    messages.push(msgA);
    await onMessage?.(msgA);

    lastReply = replyA;
  }

  const passed = dealBreakerFlags.length < MAX_DEAL_BREAKER_FLAGS;

  return {
    agentA: profileA.wallet,
    agentB: profileB.wallet,
    messages,
    dealBreakerFlags,
    passed,
    suggestedDateTemplate,
  };
}

/**
 * After a successful conversation, ask Claude which of the 5 date templates
 * best fits the two agents' shared preferences.
 */
async function suggestDateTemplate(
  profileA: AgentProfile,
  profileB: AgentProfile,
  messages: ConversationMessage[]
): Promise<string> {
  const transcript = messages.map((m) => `${m.speaker === "A" ? profileA.name : profileB.name}: ${m.text}`).join("\n");

  const prompt = `
Based on this conversation between ${profileA.name} and ${profileB.name}, which date template fits best?

Templates:
1. COFFEE — casual cafe meetup
2. BEACH — outdoor, relaxed, nature
3. WORK — productive co-working session
4. ROOFTOP_DINNER — elevated dining, romantic
5. GALLERY_WALK — art gallery + scenic walk

Conversation excerpt:
${transcript.slice(0, 2000)}

Return ONLY the template name (e.g., "COFFEE"), nothing else.
`.trim();

  const response = await withTimeout(
    openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 16,
      messages: [{ role: "user", content: prompt }],
    }),
    CALL_TIMEOUT_MS,
    "suggestDateTemplate"
  );

  const raw = response.choices[0]?.message?.content?.trim().toUpperCase() ?? "";
  const valid = ["COFFEE", "BEACH", "WORK", "ROOFTOP_DINNER", "GALLERY_WALK"];
  return valid.includes(raw) ? raw : "COFFEE";
}
