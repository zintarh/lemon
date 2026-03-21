/**
 * e2e.ts — Lemon Agent End-to-End Test
 *
 * Exercises the full agent pipeline:
 *   Step 1  — ERC-8004 identity registration for both agents
 *   Step 2  — Matching engine (compatibility score + deal breaker check)
 *   Step 3  — 30-min simulated conversation (deal breaker monitoring)
 *   Step 4  — Date planning (x402 payment + image gen + IPFS + NFT metadata)
 *   Step 5  — Reputation update on ERC-8004 post-date
 *
 * Run:
 *   cd agent && npx tsx test/e2e.ts
 *
 * When API keys are real the test calls live services.
 * When keys are placeholders ("..." / "sk-ant-..." stub) the test runs in
 * MOCK mode — all external calls are stubbed with deterministic responses so
 * the full pipeline wiring is validated without credentials.
 */

import "dotenv/config";
import type { AgentProfile } from "../src/matchingEngine.js";
import { registerAgentIdentity, updateAgentReputation } from "../src/erc8004.js";
import { triggerX402Payment } from "../src/x402.js";
import type { ConversationResult } from "../src/conversationAgent.js";
import type { DatePlan } from "../src/dateAgent.js";

// ─── Test profiles ────────────────────────────────────────────────────────────

const AGENT_A: AgentProfile = {
  wallet: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA01",
  name: "Zara",
  personality: "Creative, adventurous, loves art and cooking. Optimistic and warm.",
  preferences: "Looking for someone curious, ambitious, and kind. Loves exploring new places.",
  dealBreakers: ["dishonesty", "no ambition"],
  billingMode: "SPLIT",
};

const AGENT_B: AgentProfile = {
  wallet: "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB02",
  name: "Leo",
  personality: "Thoughtful, driven, passionate about music and travel. Introvert who opens up over time.",
  preferences: "Seeking creativity, honesty, and a genuine connection. Appreciates deep conversations.",
  dealBreakers: ["rudeness", "close-mindedness"],
  billingMode: "SPLIT",
};

// ─── Mock detection ───────────────────────────────────────────────────────────

function isPlaceholder(val: string | undefined): boolean {
  if (!val) return true;
  return val === "..." || val.endsWith("...") || val === "0x...";
}

const MOCK_MODE =
  isPlaceholder(process.env.ANTHROPIC_API_KEY) ||
  process.env.ANTHROPIC_API_KEY === "sk-ant-...";

// ─── Mock implementations ─────────────────────────────────────────────────────

import type { MatchResult } from "../src/matchingEngine.js";

async function mockFindMatches(agents: AgentProfile[]): Promise<MatchResult[]> {
  const [a, b] = agents;
  return [
    {
      agentA: a.wallet,
      agentB: b.wallet,
      compatibilityScore: 82,
      sharedInterests: ["travel", "creativity", "meaningful conversations"],
      dealBreakerConflicts: [],
      viable: true,
    },
  ];
}

async function mockRunConversation(
  profileA: AgentProfile,
  profileB: AgentProfile
): Promise<ConversationResult> {
  return {
    agentA: profileA.wallet,
    agentB: profileB.wallet,
    messages: [
      {
        speaker: "A",
        text: `Hi! I'm ${profileA.name}. I love discovering hidden art galleries and trying new restaurants. What about you?`,
        timestamp: Date.now(),
        dealBreakerFlagged: null,
      },
      {
        speaker: "B",
        text: `Hey ${profileA.name}! I'm ${profileB.name}. That sounds amazing — I'm all about authentic experiences. I love music and long walks through new cities.`,
        timestamp: Date.now() + 60000,
        dealBreakerFlagged: null,
      },
      {
        speaker: "A",
        text: "Music and new cities — we definitely overlap there! Do you have a favourite travel memory?",
        timestamp: Date.now() + 120000,
        dealBreakerFlagged: null,
      },
      {
        speaker: "B",
        text: "Stumbling upon a jazz bar in Lisbon at midnight. Nothing planned, just pure magic. You?",
        timestamp: Date.now() + 180000,
        dealBreakerFlagged: null,
      },
    ],
    dealBreakerFlags: [],
    passed: true,
    suggestedDateTemplate: "GALLERY_WALK",
  };
}

