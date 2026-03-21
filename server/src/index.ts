/**
 * server/src/index.ts
 *
 * Express backend for Lemon. Exposes REST endpoints used by the frontend
 * and orchestrates the full date lifecycle.
 *
 * Read path  → Supabase (fast, indexed)
 * Write path → on-chain (viem) then Supabase update via indexer
 *
 *  POST /api/agents/register          — notify server of new on-chain registration
 *  POST /api/match/run                — trigger matching run for all active agents
 *  POST /api/conversation/start       — start a 30-min AI conversation for a pair
 *  POST /api/date/book                — book date on-chain after conversation passes
 *  GET  /api/date/:dateId             — get date details
 *  GET  /api/leaderboard              — leaderboard from Supabase
 *  GET  /api/agents/:wallet           — get agent profile from Supabase
 */

import "./loadEnv.js";
import express, { type Request, type Response } from "express";
import cors from "cors";
import axios from "axios";
import {
  bookDate,
  completeDate,
  mintNFT,
  resolveNextPayer,
  generateAgentWallet,
  setOperatorKey,
  fundAgentWallet,
} from "./onchain.js";
import { postDateTweet } from "./twitter.js";
import { checkSelfStatus, startSelfSession, pollAndUpdateDB } from "./selfclaw.js";
// indexer.ts is kept for reference but not used — DB is written directly after tx receipt
import { handleTelegramUpdate, sendIntroMessage } from "./telegram.js";
import { buildDatePaymentRequest } from "./x402.js";
import { registerERC8004Agent } from "./erc8004.js";
import {
  dbGetAllActiveAgents,
  dbGetAgent,
  dbGetDate,
  dbUpsertDate,
  dbGetLeaderboard,
  dbSaveConversation,
  dbAppendConversationMessage,
  dbGetLiveConversation,
  dbHasActiveDateBetween,
  dbHasLiveConversationBetween,
  dbMarkConversationDone,
  dbSaveMatches,
  dbUpdateDate,
  dbUpsertAgent,
  dbGetContactReveal,
  dbUpsertContactReveal,
  dbCountCompletedDatesBetween,
} from "./db.js";
import type { Address, Hash } from "viem";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const AGENT_URL = process.env.AGENT_URL ?? `http://localhost:${process.env.AGENT_PORT ?? 5000}`;
const PORT = process.env.SERVER_PORT ?? 4000;

const CUSD_ADDRESS = (
  process.env.NETWORK === "testnet"
    ? "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1"
    : "0x765DE816845861e75A25fCA122bb6898B8B1282a"
) as Address;

function agentCall(path: string, body: unknown) {
  return axios.post(`${AGENT_URL}${path}`, body).then((r) => r.data);
}

// ─── Health ──────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── POST /api/agents/register ───────────────────────────────────────────────
// Called by the frontend after a successful on-chain registration tx.
// Idempotent: calling it multiple times is safe — existing agent_wallet is reused.

