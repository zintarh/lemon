/**
 * indexer.ts
 *
 * Listens to on-chain events from LemonAgent, LemonDate, and LemonNFT
 * and writes them into Supabase. Call startIndexer() once at server boot.
 *
 * Events handled:
 *  LemonAgent  — AgentRegistered, AgentUpdated, AgentDeactivated
 *  LemonDate   — DateBooked, DateCompleted, DateCancelled, PaymentRecorded
 *  LemonNFT    — DateMemoryMinted
 */

import { parseAbi, type Address } from "viem";
import { publicClient, getAgentProfile } from "./onchain.js";
import { dbUpsertAgent, dbUpsertDate, dbUpdateDate, dbGetDate, dbGetAgent, dbCountCompletedDatesBetween, type AgentRow, type DateRow } from "./db.js";
import { sendIntroMessage } from "./telegram.js";

// ─── ABIs (events only) ───────────────────────────────────────────────────────

const agentEventAbi = parseAbi([
  "event AgentRegistered(address indexed wallet, string name, uint8 billingMode)",
  "event AgentUpdated(address indexed wallet)",
  "event AgentDeactivated(address indexed wallet)",
]);

const dateEventAbi = parseAbi([
  "event DateBooked(uint256 indexed dateId, address agentA, address agentB, uint8 template, uint8 payerMode)",
  "event DateCompleted(uint256 indexed dateId, uint256 nftTokenId)",
  "event DateCancelled(uint256 indexed dateId)",
  "event PaymentReceived(uint256 indexed dateId, address payerA, address payerB, uint256 tokenAmount)",
]);

const nftEventAbi = parseAbi([
  "event DateMemoryMinted(uint256 indexed tokenId, uint256 indexed dateId, address agentA, address agentB, string tokenURI)",
]);

async function fetchAndUpsertAgent(wallet: Address): Promise<void> {
  try {
    const profile = await getAgentProfile(wallet);

    // Preserve existing selfclaw/agent_wallet fields if already set in DB
    const existing = await dbGetAgent(wallet);
    const row: AgentRow = {
      wallet: profile.wallet.toLowerCase(),
      name: profile.name,
      avatar_uri: profile.avatarURI,
      agent_uri: profile.agentURI,
      personality: profile.personality,
      preferences: profile.preferences,
      deal_breakers: profile.dealBreakers,
      billing_mode: profile.billingMode,
      erc8004_agent_id: profile.erc8004AgentId.toString(),
      selfclaw_public_key: existing?.selfclaw_public_key ?? "",
      selfclaw_private_key: existing?.selfclaw_private_key ?? "",
      selfclaw_session_id: existing?.selfclaw_session_id ?? "",
      selfclaw_human_id: existing?.selfclaw_human_id ?? "",
      selfclaw_verified: existing?.selfclaw_verified ?? false,
      agent_wallet: existing?.agent_wallet ?? "",
      agent_private_key: existing?.agent_private_key ?? "",
      registered_at: Number(profile.registeredAt),
      active: profile.active,
      indexed_at: new Date().toISOString(),
    };

    await dbUpsertAgent(row);
    console.log(`[indexer] agent upserted: ${wallet}`);
  } catch (err) {
    console.error(`[indexer] fetchAndUpsertAgent failed for ${wallet}:`, err);
  }
}

// ─── Telegram intro trigger ───────────────────────────────────────────────────

async function checkAndSendTelegramIntro(dateId: string): Promise<void> {
  const date = await dbGetDate(dateId);
  if (!date) return;

  const completedCount = await dbCountCompletedDatesBetween(date.agent_a, date.agent_b);

  // Fire exactly on the 3rd completed date to avoid duplicate messages
  if (completedCount !== 3) return;

  const [agentA, agentB] = await Promise.all([
    dbGetAgent(date.agent_a),
    dbGetAgent(date.agent_b),
  ]);

  await sendIntroMessage(
    date.agent_a,
    date.agent_b,
    agentA?.name ?? date.agent_a.slice(0, 8),
    agentB?.name ?? date.agent_b.slice(0, 8),
  );
}

// ─── Start ────────────────────────────────────────────────────────────────────