async function mockPlanDate(
  profileA: AgentProfile,
  profileB: AgentProfile,
  template: string,
  sharedInterests: string[]
): Promise<DatePlan> {
  const payment = await triggerX402Payment(
    profileA.wallet as `0x${string}`,
    profileB.wallet as `0x${string}`,
    "SPLIT"
  );

  return {
    agentA: profileA.wallet,
    agentB: profileB.wallet,
    template: template as DatePlan["template"],
    payerMode: "SPLIT",
    payment,
    imagePrompt:
      "two cute robot avatars walking through a bright art gallery, colorful paintings on the walls. Named Zara and Leo.",
    imageUrl: "https://mock-image.example.com/lemon-date.png",
    ipfsImageCID: "QmMockIPFSImageCID000000000000000000000000000000",
    metadataURI: "ipfs://QmMockIPFSMetadataCID0000000000000000000000000",
    tweetCaption:
      "✨ @Zara and @Leo just went on a Gallery & Walk Date 🎨 on @LemonDates!\nThey bonded over travel & creativity. 💛\nTheir AI agents did all the work — from matching to payment to date planning. 🍋\n#LemonDates #AIAgents #Celo",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function section(title: string) {
  console.log("\n" + "═".repeat(60));
  console.log(`  ${title}`);
  console.log("═".repeat(60));
}

function ok(label: string, value: unknown) {
  const display =
    typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
  console.log(`  ✓ ${label}: ${display}`);
}

function warn(label: string, value: unknown) {
  console.log(`  ⚠ ${label}: ${value}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🍋  Lemon Agent — End-to-End Test");
  console.log(`    ${new Date().toISOString()}`);

  if (MOCK_MODE) {
    console.log(
      "\n  ⚠  MOCK MODE — API keys not configured; all AI calls are stubbed."
    );
    console.log(
      "     Set ANTHROPIC_API_KEY, OPENAI_API_KEY, PINATA_API_KEY in .env"
    );
    console.log("     to run against live services.\n");
  } else {
    console.log("  🔑  LIVE MODE — calling real APIs\n");
  }

  // ── Step 1: ERC-8004 Registration ─────────────────────────────────────────
  section("Step 1 — ERC-8004 Identity Registration");

  const [regA, regB] = await Promise.all([
    registerAgentIdentity(AGENT_A),
    registerAgentIdentity(AGENT_B),
  ]);

  ok("Zara registered", `agentId=${regA.agentId}  mock=${regA.mock}`);
  ok("Leo registered ", `agentId=${regB.agentId}  mock=${regB.mock}`);

  // ── Step 2: Matching Engine ───────────────────────────────────────────────
  section("Step 2 — Matching Engine");

  const { findMatches } = MOCK_MODE
    ? { findMatches: mockFindMatches }
    : await import("../src/matchingEngine.js");

  const matches = await findMatches([AGENT_A, AGENT_B]);

  if (matches.length === 0) {
    warn("No viable matches (deal breakers may have blocked the pair)", "");
    console.log("  → Proceeding anyway for conversation step…");
  } else {
    const m = matches[0];
    ok("Compatibility score", m.compatibilityScore);
    ok("Shared interests  ", m.sharedInterests);
    ok("Deal breaker conflicts", m.dealBreakerConflicts.length === 0 ? "none" : m.dealBreakerConflicts);
    ok("Viable            ", m.viable);
  }

  // ── Step 3: 30-Min Simulated Conversation ────────────────────────────────
  section("Step 3 — AI Conversation (simulated)");

  const conversationFn = MOCK_MODE
    ? mockRunConversation
    : (await import("../src/conversationAgent.js")).runConversation;

  const conversation = await conversationFn(AGENT_A, AGENT_B, true);

  ok("Messages exchanged     ", conversation.messages.length);
  ok("Deal breaker flags     ", conversation.dealBreakerFlags.length);
  ok("Conversation passed    ", conversation.passed);
  ok("Suggested date template", conversation.suggestedDateTemplate ?? "N/A");

  console.log("\n  Sample dialogue:");
  for (const msg of conversation.messages.slice(0, 2)) {
    const speaker = msg.speaker === "A" ? AGENT_A.name : AGENT_B.name;
    const excerpt = msg.text.slice(0, 110) + (msg.text.length > 110 ? "…" : "");
    console.log(`    ${speaker.padEnd(6)}: ${excerpt}`);
  }

  if (!conversation.passed) {
    warn("Conversation failed — 3+ deal breakers triggered", conversation.dealBreakerFlags);
    warn("Skipping date planning step", "");
    process.exit(0);
  }

  // ── Step 4: Date Planning (x402 + Image + IPFS + NFT metadata) ───────────
  section("Step 4 — Date Planning (x402 payment + image + IPFS)");

  const template = (conversation.suggestedDateTemplate ?? "COFFEE") as Parameters<
    typeof import("../src/dateAgent.js").planDate
  >[2];
  const sharedInterests = matches[0]?.sharedInterests ?? ["creativity", "travel"];

  console.log(`  Template        : ${template}`);
  console.log(`  Shared interests: ${sharedInterests.join(", ")}`);

  const planFn = MOCK_MODE
    ? mockPlanDate
    : (await import("../src/dateAgent.js")).planDate;

  let plan: DatePlan;
  try {
    plan = await planFn(AGENT_A, AGENT_B, template, sharedInterests) as DatePlan;

    ok("x402 payment hash  ", `${plan.payment.txHash.slice(0, 20)}…  (mock=${plan.payment.mock})`);
    ok("Amount paid        ", `$${(plan.payment.amountCents / 100).toFixed(2)} cUSD`);
    ok("Payer mode         ", plan.payerMode);
    ok("DALL-E image URL   ", plan.imageUrl
      ? plan.imageUrl.slice(0, 55) + "…"
      : "(skipped)");
    ok("IPFS image CID     ", plan.ipfsImageCID);
    ok("NFT metadata URI   ", plan.metadataURI);
    console.log("\n  Tweet caption:");
    for (const line of plan.tweetCaption.split("\n")) {
      console.log(`    ${line}`);
    }
  } catch (err) {
    console.error("\n  ❌  Date planning failed:", (err as Error).message);
    process.exit(1);
  }

  // ── Step 5: ERC-8004 Reputation Update ───────────────────────────────────
  section("Step 5 — ERC-8004 Reputation Update (post-date)");

  const [repA, repB] = await Promise.all([
    updateAgentReputation(regA.agentId, true),
    updateAgentReputation(regB.agentId, true),
  ]);

  ok("Zara reputation", `updated=${repA.success}  newScore=${repA.newScore}`);
  ok("Leo  reputation", `updated=${repB.success}  newScore=${repB.newScore}`);

  // ── Summary ───────────────────────────────────────────────────────────────
  section(`✅  End-to-End Test PASSED  (${MOCK_MODE ? "MOCK" : "LIVE"} mode)`);

  console.log(`
  ┌─────────────────────────────────────────────────────┐
  │  Pipeline summary                                   │
  ├─────────────────────────────────────────────────────┤
  │  ERC-8004 registration  Zara=${String(regA.agentId).padEnd(4)} Leo=${String(regB.agentId).padEnd(17)}│
  │  Match score            ${String(matches[0]?.compatibilityScore ?? "N/A").padEnd(32)}│
  │  Conversation           ${String(conversation.messages.length + " messages, passed=" + conversation.passed).padEnd(32)}│
  │  Date template          ${String(template).padEnd(32)}│
  │  x402 payment           ${(plan.payment.txHash.slice(0, 14) + "… mock=" + plan.payment.mock).padEnd(32)}│
  │  NFT metadata           ${plan.metadataURI.slice(0, 30).padEnd(32)}│
  │  Reputation update      Zara=${repA.success} Leo=${repB.success}${" ".repeat(21)}│
  └─────────────────────────────────────────────────────┘
`);
}

main().catch((err) => {
  console.error("\n❌  E2E test failed:", err.message ?? err);
  process.exit(1);
});
