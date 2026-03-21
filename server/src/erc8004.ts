/**
 * erc8004.ts
 *
 * Registers a Lemon agent in the ERC-8004 Identity Registry (ChaosChain)
 * and links the returned agentId back on-chain via LemonAgent.linkERC8004Id.
 *
 * Called once, right after a user's on-chain AgentRegistered event fires.
 *
 * Docs: https://erc8004.chaoschain.xyz/docs
 */

import axios from "axios";
import { parseAbi, type Address } from "viem";
import { publicClient, walletClient } from "./onchain.js";

const CHAOSCHAIN_API = "https://api.chaoschain.xyz/v1";
const API_KEY = process.env.CHAOSCHAIN_API_KEY ?? "";

const agentContractAbi = parseAbi([
  "function linkERC8004Id(address wallet, uint256 agentId) external",
]);

export type AgentIdentityPayload = {
  wallet: Address;
  name: string;
  agentURI: string;         // off-chain metadata (Pinata IPFS)
  personality: string;
  registeredAt: number;
};

// ─── Register with ChaosChain identity registry ──────────────────────────────

async function registerWithChaosChain(agent: AgentIdentityPayload): Promise<bigint> {
  if (!API_KEY || API_KEY === "...") {
    console.warn("[erc8004] CHAOSCHAIN_API_KEY not set — skipping registration, using id=0");
    return 0n;
  }

  const { data } = await axios.post(
    `${CHAOSCHAIN_API}/agents/register`,
    {
      address: agent.wallet,
      name: agent.name,
      metadataURI: agent.agentURI,
      description: agent.personality,
      registeredAt: agent.registeredAt,
      platform: "lemon",
    },
    {
      headers: {
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  // API returns { agentId: number, txHash: string }
  const agentId = BigInt(data.agentId ?? data.id ?? 0);
  console.log(`[erc8004] Registered agent ${agent.wallet} → ERC-8004 id #${agentId}`);
  return agentId;
}

// ─── Link agentId back on-chain via LemonAgent.linkERC8004Id ─────────────────

async function linkOnChain(wallet: Address, agentId: bigint): Promise<void> {
  if (agentId === 0n) return; // nothing to link

  const contractAddress = process.env.LEMON_AGENT_CONTRACT as Address;
  const hash = await walletClient.writeContract({
    address: contractAddress,
    abi: agentContractAbi,
    functionName: "linkERC8004Id",
    args: [wallet, agentId],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[erc8004] Linked ERC-8004 id #${agentId} to ${wallet} on-chain`);
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function registerERC8004Agent(agent: AgentIdentityPayload): Promise<bigint> {
  try {
    const agentId = await registerWithChaosChain(agent);
    await linkOnChain(agent.wallet, agentId);
    return agentId;
  } catch (err) {
    // Non-fatal: agent still works without an ERC-8004 id
    console.error("[erc8004] Registration failed (non-fatal):", err);
    return 0n;
  }
}