app.post("/api/agents/register", async (req: Request, res: Response) => {
  try {
    const { wallet } = req.body as { wallet: Address };
    if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
      res.status(400).json({ error: "Invalid wallet address" });
      return;
    }

    // ── 1. Fetch on-chain profile with retry (RPC nodes can lag a few seconds) ──
    const { getAgentProfile } = await import("./onchain.js");
    let raw: Awaited<ReturnType<typeof getAgentProfile>> | null = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        raw = await getAgentProfile(wallet);
        break;
      } catch (e) {
        if (attempt === 4) throw new Error(`Could not read agent profile after 4 attempts: ${(e as Error).message}`);
        console.warn(`[server] getAgentProfile attempt ${attempt} failed, retrying in 2s…`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (!raw) throw new Error("Failed to fetch agent profile from chain");

    // ── 2. Check if already registered in DB — reuse existing agent wallet ──────
    const existing = await dbGetAgent(wallet);
    let agentWalletAddress: string;
    let agentPrivateKey: string;

    if (existing?.agent_wallet && existing?.agent_private_key) {
      // Already set up — reuse to avoid losing the private key
      agentWalletAddress = existing.agent_wallet;
      agentPrivateKey = existing.agent_private_key;
      console.log(`[server] Reusing existing agent wallet: ${agentWalletAddress}`);
    } else {
      // First time: generate wallet, store it, then set operator key in background
      const agentWallet = generateAgentWallet();
      agentWalletAddress = agentWallet.address.toLowerCase();
      agentPrivateKey = agentWallet.privateKey;
      console.log(`[server] Agent wallet created: ${agentWallet.address} (operator for ${raw.wallet})`);
      // Set operator key in background — not critical for registration to succeed
      void setOperatorKey(raw.wallet, agentWallet.address)
        .then(() => console.log(`[server] Operator key set: ${raw!.wallet} → ${agentWallet.address}`))
        .catch((e) => console.error("[server] setOperatorKey failed (non-fatal):", e.message));
      // Fund in background — gas money, not critical for the response
      void fundAgentWallet(agentWallet.address).catch((e) =>
        console.error("[server] fundAgentWallet failed (non-fatal):", e.message)
      );
    }

    // ── 3. ERC-8004 registration (best-effort, 10s timeout) ──────────────────
    const erc8004AgentId = await Promise.race([
      registerERC8004Agent({
        wallet: raw.wallet,
        name: raw.name,
        agentURI: raw.agentURI,
        personality: raw.personality,
        registeredAt: Number(raw.registeredAt),
      }).catch((e) => {
        console.error("[server] ERC-8004 registration failed (non-fatal):", e.message);
        return existing?.erc8004_agent_id ? BigInt(existing.erc8004_agent_id) : raw!.erc8004AgentId;
      }),
      new Promise<bigint>((resolve) =>
        setTimeout(() => resolve(existing?.erc8004_agent_id ? BigInt(existing.erc8004_agent_id) : raw!.erc8004AgentId), 10_000)
      ),
    ]);

    // ── 4. Write to DB ────────────────────────────────────────────────────────
    await dbUpsertAgent({
      wallet: raw.wallet.toLowerCase(),
      name: raw.name,
      avatar_uri: raw.avatarURI,
      agent_uri: raw.agentURI,
      personality: raw.personality,
      preferences: raw.preferences,
      deal_breakers: raw.dealBreakers,
      billing_mode: raw.billingMode,
      erc8004_agent_id: erc8004AgentId.toString(),
      // Preserve existing selfclaw fields; updated in background after polling
      selfclaw_public_key: existing?.selfclaw_public_key ?? "",
      selfclaw_private_key: existing?.selfclaw_private_key ?? "",
      selfclaw_session_id: existing?.selfclaw_session_id ?? "",
      selfclaw_human_id: existing?.selfclaw_human_id ?? "",
      selfclaw_verified: existing?.selfclaw_verified ?? false,
      agent_wallet: agentWalletAddress,
      agent_private_key: agentPrivateKey,
      registered_at: Number(raw.registeredAt),
      active: raw.active,
      indexed_at: new Date().toISOString(),
    });

    // ── 5. Done — SelfClaw is initiated separately via /api/agents/:wallet/selfclaw/retry ──
    res.json({ ok: true, erc8004AgentId: erc8004AgentId.toString() });
  } catch (err) {
    const msg = (err as Error).message;
    console.error("[server] /api/agents/register error:", msg);
    res.status(500).json({ error: msg });
  }
});

// ─── POST /api/match/run ─────────────────────────────────────────────────────
// Runs the full matching cycle (find matches + start conversation) immediately.
// Called by the dashboard "Check for match now" button.

app.post("/api/match/run", async (_req: Request, res: Response) => {
  // Respond immediately so the button doesn't time out — cycle runs in background
  res.json({ ok: true, message: "Matching cycle started" });
  runMatchingCycle().catch((err) =>
    console.error("[server] /api/match/run cycle error:", (err as Error).message)
  );
});

// ─── POST /api/payment/initiate ──────────────────────────────────────────────
// Returns the payment request(s) the client must fulfil before calling date/book.

