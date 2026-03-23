/**
 * server/src/index.ts
 *
 * Express backend for Lemon. Exposes REST endpoints used by the frontend
 * and orchestrates the full date lifecycle.
 *
 * Read path  → Supabase (fast, indexed)
 * Write path → on-chain (viem) then POST …/sync-profile or indexer → Supabase
 *
 *  POST /api/agents/register          — notify server of new on-chain registration
 *  POST /api/agents/:wallet/sync-profile — chain → Supabase after updateProfile
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
  collectPayment,
  generateAgentWallet,
  setOperatorKey,
  fundAgentWallet,
  publicClient,
} from "./onchain.js";
import { postDateTweet } from "./twitter.js";
import { startSelfSession, pollAndUpdateDB } from "./selfclaw.js";
// indexer.ts is kept for reference but not used — DB is written directly after tx receipt
import { handleTelegramUpdate, sendIntroMessage, sendRematchSuggestion } from "./telegram.js";
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
  supabase,
} from "./db.js";
import { isAddress, type Address, type Hash } from "viem";
import { requireInternalSecret, warnIfInternalSecretUnset } from "./internalAuth.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const AGENT_URL = process.env.AGENT_URL ?? `http://localhost:${process.env.AGENT_PORT ?? 5000}`;
// Railway/Render/Fly inject PORT; local dev often uses SERVER_PORT
const PORT = Number(process.env.SERVER_PORT || process.env.PORT || 4000);

const CUSD_ADDRESS = (
  process.env.NETWORK === "mainnet"
    ? "0x765DE816845861e75A25fCA122bb6898B8B1282a"
    : "0xdE9e4C3ce781b4bA68120d6261cbad65ce0aB00b" // Celo Sepolia testnet
) as Address;

const DATE_COST_CENTS = Number(process.env.DATE_COST_CENTS ?? 100);
const DATE_COST_USD_STR = (DATE_COST_CENTS / 100).toFixed(2); // e.g. "1.00"

const VALID_DATE_TEMPLATES = new Set([
  "COFFEE",
  "BEACH",
  "WORK",
  "ROOFTOP_DINNER",
  "GALLERY_WALK",
]);

function agentHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const s = process.env.LEMON_INTERNAL_SECRET;
  if (s) h["X-Lemon-Internal-Secret"] = s;
  return h;
}

function agentCall(path: string, body: unknown) {
  return axios.post(`${AGENT_URL}${path}`, body, { headers: agentHeaders() }).then((r) => r.data).catch((e) => {
    const detail = e?.response?.data?.error ?? e?.response?.data ?? e?.message;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  });
}

/** Prevents overlapping matcher cycles (interval + manual trigger). */
let matchingCycleInFlight = false;

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
      // Fund first, then ERC-8004 registration needs the gas
      try {
        await fundAgentWallet(agentWallet.address);
      } catch (e) {
        console.error("[server] fundAgentWallet failed (non-fatal):", (e as Error).message);
      }
    }

    // ── 3. ERC-8004 registration (best-effort, 10s timeout) ──────────────────
    const erc8004AgentId = await Promise.race([
      registerERC8004Agent({
        wallet: raw.wallet,
        name: raw.name,
        agentURI: raw.agentURI,
        personality: raw.personality,
        registeredAt: Number(raw.registeredAt),
        agentPrivateKey: agentPrivateKey,
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

app.post("/api/match/run", async (req: Request, res: Response) => {
  if (!requireInternalSecret(req, res)) return;
  // Respond immediately so the button doesn't time out — cycle runs in background
  res.json({ ok: true, message: "Matching cycle started" });
  runMatchingCycleGuarded().catch((err) =>
    console.error("[server] /api/match/run cycle error:", (err as Error).message)
  );
});


// ─── POST /api/conversation/message ──────────────────────────────────────────
// Called by the agent service after each message — saves to DB for live polling

app.post("/api/conversation/message", async (req: Request, res: Response) => {
  if (!requireInternalSecret(req, res)) return;
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

// How long with no new messages before we consider a conversation stale/dead
const CONVO_STALE_MS = 5 * 60 * 1000; // 5 minutes

app.get("/api/conversation/live", async (req: Request, res: Response) => {
  try {
    const { wallet } = req.query as { wallet: string };
    if (!wallet) { res.status(400).json({ error: "wallet required" }); return; }
    const convo = await dbGetLiveConversation(wallet);
    if (!convo) { res.json(null); return; }

    const t = (convo.transcript as Record<string, unknown>) ?? {};
    const msgs = (t.messages ?? []) as { timestamp?: number }[];
    const lastMsgAt = msgs.length > 0 ? (msgs[msgs.length - 1].timestamp ?? 0) : 0;

    // A non-passed conversation with no new message for CONVO_STALE_MS is zombie — auto-expire it
    // so the matcher can restart it next cycle and the frontend stops showing "typing"
    const isStale = !convo.passed && msgs.length > 0 && lastMsgAt > 0 && Date.now() - lastMsgAt > CONVO_STALE_MS;
    if (isStale) {
      console.warn(`[server] Stale conversation detected (last msg ${Math.round((Date.now() - lastMsgAt) / 60000)}m ago) — auto-expiring`);
      await supabase.from("conversations").update({ passed: true }).eq("id", convo.id);
    }

    res.json({
      ...convo,
      passed: isStale ? true : convo.passed,
      isStale,
      lastMessageAt: lastMsgAt || null,
      bookingError: (t.bookingError as string) ?? null,
      bookingPending: (t.bookingPending as boolean) ?? false,
      bookingComplete: (t.bookingComplete as boolean) ?? false,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/conversation/reset ────────────────────────────────────────────
// Emergency: mark all stuck (passed=false) conversations for a wallet as done.
// Call this when a conversation is frozen and agents are permanently blocked.

app.post("/api/conversation/reset", async (req: Request, res: Response) => {
  if (!requireInternalSecret(req, res)) return;
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
  if (!requireInternalSecret(req, res)) return;
  try {
    const { walletA, walletB } = req.body as { walletA: Address; walletB: Address };
    if (!walletA || !walletB || !isAddress(walletA) || !isAddress(walletB)) {
      res.status(400).json({ error: "walletA and walletB must be valid 0x addresses" });
      return;
    }

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
      avatarUri: a!.avatar_uri,
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

// ─── performDateBooking ───────────────────────────────────────────────────────
// Shared logic called by both runMatchingCycle (auto) and the retry endpoint.

async function performDateBooking(
  walletA: Address,
  walletB: Address,
  template: string,
  sharedInterests: string[]
): Promise<{ dateId: string; nftTokenId: string; metadataURI: string; imageUrl: string; tweetUrl: string | null }> {
  if (!VALID_DATE_TEMPLATES.has(template)) {
    throw new Error(`Invalid template "${template}". Expected one of: ${[...VALID_DATE_TEMPLATES].join(", ")}`);
  }
  const [agentA, agentB] = await Promise.all([dbGetAgent(walletA), dbGetAgent(walletB)]);
  if (!agentA || !agentB) throw new Error("One or both agents not found in DB");

  const toProfile = (a: typeof agentA) => ({
    wallet: a!.wallet, name: a!.name, personality: a!.personality,
    preferences: a!.preferences, dealBreakers: a!.deal_breakers,
    billingMode: a!.billing_mode === 0 ? "SPLIT" : "SOLO",
    avatarUri: a!.avatar_uri,
  });

  // 1. Resolve payer
  let payerMode: string;
  if (agentA.billing_mode === 0 && agentB.billing_mode === 0) payerMode = "SPLIT";
  else if (agentA.billing_mode === 1 && agentB.billing_mode === 0) payerMode = "AGENT_A";
  else if (agentA.billing_mode === 0 && agentB.billing_mode === 1) payerMode = "AGENT_B";
  else {
    const onChainPayer = await resolveNextPayer(walletA, walletB);
    payerMode = onChainPayer.toLowerCase() === walletA.toLowerCase() ? "AGENT_A" : "AGENT_B";
  }

  // 2. Collect cUSD payment (direct on-chain transfer from agent wallets → treasury)
  const agentAKey = agentA.agent_private_key as `0x${string}` | undefined;
  const agentBKey = agentB.agent_private_key as `0x${string}` | undefined;
  if (!agentAKey || !agentBKey) throw new Error("Agent private keys not found — cannot process payment");

  const treasuryAddress = (
    process.env.LEMON_TREASURY_ADDRESS ?? process.env.DEPLOYER_ADDRESS ?? ""
  ) as `0x${string}`;

  if (!treasuryAddress) throw new Error("LEMON_TREASURY_ADDRESS is not set");

  await collectPayment({
    payerMode: payerMode as "AGENT_A" | "AGENT_B" | "SPLIT",
    agentAPrivateKey: agentAKey,
    agentBPrivateKey: agentBKey,
    agentAName: agentA.name,
    agentBName: agentB.name,
    treasuryAddress,
    cUSDAddress: CUSD_ADDRESS,
    amountUSD: DATE_COST_USD_STR,
  });

  // 3. Plan the date (image + metadata — payment already done)
  let plan: Awaited<ReturnType<typeof agentCall>>;
  try {
    plan = await agentCall("/plan-date", {
      profileA: { ...toProfile(agentA), billingMode: payerMode === "AGENT_A" ? "SOLO" : agentA.billing_mode === 0 ? "SPLIT" : "SOLO" },
      profileB: { ...toProfile(agentB), billingMode: payerMode === "AGENT_B" ? "SOLO" : agentB.billing_mode === 0 ? "SPLIT" : "SOLO" },
      template,
      sharedInterests,
      chainResolvedPayer: payerMode as "AGENT_A" | "AGENT_B" | "SPLIT",
    });
  } catch (e) {
    throw new Error(`Date planning failed: ${(e as Error).message}`);
  }

  const TEMPLATE_NUM: Record<string, number> = { COFFEE: 0, BEACH: 1, WORK: 2, ROOFTOP_DINNER: 3, GALLERY_WALK: 4 };
  const PAYER_NUM: Record<string, number> = { AGENT_A: 0, AGENT_B: 1, SPLIT: 2 };

  // 4. Book on-chain
  const signerKey = agentAKey;
  let dateId: bigint;
  try {
    dateId = await bookDate({
      agentA: walletA, agentB: walletB, template, payerMode,
      paymentToken: CUSD_ADDRESS,
      payerA: walletA as Address, payerB: walletB as Address,
      agentPrivateKey: signerKey,
    });
  } catch (e) {
    throw new Error(`On-chain booking failed: ${(e as Error).message}`);
  }

  const scheduledAt = Math.floor(Date.now() / 1000);
  await dbUpsertDate({
    date_id: dateId.toString(), agent_a: walletA.toLowerCase(), agent_b: walletB.toLowerCase(),
    template: TEMPLATE_NUM[template] ?? 0, status: 1, payer_mode: PAYER_NUM[payerMode] ?? 2,
    cost_usd: "0", payment_token: CUSD_ADDRESS, x402_tx_hash: "", nft_token_id: null,
    scheduled_at: scheduledAt, completed_at: null, metadata_uri: plan.metadataURI,
    image_url: plan.imageUrl, tweet_url: null, indexed_at: new Date().toISOString(),
  });
  console.log(`[server] date #${dateId} written to DB (status: ACTIVE)`);

  // 5. Mint NFT
  let nftTokenId: bigint;
  try {
    nftTokenId = await mintNFT({
      agentA: walletA, agentB: walletB, dateId,
      metadataURI: plan.metadataURI, agentPrivateKey: signerKey,
    });
  } catch (mintErr) {
    console.error("[server] mintNFT failed — marking date cancelled", dateId.toString(), mintErr);
    await dbUpdateDate(dateId.toString(), { status: 3 });
    await completeDate(dateId, 0n).catch(() => {});
    throw mintErr;
  }

  // 6. Complete on-chain + DB
  await completeDate(dateId, nftTokenId);
  const completedAt = Math.floor(Date.now() / 1000);
  await dbUpdateDate(dateId.toString(), {
    status: 2, nft_token_id: nftTokenId.toString(), completed_at: completedAt,
  });
  console.log(`[server] date #${dateId} COMPLETED (nft: ${nftTokenId})`);

  // 7. Telegram notifications (non-fatal)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.SERVER_URL ?? "https://lemon.dating";
  // Rematch suggestion after every date
  sendRematchSuggestion(walletA.toLowerCase(), walletB.toLowerCase(), agentA.name, agentB.name, template, appUrl)
    .catch(() => {});
  // Contact reveal intro after 3rd date
  dbCountCompletedDatesBetween(walletA.toLowerCase(), walletB.toLowerCase())
    .then(async (count) => {
      if (count === 3) await sendIntroMessage(walletA.toLowerCase(), walletB.toLowerCase(), agentA.name, agentB.name).catch(() => {});
    }).catch(() => {});

  // 8. Tweet (non-fatal)
  let tweetUrl: string | null = null;
  try {
    const tweet = await postDateTweet({ ipfsImageCID: plan.ipfsImageCID, caption: plan.tweetCaption });
    tweetUrl = tweet.tweetUrl;
    await dbUpdateDate(dateId.toString(), { tweet_url: tweetUrl });
  } catch { /* non-fatal */ }

  return { dateId: dateId.toString(), nftTokenId: nftTokenId.toString(), metadataURI: plan.metadataURI, imageUrl: plan.imageUrl, tweetUrl };
}

// ─── POST /api/date/book ─────────────────────────────────────────────────────
// Kept for backwards compat but auto-booking now happens in runMatchingCycle.

app.post("/api/date/book", async (req: Request, res: Response) => {
  if (!requireInternalSecret(req, res)) return;
  try {
    const { walletA, walletB, template, sharedInterests } = req.body as {
      walletA: Address; walletB: Address; template: string; sharedInterests: string[];
    };
    if (!walletA || !walletB || !isAddress(walletA) || !isAddress(walletB)) {
      res.status(400).json({ error: "walletA and walletB must be valid 0x addresses" });
      return;
    }
    if (!template || !VALID_DATE_TEMPLATES.has(template)) {
      res.status(400).json({ error: `Invalid template. Must be one of: ${[...VALID_DATE_TEMPLATES].join(", ")}` });
      return;
    }
    const result = await performDateBooking(walletA, walletB, template, sharedInterests ?? []);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/date/retry ─────────────────────────────────────────────────────
// Re-attempts booking for a passed conversation that failed to auto-book.

app.post("/api/date/retry", async (req: Request, res: Response) => {
  try {
    const { walletA, walletB } = req.body as { walletA: Address; walletB: Address };
    if (!walletA || !isAddress(walletA)) {
      res.status(400).json({ error: "walletA must be a valid 0x address" });
      return;
    }
    const convo = await dbGetLiveConversation(walletA);
    if (!convo || !convo.passed || !convo.template_suggested) {
      res.status(400).json({ error: "No passed conversation found to retry booking for." });
      return;
    }
    const left = convo.wallet_a.toLowerCase();
    const right = convo.wallet_b.toLowerCase();
    if (walletB) {
      if (!isAddress(walletB)) {
        res.status(400).json({ error: "walletB must be a valid 0x address" });
        return;
      }
      const wb = walletB.toLowerCase();
      if (wb !== left && wb !== right) {
        res.status(400).json({ error: "walletB is not part of this conversation" });
        return;
      }
    }
    const bookA = convo.wallet_a as Address;
    const bookB = convo.wallet_b as Address;
    // Clear any previous booking error from transcript
    const transcript = (convo.transcript as Record<string, unknown>) ?? {};
    await supabase.from("conversations").update({
      transcript: { ...transcript, bookingError: null, bookingPending: true },
    }).eq("id", convo.id);

    // Run booking in background — don't block the HTTP response (canonical pair order from DB)
    performDateBooking(bookA, bookB, convo.template_suggested, convo.shared_interests ?? [])
      .then(async () => {
        await supabase.from("conversations").update({
          transcript: { ...transcript, bookingError: null, bookingPending: false, bookingComplete: true },
        }).eq("id", convo.id);
      })
      .catch(async (err) => {
        const msg = (err as Error).message;
        console.error("[server] Retry booking failed:", msg);
        await supabase.from("conversations").update({
          transcript: { ...transcript, bookingError: msg, bookingPending: false },
        }).eq("id", convo.id);
      });

    res.json({ ok: true, message: "Booking retry started" });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/date/rematch ───────────────────────────────────────────────────
// Human chooses to date the same agent again — starts a fresh conversation.

app.post("/api/date/rematch", async (req: Request, res: Response) => {
  try {
    const { walletA, walletB } = req.body as { walletA: Address; walletB: Address };
    if (!walletA || !isAddress(walletA) || !walletB || !isAddress(walletB)) {
      res.status(400).json({ error: "walletA and walletB must be valid 0x addresses" });
      return;
    }

    const [agentA, agentB] = await Promise.all([dbGetAgent(walletA), dbGetAgent(walletB)]);
    if (!agentA || !agentB) {
      res.status(404).json({ error: "One or both agents not found" });
      return;
    }

    const toProfile = (a: typeof agentA) => ({
      wallet: a!.wallet, name: a!.name, personality: a!.personality,
      preferences: a!.preferences, dealBreakers: a!.deal_breakers,
      billingMode: a!.billing_mode === 0 ? "SPLIT" : "SOLO",
      avatarUri: a!.avatar_uri,
    });

    // Start fresh conversation in background
    res.json({ ok: true, message: "Rematch started — agents are having a new conversation" });

    agentCall("/conversation", {
      profileA: toProfile(agentA),
      profileB: toProfile(agentB),
      simulate: true,
      callbackUrl: `${process.env.SERVER_URL ?? `http://localhost:${PORT}`}/api/conversation/message`,
    }).then(async (result: { passed: boolean; suggestedDateTemplate?: string; sharedInterests?: string[] }) => {
      await dbMarkConversationDone(
        walletA.toLowerCase(), walletB.toLowerCase(),
        result.passed,
        result.passed ? (result.suggestedDateTemplate ?? "COFFEE") : undefined,
        result.sharedInterests ?? []
      );
      console.log(`[rematch] Conversation complete: passed=${result.passed}`);
    }).catch((e: Error) => {
      console.error("[rematch] Conversation failed:", e.message);
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

    // Total completed dates (all-time) — used to show activity even when no active dates
    const { count: totalDates } = await db
      .from("dates").select("*", { count: "exact", head: true }).eq("status", 2);

    const total = agents.length;
    const verified = agents.filter(a => a.selfclaw_verified).length;
    const busy = agents.filter(a => busyWallets.has(a.wallet)).length;
    const available = total - busy;

    res.json({ total, verified, busy, available, totalDates: totalDates ?? 0, busyWallets: [...busyWallets] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/agents/:wallet/sync-profile ────────────────────────────────────
// After updateProfile on-chain: re-read contract → Supabase so matcher uses fresh prefs.
// Safe: data comes from chain, not the client body. Preserves selfclaw / agent_wallet keys.

app.post("/api/agents/:wallet/sync-profile", async (req: Request, res: Response) => {
  try {
    const raw = req.params.wallet;
    if (!raw || !isAddress(raw)) {
      res.status(400).json({ error: "Invalid wallet address" });
      return;
    }
    const wallet = raw as Address;
    const { syncAgentFromChain } = await import("./syncAgentFromChain.js");

    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        await syncAgentFromChain(wallet);
        res.json({ ok: true });
        return;
      } catch (e) {
        lastErr = e as Error;
        console.warn(`[server] /api/agents/.../sync-profile attempt ${attempt}/4: ${lastErr.message}`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    res.status(500).json({ error: lastErr?.message ?? "Could not sync profile from chain" });
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

// ─── POST /api/agents/:wallet/register-identity ──────────────────────────────
// Retries ERC-8004 registration if the initial attempt failed (id is "0" or missing)

app.post("/api/agents/:wallet/register-identity", async (req: Request, res: Response) => {
  try {
    const agent = await dbGetAgent(req.params.wallet);
    if (!agent) { res.status(404).json({ error: "Agent not found — register your agent first." }); return; }

    if (agent.erc8004_agent_id && agent.erc8004_agent_id !== "0") {
      res.json({ ok: true, erc8004AgentId: agent.erc8004_agent_id, alreadyRegistered: true });
      return;
    }

    if (!agent.agent_private_key) {
      res.status(400).json({ error: "Agent private key not found — cannot register identity." });
      return;
    }

    // Fund the agent wallet if it has no gas (happens when initial funding tx
    // hadn't confirmed yet at the time the first ERC-8004 attempt ran)
    const agentAddress = (await import("viem/accounts"))
      .privateKeyToAccount(agent.agent_private_key as `0x${string}`).address;
    const balance = await publicClient.getBalance({ address: agentAddress });
    const MIN_GAS_BALANCE = BigInt("80000000000000000"); // 0.08 CELO — enough for ERC-8004 + headroom
    if (balance < MIN_GAS_BALANCE) {
      console.log(`[server] Agent wallet ${agentAddress} balance ${balance} < 0.08 CELO — topping up…`);
      await fundAgentWallet(agentAddress);
      console.log(`[server] Agent wallet topped up to 0.1 CELO`);
    }

    const agentId = await registerERC8004Agent({
      wallet: agent.wallet,
      name: agent.name,
      agentURI: `https://lemon.dating/agents/${agent.wallet}`,
      personality: agent.personality,
      registeredAt: Date.now(),
      agentPrivateKey: agent.agent_private_key,
    });

    await dbUpsertAgent({ ...agent, erc8004_agent_id: agentId.toString() });
    res.json({ ok: true, erc8004AgentId: agentId.toString() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/agents/:wallet/selfclaw ────────────────────────────────────────

app.get("/api/agents/:wallet/selfclaw", async (req: Request, res: Response) => {
  try {
    const agent = await dbGetAgent(req.params.wallet);
    if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
    res.json({ verified: agent.selfclaw_verified ?? false, humanId: agent.selfclaw_human_id ?? null });
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

    // Start session with Self Agent ID API
    let session;
    try {
      session = await startSelfSession({
        wallet: agent.wallet as Address,
        agentName: agent.name,
        agentDescription: agent.personality,
      });
    } catch (sessionErr) {
      const msg = (sessionErr as Error).message;
      console.error("[server] startSelfSession failed:", msg);
      res.status(500).json({ error: msg }); return;
    }

    // Persist session token
    await dbUpsertAgent({
      ...agent,
      selfclaw_session_id: session.sessionToken,
      indexed_at: new Date().toISOString(),
    });

    // Poll in background — writes DB when verified
    pollAndUpdateDB(
      session.sessionToken,
      agent.wallet as Address,
      agent.name,
      agent.personality,
      async (humanId) => {
        const fresh = await dbGetAgent(agent.wallet);
        if (fresh) await dbUpsertAgent({ ...fresh, selfclaw_verified: true, selfclaw_human_id: humanId, indexed_at: new Date().toISOString() });
      }
    ).catch((e) => console.error("[server] pollAndUpdateDB failed:", e));

    console.log(`[self-agent-id] Session started for ${agent.wallet}, deepLink=${session.deepLink.slice(0, 60)}…`);
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

// ─── Zombie conversation cleanup ─────────────────────────────────────────────
// Runs every 5 minutes. Any conversation with passed=false and whose last
// transcript message is older than CONVO_STALE_MS is expired so that:
//   - the frontend stops showing the typing indicator
//   - the matcher can re-queue the pair next cycle

async function cleanupZombieConversations() {
  try {
    const { data: stuck } = await supabase
      .from("conversations")
      .select("id, transcript")
      .eq("passed", false);

    if (!stuck?.length) return;

    const staleIds: number[] = [];
    for (const row of stuck) {
      const msgs = ((row.transcript as Record<string,unknown>)?.messages ?? []) as { timestamp?: number }[];
      if (msgs.length === 0) continue; // hasn't started yet — leave it
      const lastTs = msgs[msgs.length - 1]?.timestamp ?? 0;
      if (lastTs > 0 && Date.now() - lastTs > CONVO_STALE_MS) {
        staleIds.push(row.id as number);
      }
    }

    if (staleIds.length > 0) {
      await supabase.from("conversations").update({ passed: true }).in("id", staleIds);
      console.log(`[cleanup] Expired ${staleIds.length} zombie conversation(s)`);
    }
  } catch (e) {
    console.error("[cleanup] Zombie cleanup error:", (e as Error).message);
  }
}

setInterval(cleanupZombieConversations, 5 * 60 * 1000);

// ─── Matching scheduler ───────────────────────────────────────────────────────
// Runs a matching attempt every MATCH_INTERVAL_MS. Skips if fewer than 2 agents
// are registered — logs clearly so the operator knows why nothing happened.

const MATCH_INTERVAL_MS = Number(process.env.MATCH_INTERVAL_MS ?? 3 * 60 * 1000); // 3 min default

async function runMatchingCycleGuarded() {
  if (matchingCycleInFlight) {
    console.log("[matcher] Skipping overlapping match cycle");
    return;
  }
  matchingCycleInFlight = true;
  try {
    await runMatchingCycle();
  } finally {
    matchingCycleInFlight = false;
  }
}

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
      avatarUri: a.avatar_uri,
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
        const profileA = profiles.find((p) => p.wallet.toLowerCase() === top.agentA.toLowerCase());
        const profileB = profiles.find((p) => p.wallet.toLowerCase() === top.agentB.toLowerCase());
        if (!profileA || !profileB) {
          console.error(`[matcher] Profile lookup failed — agentA=${top.agentA}, agentB=${top.agentB}`);
          return;
        }
        const convo = await agentCall("/conversation", {
          profileA,
          profileB,
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
          const template = convo.suggestedDateTemplate ?? "COFFEE";
          console.log(`[matcher] ✓ Conversation passed — auto-booking (template: ${template})…`);

          // Mark as pending so the dashboard shows the spinner immediately
          const convoRow = await dbGetLiveConversation(top.agentA);
          if (convoRow) {
            const existing = (convoRow.transcript as Record<string, unknown>) ?? {};
            await supabase.from("conversations").update({
              transcript: { ...existing, bookingPending: true, bookingError: null, bookingComplete: false },
            }).eq("id", convoRow.id);
          }

          performDateBooking(
            top.agentA as Address,
            top.agentB as Address,
            template,
            top.sharedInterests ?? []
          ).then(async () => {
            console.log(`[matcher] ✓ Auto-booking complete for ${top.agentA.slice(0, 8)}↔${top.agentB.slice(0, 8)}`);
            const row = await dbGetLiveConversation(top.agentA);
            if (row) {
              const t = (row.transcript as Record<string, unknown>) ?? {};
              await supabase.from("conversations").update({
                transcript: { ...t, bookingPending: false, bookingComplete: true, bookingError: null },
              }).eq("id", row.id);
            }
          }).catch(async (bookErr) => {
            const msg = (bookErr as Error).message;
            console.error("[matcher] Auto-booking failed (user can retry):", msg);
            const row = await dbGetLiveConversation(top.agentA);
            if (row) {
              const t = (row.transcript as Record<string, unknown>) ?? {};
              await supabase.from("conversations").update({
                transcript: { ...t, bookingPending: false, bookingError: msg },
              }).eq("id", row.id);
            }
          });
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
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected) {
    const got = req.headers["x-telegram-bot-api-secret-token"];
    const token = Array.isArray(got) ? got[0] : got;
    if (token !== expected) {
      res.status(403).send("forbidden");
      return;
    }
  }
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
    const { parseEther } = await import("viem");
    const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });

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

// ─── GET /api/tweets ──────────────────────────────────────────────────────────
// Returns the 20 most recent completed dates that have a tweet posted.
// Used by the Gallery page to display the live tweet feed.

app.get("/api/tweets", async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from("dates")
      .select("tweet_url, image_url, metadata_uri, agent_a, agent_b, completed_at, template")
      .not("tweet_url", "is", null)
      .eq("status", 2)
      .order("completed_at", { ascending: false })
      .limit(20);

    if (error) throw new Error(error.message);

    // Enrich with agent names where possible (best-effort — skip on error)
    const wallets = [...new Set((data ?? []).flatMap((d) => [d.agent_a, d.agent_b]))];
    let nameMap: Record<string, string> = {};
    if (wallets.length > 0) {
      const { data: agents } = await supabase.from("agents").select("wallet, name").in("wallet", wallets);
      for (const a of agents ?? []) nameMap[a.wallet] = a.name;
    }

    const tweets = (data ?? []).map((d) => ({
      tweetUrl: d.tweet_url,
      imageUrl: d.image_url,
      metadataUri: d.metadata_uri,
      agentA: d.agent_a,
      agentB: d.agent_b,
      nameA: nameMap[d.agent_a] ?? d.agent_a?.slice(0, 8),
      nameB: nameMap[d.agent_b] ?? d.agent_b?.slice(0, 8),
      completedAt: d.completed_at,
      template: d.template,
    }));

    res.json({ tweets });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  warnIfInternalSecretUnset();
  console.log(`[server] Lemon backend listening on port ${PORT}`);
  console.log(`[matcher] Auto-match scheduler running every ${MATCH_INTERVAL_MS / 1000}s`);

  // Run once immediately at boot, then on interval
  setTimeout(runMatchingCycleGuarded, 10_000); // 10s after boot (let indexer settle)
  setInterval(runMatchingCycleGuarded, MATCH_INTERVAL_MS);
});
