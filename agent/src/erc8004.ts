/**
 * erc8004.ts (agent layer)
 *
 * Registers a Lemon agent in the ERC-8004 Agent Trust Protocol identity
 * registry (ChaosChain). Called from:
 *   1. POST /register-agent  — after the user's on-chain registration completes
 *   2. (optionally) after each successful date, to update the agent's
 *      reputation score on the registry
 *
 * When CHAOSCHAIN_API_KEY is not set (dev / test), registration is skipped
 * and agentId 0 is returned — the agent still works normally without it.
 */

import axios from "axios";
import type { AgentProfile } from "./matchingEngine.js";

const CHAOSCHAIN_API = process.env.CHAOSCHAIN_API_URL ?? "https://api.chaoschain.xyz/v1";
const API_KEY = process.env.CHAOSCHAIN_API_KEY ?? "";

export interface ERC8004Registration {
  agentId: bigint;
  txHash: string | null;
  mock: boolean;
}

export interface ReputationUpdate {
  agentId: bigint;
  newScore: number;
  success: boolean;
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Registers a new agent profile in the ERC-8004 identity registry.
 * Non-fatal: logs the error and returns agentId=0 on failure.
 */
export async function registerAgentIdentity(
  profile: AgentProfile,
  agentURI?: string
): Promise<ERC8004Registration> {
  if (!isConfigured()) {
    console.warn("[erc8004] CHAOSCHAIN_API_KEY not set — skipping registration (agentId=0)");
    return { agentId: 0n, txHash: null, mock: true };
  }

  try {
    const { data } = await axios.post(
      `${CHAOSCHAIN_API}/agents/register`,
      {
        address: profile.wallet,
        name: profile.name,
        description: profile.personality,
        metadataURI: agentURI ?? "",
        platform: "lemon",
      },
      {
        headers: {
          "x-api-key": API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    const agentId = BigInt(data.agentId ?? data.id ?? 0);
    if (agentId === 0n) {
      console.warn("[erc8004] API returned agentId=0 — registration may have failed silently");
    }
    console.log(`[erc8004] Registered "${profile.name}" (${profile.wallet}) → ERC-8004 id #${agentId}`);
    return { agentId, txHash: data.txHash ?? null, mock: false };
  } catch (err) {
    console.error("[erc8004] Registration failed (non-fatal):", (err as Error).message);
    return { agentId: 0n, txHash: null, mock: true };
  }
}

// ─── Reputation update ────────────────────────────────────────────────────────

/**
 * Increments the agent's reputation score on ERC-8004 after a successful date.
 * Non-fatal: silently returns on failure so it never blocks the date flow.
 */
export async function updateAgentReputation(
  agentId: bigint,
  dateCompleted: boolean,
  scoreIncrement = 1
): Promise<ReputationUpdate> {
  if (!isConfigured() || agentId === 0n) {
    return { agentId, newScore: 0, success: false };
  }

  try {
    const { data } = await axios.post(
      `${CHAOSCHAIN_API}/agents/${agentId}/reputation`,
      {
        event: dateCompleted ? "DATE_COMPLETED" : "DATE_CANCELLED",
        delta: dateCompleted ? scoreIncrement : -scoreIncrement,
        platform: "lemon",
      },
      {
        headers: {
          "x-api-key": API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`[erc8004] Updated reputation for agent #${agentId}: score=${data.newScore ?? "?"}`);
    return { agentId, newScore: data.newScore ?? 0, success: true };
  } catch (err) {
    console.error("[erc8004] Reputation update failed (non-fatal):", (err as Error).message);
    return { agentId, newScore: 0, success: false };
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function isConfigured(): boolean {
  return Boolean(API_KEY && API_KEY !== "...");
}