export function startIndexer(): void {
  const agentAddress = process.env.LEMON_AGENT_CONTRACT as Address;
  const dateAddress = process.env.LEMON_DATE_CONTRACT as Address;
  const nftAddress = process.env.LEMON_NFT_CONTRACT as Address;

  if (!agentAddress || agentAddress === "0x...") {
    console.warn("[indexer] Contract addresses not set — skipping indexer.");
    return;
  }

  console.log("[indexer] Starting contract event watchers…");

  // ── LemonAgent ──────────────────────────────────────────────

  publicClient.watchContractEvent({ poll: true,
    address: agentAddress,
    abi: agentEventAbi,
    eventName: "AgentRegistered",
    onLogs: (logs) => {
      for (const log of logs) {
        fetchAndUpsertAgent(log.args.wallet as Address);
      }
    },
    onError: (err) => console.error("[indexer] AgentRegistered watch error:", err),
  });

  publicClient.watchContractEvent({ poll: true,
    address: agentAddress,
    abi: agentEventAbi,
    eventName: "AgentUpdated",
    onLogs: (logs) => {
      for (const log of logs) {
        fetchAndUpsertAgent(log.args.wallet as Address);
      }
    },
    onError: (err) => console.error("[indexer] AgentUpdated watch error:", err),
  });

  publicClient.watchContractEvent({ poll: true,
    address: agentAddress,
    abi: agentEventAbi,
    eventName: "AgentDeactivated",
    onLogs: (logs) => {
      for (const log of logs) {
        const wallet = (log.args.wallet as Address).toLowerCase();
        // Mark agent inactive in Supabase (partial update — only flip the active flag)
        dbUpsertAgent({ wallet, active: false } as AgentRow).catch((e) =>
          console.error("[indexer] AgentDeactivated upsert error:", e)
        );
      }
    },
    onError: (err) => console.error("[indexer] AgentDeactivated watch error:", err),
  });

  // ── LemonDate ───────────────────────────────────────────────

  publicClient.watchContractEvent({ poll: true,
    address: dateAddress,
    abi: dateEventAbi,
    eventName: "DateBooked",
    onLogs: async (logs) => {
      for (const log of logs) {
        const args = log.args as {
          dateId?: bigint; agentA?: Address; agentB?: Address; template?: number; payerMode?: number;
        };
        if (args.dateId == null || !args.agentA || !args.agentB || args.template == null || args.payerMode == null) {
          console.error("[indexer] DateBooked: missing event args, skipping log", log);
          continue;
        }
        const { dateId, agentA, agentB, template, payerMode } = args;
        const row: DateRow = {
          date_id: dateId.toString(),
          agent_a: agentA.toLowerCase(),
          agent_b: agentB.toLowerCase(),
          template,
          status: 0, // PENDING
          payer_mode: payerMode,
          cost_usd: "0",
          payment_token: "",
          x402_tx_hash: log.transactionHash ?? "",
          nft_token_id: null,
          scheduled_at: Math.floor(Date.now() / 1000),
          completed_at: null,
          metadata_uri: null,
          image_url: null,
          tweet_url: null,
          indexed_at: new Date().toISOString(),
        };
        try {
          await dbUpsertDate(row);
          console.log(`[indexer] date booked: #${dateId}`);
        } catch (err) {
          console.error("[indexer] DateBooked upsert error:", err);
        }
      }
    },
    onError: (err) => console.error("[indexer] DateBooked watch error:", err),
  });

  publicClient.watchContractEvent({ poll: true,
    address: dateAddress,
    abi: dateEventAbi,
    eventName: "DateCompleted",
    onLogs: async (logs) => {
      for (const log of logs) {
        const { dateId, nftTokenId } = log.args as { dateId: bigint; nftTokenId: bigint };
        try {
          await dbUpdateDate(dateId.toString(), {
            status: 2, // COMPLETED
            nft_token_id: nftTokenId.toString(),
            completed_at: Math.floor(Date.now() / 1000),
          });
          console.log(`[indexer] date completed: #${dateId}`);

          // Check if this is the 3rd completed date between the pair → send Telegram intro
          checkAndSendTelegramIntro(dateId.toString()).catch((e) =>
            console.error("[indexer] telegram intro check failed:", e)
          );
        } catch (err) {
          console.error("[indexer] DateCompleted update error:", err);
        }
      }
    },
    onError: (err) => console.error("[indexer] DateCompleted watch error:", err),
  });

  publicClient.watchContractEvent({ poll: true,
    address: dateAddress,
    abi: dateEventAbi,
    eventName: "DateCancelled",
    onLogs: async (logs) => {
      for (const log of logs) {
        const { dateId } = log.args as { dateId: bigint };
        try {
          await dbUpdateDate(dateId.toString(), { status: 3 }); // CANCELLED
          console.log(`[indexer] date cancelled: #${dateId}`);
        } catch (err) {
          console.error("[indexer] DateCancelled update error:", err);
        }
      }
    },
    onError: (err) => console.error("[indexer] DateCancelled watch error:", err),
  });

  publicClient.watchContractEvent({ poll: true,
    address: dateAddress,
    abi: dateEventAbi,
    eventName: "PaymentReceived",
    onLogs: async (logs) => {
      for (const log of logs) {
        const { dateId, tokenAmount } = log.args as {
          dateId: bigint; payerA: string; payerB: string; tokenAmount: bigint;
        };
        try {
          // Convert wei amount back to cents (tokenAmount / 10^16)
          const costCents = Number(tokenAmount / BigInt(1e14)) / 100;
          await dbUpdateDate(dateId.toString(), {
            cost_usd: Math.round(costCents).toString(),
          });
          console.log(`[indexer] payment received for date #${dateId}: $${costCents / 100}`);
        } catch (err) {
          console.error("[indexer] PaymentReceived update error:", err);
        }
      }
    },
    onError: (err) => console.error("[indexer] PaymentReceived watch error:", err),
  });

  // ── LemonNFT ────────────────────────────────────────────────

  publicClient.watchContractEvent({ poll: true,
    address: nftAddress,
    abi: nftEventAbi,
    eventName: "DateMemoryMinted",
    onLogs: async (logs) => {
      for (const log of logs) {
        const { tokenId, dateId, tokenURI } = log.args as {
          tokenId: bigint; dateId: bigint; agentA: Address; agentB: Address; tokenURI: string;
        };
        try {
          await dbUpdateDate(dateId.toString(), {
            nft_token_id: tokenId.toString(),
            metadata_uri: tokenURI,
          });
          console.log(`[indexer] NFT minted: token #${tokenId} for date #${dateId}`);
        } catch (err) {
          console.error("[indexer] DateMemoryMinted update error:", err);
        }
      }
    },
    onError: (err) => console.error("[indexer] DateMemoryMinted watch error:", err),
  });

  console.log("[indexer] All event watchers active.");
}