app.post("/api/payment/initiate", async (req: Request, res: Response) => {
  try {
    const { walletA, walletB, payerMode } = req.body as {
      walletA: Address;
      walletB: Address;
      payerMode: "AGENT_A" | "AGENT_B" | "SPLIT";
    };
    const requests = buildDatePaymentRequest(walletA, walletB, payerMode);
    res.json({ requests, totalCents: Number(process.env.DATE_COST_CENTS ?? 500) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/conversation/message ──────────────────────────────────────────
// Called by the agent service after each message — saves to DB for live polling

app.post("/api/conversation/message", async (req: Request, res: Response) => {
  try {
    const { walletA, walletB, message } = req.body as { walletA: string; walletB: string; message: object };
    await dbAppendConversationMessage(walletA, walletB, message);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/conversation/live ───────────────────────────────────────────────
// Returns the current in-progress conversation for a wallet (for live polling)

app.get("/api/conversation/live", async (req: Request, res: Response) => {
  try {
    const { wallet } = req.query as { wallet: string };
    if (!wallet) { res.status(400).json({ error: "wallet required" }); return; }
    const convo = await dbGetLiveConversation(wallet);
    res.json(convo ?? null);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/conversation/reset ────────────────────────────────────────────
// Emergency: mark all stuck (passed=false) conversations for a wallet as done.
// Call this when a conversation is frozen and agents are permanently blocked.

app.post("/api/conversation/reset", async (req: Request, res: Response) => {
  try {
    const { wallet } = req.body as { wallet?: string };

    if (wallet) {
      // Reset all stuck conversations for this specific wallet
      const w = wallet.toLowerCase();
      const { error } = await (await import("./db.js")).supabase
        .from("conversations")
        .update({ passed: true })
        .eq("passed", false)
        .or(`wallet_a.eq.${w},wallet_b.eq.${w}`);
      if (error) throw new Error(error.message);
      console.log(`[server] Conversation reset for wallet ${w}`);
      res.json({ ok: true, wallet: w });
    } else {
      // Reset ALL stuck conversations globally
      const { error, count } = await (await import("./db.js")).supabase
        .from("conversations")
        .update({ passed: true })
        .eq("passed", false);
      if (error) throw new Error(error.message);
      console.log(`[server] Global conversation reset — ${count ?? "?"} rows cleared`);
      res.json({ ok: true, cleared: count ?? 0 });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/conversation/start ────────────────────────────────────────────

app.post("/api/conversation/start", async (req: Request, res: Response) => {
  try {
    const { walletA, walletB } = req.body as { walletA: Address; walletB: Address };

    const [agentA, agentB] = await Promise.all([
      dbGetAgent(walletA),
      dbGetAgent(walletB),
    ]);

    if (!agentA || !agentB) {
      res.status(404).json({ error: "One or both agents not found in index" });
      return;
    }

    const toProfile = (a: typeof agentA) => ({
      wallet: a!.wallet,
      name: a!.name,
      personality: a!.personality,
      preferences: a!.preferences,
      dealBreakers: a!.deal_breakers,
      billingMode: a!.billing_mode === 0 ? "SPLIT" : "SOLO",
    });

    const result = await agentCall("/conversation", {
      profileA: toProfile(agentA),
      profileB: toProfile(agentB),
      simulate: true,
    });

    // Persist conversation transcript
    // Agent returns: { messages, dealBreakerFlags, passed, suggestedDateTemplate }
    await dbSaveConversation({
      wallet_a: walletA.toLowerCase(),
      wallet_b: walletB.toLowerCase(),
      transcript: { messages: result.messages ?? [] },
      passed: result.passed ?? false,
      deal_breaker_hit: result.dealBreakerFlags?.[0] ?? null,
      template_suggested: result.suggestedDateTemplate ?? null,
      shared_interests: [],
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/date/book ─────────────────────────────────────────────────────

app.post("/api/date/book", async (req: Request, res: Response) => {
  try {
    const { walletA, walletB, template, sharedInterests } = req.body as {
      walletA: Address;
      walletB: Address;
      template: string;
      sharedInterests: string[];
    };

    const [agentA, agentB] = await Promise.all([
      dbGetAgent(walletA),
      dbGetAgent(walletB),
    ]);

    if (!agentA || !agentB) {
      res.status(404).json({ error: "One or both agents not found in index" });
      return;
    }

    const toProfile = (a: typeof agentA) => ({
      wallet: a!.wallet,
      name: a!.name,
      personality: a!.personality,
      preferences: a!.preferences,
      dealBreakers: a!.deal_breakers,
      billingMode: a!.billing_mode === 0 ? "SPLIT" : "SOLO",
    });

    // 1. Resolve payer FIRST (before planDate, which calls x402 internally)
    // For dual-SOLO agents, on-chain rotation determines who pays this round.
    let payerMode: string;
    if (agentA.billing_mode === 0 && agentB.billing_mode === 0) {
      payerMode = "SPLIT";
    } else if (agentA.billing_mode === 1 && agentB.billing_mode === 0) {
      payerMode = "AGENT_A";
    } else if (agentA.billing_mode === 0 && agentB.billing_mode === 1) {
      payerMode = "AGENT_B";
    } else {
      // Both SOLO — resolve rotation on-chain before triggering payment
      const onChainPayer = await resolveNextPayer(walletA, walletB);
      payerMode = onChainPayer.toLowerCase() === walletA.toLowerCase() ? "AGENT_A" : "AGENT_B";
    }

    // 2. Plan the date (image + IPFS, using resolved payerMode)
    const plan = await agentCall("/plan-date", {
      profileA: { ...toProfile(agentA), billingMode: payerMode === "AGENT_A" ? "SOLO" : agentA.billing_mode === 0 ? "SPLIT" : "SOLO" },
      profileB: { ...toProfile(agentB), billingMode: payerMode === "AGENT_B" ? "SOLO" : agentB.billing_mode === 0 ? "SPLIT" : "SOLO" },
      template,
      sharedInterests,
    });

    // ── Inline template/payer maps (match what the contract uses) ──────────────
    const TEMPLATE_NUM: Record<string, number> = { COFFEE: 0, BEACH: 1, WORK: 2, ROOFTOP_DINNER: 3, GALLERY_WALK: 4 };
    const PAYER_NUM: Record<string, number> = { AGENT_A: 0, AGENT_B: 1, SPLIT: 2 };

    // 3. Book on-chain — agent signs with its own wallet (not deployer).
    const signerKey = (agentA.agent_private_key || undefined) as `0x${string}` | undefined;
    const dateId = await bookDate({
      agentA: walletA,
      agentB: walletB,
      template,
      payerMode,
      paymentToken: CUSD_ADDRESS,
      payerA: walletA as Address,
      payerB: walletB as Address,
      agentPrivateKey: signerKey,
    });

    // 3b. Write to DB immediately — no need to wait for the indexer.
    const scheduledAt = Math.floor(Date.now() / 1000);
    await dbUpsertDate({
      date_id: dateId.toString(),
      agent_a: walletA.toLowerCase(),
      agent_b: walletB.toLowerCase(),
      template: TEMPLATE_NUM[template] ?? 0,
      status: 1, // ACTIVE
      payer_mode: PAYER_NUM[payerMode] ?? 2,
      cost_usd: "0",
      payment_token: CUSD_ADDRESS,
      x402_tx_hash: "",
      nft_token_id: null,
      scheduled_at: scheduledAt,
      completed_at: null,
      metadata_uri: plan.metadataURI,
      image_url: plan.imageUrl,
      tweet_url: null,
      indexed_at: new Date().toISOString(),
    });
    console.log(`[server] date #${dateId} written to DB (status: ACTIVE)`);

    // 4. Mint NFT
    let nftTokenId: bigint;
    try {
      nftTokenId = await mintNFT({
        agentA: walletA,
        agentB: walletB,
        dateId,
        metadataURI: plan.metadataURI,
        agentPrivateKey: signerKey,
      });
    } catch (mintErr) {
      console.error("[server] mintNFT failed — marking date cancelled", dateId.toString(), mintErr);
      await dbUpdateDate(dateId.toString(), { status: 3 }); // CANCELLED in DB
      await completeDate(dateId, 0n).catch(() => {});
      throw mintErr;
    }

    // 5. Complete on-chain
    await completeDate(dateId, nftTokenId);

    // 5b. Write completed status to DB immediately
    const completedAt = Math.floor(Date.now() / 1000);
    await dbUpdateDate(dateId.toString(), {
      status: 2, // COMPLETED
      nft_token_id: nftTokenId.toString(),
      completed_at: completedAt,
    });
    console.log(`[server] date #${dateId} written to DB (status: COMPLETED, nft: ${nftTokenId})`);

    // 5c. Telegram intro if this is the 3rd completed date between the pair (non-fatal)
    dbCountCompletedDatesBetween(walletA.toLowerCase(), walletB.toLowerCase())
      .then(async (count) => {
        if (count === 3) {
          await sendIntroMessage(
            walletA.toLowerCase(), walletB.toLowerCase(),
            agentA.name, agentB.name,
          ).catch((e) => console.error("[server] Telegram intro failed:", e.message));
        }
      })
      .catch(() => {});

    // 6. Post tweet (non-fatal)
    let tweetUrl: string | null = null;
    try {
      const tweet = await postDateTweet({
        ipfsImageCID: plan.ipfsImageCID,
        caption: plan.tweetCaption,
      });
      tweetUrl = tweet.tweetUrl;
      await dbUpdateDate(dateId.toString(), { tweet_url: tweetUrl });
    } catch (tweetErr) {
      console.error("[server] Twitter post failed (non-fatal):", tweetErr);
    }

    res.json({
      dateId: dateId.toString(),
      nftTokenId: nftTokenId.toString(),
      metadataURI: plan.metadataURI,
      imageUrl: plan.imageUrl,
      tweetUrl,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/date/:dateId ────────────────────────────────────────────────────

app.get("/api/date/:dateId", async (req: Request, res: Response) => {
  try {
    const record = await dbGetDate(req.params.dateId);
    if (!record) {
      res.status(404).json({ error: "Date not found" });
      return;
    }
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/agents/count ────────────────────────────────────────────────────
app.get("/api/agents/count", async (_req: Request, res: Response) => {
  try {
    const agents = await dbGetAllActiveAgents();
    res.json({ count: agents.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/agents/pool-status ──────────────────────────────────────────────
// Returns how many agents are total / on dates / available so the UI can show
// meaningful context (e.g. "everyone's on a date, check back in ~30 min").
app.get("/api/agents/pool-status", async (_req: Request, res: Response) => {
  try {
    const agents = await dbGetAllActiveAgents();
    const { supabase: db } = await import("./db.js");

    // Agents on active/pending dates
    const { data: activeDates } = await db
      .from("dates").select("agent_a, agent_b").in("status", [0, 1]);
    const busyWallets = new Set<string>();
    for (const d of activeDates ?? []) {
      busyWallets.add(d.agent_a);
      busyWallets.add(d.agent_b);
    }

    // Agents currently in conversation (only count non-stale conversations, ≤90 min old)
    const ninetyMinutesAgo = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    const { data: activeConvos } = await db
      .from("conversations").select("wallet_a, wallet_b")
      .eq("passed", false)
      .gte("created_at", ninetyMinutesAgo);
    for (const c of activeConvos ?? []) {
      busyWallets.add(c.wallet_a);
      busyWallets.add(c.wallet_b);
    }

    const total = agents.length;
    const busy = agents.filter(a => busyWallets.has(a.wallet)).length;
    const available = total - busy;

    res.json({ total, busy, available, busyWallets: [...busyWallets] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/agents/:wallet ──────────────────────────────────────────────────

app.get("/api/agents/:wallet", async (req: Request, res: Response) => {
  try {
    const agent = await dbGetAgent(req.params.wallet);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json(agent);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/agents/:wallet/selfclaw ────────────────────────────────────────

app.get("/api/agents/:wallet/selfclaw", async (req: Request, res: Response) => {
  try {
    const agent = await dbGetAgent(req.params.wallet);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
    // Quick on-chain check — sync DB if now verified
    const status = await checkSelfStatus(agent.wallet as Address);
    if (status.verified && !agent.selfclaw_verified) {
      await dbUpsertAgent({ ...agent, selfclaw_verified: true, selfclaw_human_id: status.humanId ?? "" })
        .catch(() => {});
    }
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/agents/:wallet/selfclaw/retry ─────────────────────────────────
// Starts a Self verification session. Returns QR immediately; polls in background.

app.post("/api/agents/:wallet/selfclaw/retry", async (req: Request, res: Response) => {
  try {
    const agent = await dbGetAgent(req.params.wallet);
    if (!agent) { res.status(404).json({ error: "Agent not found — register your agent first." }); return; }

    if (agent.selfclaw_verified) {
      res.json({ ok: true, verified: true, humanId: agent.selfclaw_human_id }); return;
    }

    // Start session — returns immediately with QR code data URL
    const session = await startSelfSession({
      wallet: agent.wallet as Address,
      agentName: agent.name,
      agentDescription: agent.personality,
    });

    if (!session) {
      res.json({ ok: true, verified: false, started: false, qrData: null }); return;
    }

    // Persist session token so we can reference it later
    await dbUpsertAgent({
      ...agent,
      selfclaw_session_id: session.sessionToken,
      selfclaw_public_key: session.agentAddress ?? agent.selfclaw_public_key,
      indexed_at: new Date().toISOString(),
    });

    // Poll in background — writes DB when verified
    pollAndUpdateDB(
      session.sessionToken,
      agent.wallet as Address,
      agent.name,
      agent.personality,
      async (humanId) => {
        await dbUpsertAgent({ ...agent, selfclaw_verified: true, selfclaw_human_id: humanId, indexed_at: new Date().toISOString() });
      }
    ).catch((e) => console.error("[server] pollAndUpdateDB failed:", e));

    console.log(`[self] Session started for ${agent.wallet}, deepLink=${session.deepLink.slice(0, 60)}…`);
    res.json({ ok: true, verified: false, started: true, qrData: session.qrDataUrl, deepLink: session.deepLink });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});


app.get("/api/leaderboard", async (_req: Request, res: Response) => {
  try {
    const leaderboard = await dbGetLeaderboard();
    res.json({ leaderboard });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Matching scheduler ───────────────────────────────────────────────────────
// Runs a matching attempt every MATCH_INTERVAL_MS. Skips if fewer than 2 agents
// are registered — logs clearly so the operator knows why nothing happened.

const MATCH_INTERVAL_MS = Number(process.env.MATCH_INTERVAL_MS ?? 3 * 60 * 1000); // 3 min default

async function runMatchingCycle() {
  try {
    const agents = await dbGetAllActiveAgents();

    if (agents.length < 2) {
      console.log(`[matcher] Skipping — only ${agents.length} agent(s) registered (need ≥ 2 to match).`);
      return;
    }

    console.log(`[matcher] Running match cycle for ${agents.length} agents…`);

    const profiles = agents.map((a) => ({
      wallet: a.wallet,
      name: a.name,
      personality: a.personality,
      preferences: a.preferences,
      dealBreakers: a.deal_breakers,
      billingMode: a.billing_mode === 0 ? "SPLIT" : "SOLO",
    }));

    const { matches } = await agentCall("/match", { agents: profiles });

    if (!matches || matches.length === 0) {
      console.log("[matcher] No viable matches found this cycle.");
      return;
    }

    await dbSaveMatches(
      (matches as { agentA: string; agentB: string; compatibilityScore: number; sharedInterests: string[] }[]).map((m) => ({
        wallet_a: m.agentA.toLowerCase(),
        wallet_b: m.agentB.toLowerCase(),
        score: m.compatibilityScore,
        reasoning: m.sharedInterests?.join(", ") ?? "",
      }))
    );

    console.log(`[matcher] ✓ ${matches.length} match(es) found and saved.`);

    const top = await (async () => {
      for (const m of matches as { agentA: string; agentB: string; sharedInterests: string[]; viable?: boolean }[]) {
        if (m.viable === false) continue;
        const already = await dbHasActiveDateBetween(m.agentA, m.agentB);
        if (already) {
          console.log(`[matcher] Skipping ${m.agentA.slice(0, 8)}↔${m.agentB.slice(0, 8)} — active/pending date exists`);
          continue;
        }
        const chatting = await dbHasLiveConversationBetween(m.agentA, m.agentB);
        if (chatting) {
          console.log(`[matcher] Skipping ${m.agentA.slice(0, 8)}↔${m.agentB.slice(0, 8)} — conversation already in progress`);
          continue;
        }
        return m;
      }
      return null;
    })();

    if (top) {
      console.log(`[matcher] Starting conversation: ${top.agentA} ↔ ${top.agentB}`);
      try {
        const convo = await agentCall("/conversation", {
          profileA: profiles.find((p) => p.wallet === top.agentA),
          profileB: profiles.find((p) => p.wallet === top.agentB),
          simulate: true,
          callbackUrl: `${process.env.SERVER_URL ?? `http://localhost:${PORT}`}/api/conversation/message`,
        }) as { passed: boolean; suggestedDateTemplate?: string; sharedInterests?: string[] };

        console.log(`[matcher] Conversation result: passed=${convo.passed}, template=${convo.suggestedDateTemplate}`);

        // Mark conversation as done — store template + interests for human approval
        await dbMarkConversationDone(
          top.agentA,
          top.agentB,
          convo.passed,
          convo.passed ? (convo.suggestedDateTemplate ?? "COFFEE") : undefined,
          top.sharedInterests
        );

        if (convo.passed) {
          console.log(`[matcher] ✓ Conversation passed — template: ${convo.suggestedDateTemplate}. Awaiting human approval.`);
        } else {
          console.log("[matcher] Conversation did not pass — no date proposed.");
        }
      } catch (convErr) {
        console.error("[matcher] Conversation failed (non-fatal):", (convErr as Error).message);
        // Clean up any zombie conversation record so the pair can rematch next cycle
        await dbMarkConversationDone(top.agentA, top.agentB, false).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[matcher] Cycle error (non-fatal):", (err as Error).message);
  }
}

// ─── POST /telegram/webhook ───────────────────────────────────────────────────
// Telegram Bot API calls this with every update. Register the webhook URL in
// BotFather: /setwebhook → https://your-server.com/telegram/webhook

app.post("/telegram/webhook", async (req: Request, res: Response) => {
  res.sendStatus(200); // ack immediately so Telegram doesn't retry
  try {
    await handleTelegramUpdate(req.body);
  } catch (err) {
    console.error("[telegram] webhook handler error:", err);
  }
});

// ─── GET /api/contact/:wallet ─────────────────────────────────────────────────
// Returns a user's saved contact reveal (server-to-server or from frontend API route).

app.get("/api/contact/:wallet", async (req: Request, res: Response) => {
  try {
    const data = await dbGetContactReveal(req.params.wallet);
    res.json(data ?? { telegram_handle: "", email: "", phone: "" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/contact ────────────────────────────────────────────────────────
// Saves a user's contact reveal settings (telegram handle + reveal price).

app.post("/api/contact", async (req: Request, res: Response) => {
  try {
    const { wallet, telegram_handle, email, phone, reveal_price_cents } = req.body as {
      wallet: string; telegram_handle: string; email: string; phone: string; reveal_price_cents?: number;
    };
    if (!wallet?.startsWith("0x")) return void res.status(400).json({ error: "invalid wallet" });

    const existing = await dbGetContactReveal(wallet);
    await dbUpsertContactReveal({
      wallet,
      telegram_handle: telegram_handle ?? "",
      telegram_chat_id: existing?.telegram_chat_id ?? "",
      email: email ?? "",
      phone: phone ?? "",
      reveal_price_cents: reveal_price_cents ?? existing?.reveal_price_cents ?? 0,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/contact/eligibility ─────────────────────────────────────────────
// Check whether myWallet can see theirWallet's contact details.
// Returns: { eligible, reason: "three_dates"|"paid"|"none", theirPriceCents }

app.get("/api/contact/eligibility", async (req: Request, res: Response) => {
  try {
    const { myWallet, theirWallet } = req.query as { myWallet: string; theirWallet: string };
    if (!myWallet || !theirWallet) return void res.status(400).json({ error: "myWallet and theirWallet required" });

    const [dateCount, theirContact] = await Promise.all([
      dbCountCompletedDatesBetween(myWallet, theirWallet),
      dbGetContactReveal(theirWallet),
    ]);

    if (dateCount >= 3) {
      return void res.json({ eligible: true, reason: "three_dates", theirPriceCents: 0 });
    }

    const priceCents = theirContact?.reveal_price_cents ?? 0;
    res.json({
      eligible: false,
      reason: "none",
      datesCompleted: dateCount,
      datesNeeded: 3 - dateCount,
      theirPriceCents: priceCents,
      theirHasTelegram: !!theirContact?.telegram_handle,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/contact/reveal ─────────────────────────────────────────────────
// After 3+ completed dates, return both parties' contact details.

app.post("/api/contact/reveal", async (req: Request, res: Response) => {
  try {
    const { myWallet, theirWallet } = req.body as { myWallet: string; theirWallet: string };

    const dateCount = await dbCountCompletedDatesBetween(myWallet, theirWallet);
    if (dateCount < 3) {
      return void res.status(403).json({ error: `Need 3 completed dates (have ${dateCount})` });
    }

    const [mine, theirs] = await Promise.all([
      dbGetContactReveal(myWallet),
      dbGetContactReveal(theirWallet),
    ]);

    res.json({
      mine:   { telegram: mine?.telegram_handle ?? null,   email: mine?.email ?? null   },
      theirs: { telegram: theirs?.telegram_handle ?? null, email: theirs?.email ?? null },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/contact/pay-reveal ─────────────────────────────────────────────
// Buyer pays the price set by the target; server verifies the tx and returns contact.
// myWallet = buyer, theirWallet = target, txHash = on-chain payment proof.

app.post("/api/contact/pay-reveal", async (req: Request, res: Response) => {
  try {
    const { myWallet, theirWallet, txHash } = req.body as {
      myWallet: string; theirWallet: string; txHash: string;
    };

    const theirContact = await dbGetContactReveal(theirWallet);
    if (!theirContact?.telegram_handle) {
      return void res.status(404).json({ error: "Target has not set contact details" });
    }

    const priceCents = theirContact.reveal_price_cents ?? 0;
    if (priceCents === 0) {
      return void res.status(400).json({ error: "Target contact is free after 3 dates — no payment needed" });
    }

    // Verify payment on-chain: tx must be to theirWallet and value ≥ price
    const { createPublicClient, http, parseEther } = await import("viem");
    const { celo } = await import("viem/chains");
    const client = createPublicClient({ chain: celo, transport: http() });
    const tx = await client.getTransaction({ hash: txHash as `0x${string}` });

    if (tx.to?.toLowerCase() !== theirWallet.toLowerCase()) {
      return void res.status(402).json({ error: "Payment not sent to correct address" });
    }

    // Convert price (cents) to CELO at a fixed rate: $1 = 1 CELO (adjust via env)
    const celoPerDollar = Number(process.env.CELO_PER_USD ?? 1);
    const requiredCelo  = parseEther(String((priceCents / 100) * celoPerDollar));
    if (tx.value < requiredCelo) {
      return void res.status(402).json({ error: "Payment amount too low" });
    }

    res.json({
      theirs: { telegram: theirContact.telegram_handle, email: theirContact.email ?? null },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[server] Lemon backend listening on port ${PORT}`);
  console.log(`[matcher] Auto-match scheduler running every ${MATCH_INTERVAL_MS / 1000}s`);

  // Run once immediately at boot, then on interval
  setTimeout(runMatchingCycle, 10_000); // 10s after boot (let indexer settle)
  setInterval(runMatchingCycle, MATCH_INTERVAL_MS);
});
