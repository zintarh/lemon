/**
 * x402.ts (agent layer)
 *
 * Triggers x402 HTTP-native micropayments from within the agent runtime.
 * Calls thirdweb Engine to transfer cUSD from the server wallet on behalf
 * of the resolved payer. Falls back to a deterministic mock hash when the
 * thirdweb Engine is not configured (dev / test mode).
 *
 * PayerMode:
 *   SPLIT    → two equal half-payments (one per agent)
 *   AGENT_A  → agent A's wallet covers the full date cost
 *   AGENT_B  → agent B's wallet covers the full date cost
 */

import axios from "axios";
import type { Address, Hash } from "viem";

const ENGINE_URL = process.env.THIRDWEB_ENGINE_URL ?? "https://engine.thirdweb.com";
const ENGINE_AUTH = process.env.THIRDWEB_SECRET_KEY ?? "";
const SERVER_WALLET = (process.env.SERVER_WALLET_ADDRESS ?? "") as Address;

// cUSD — Alfajores testnet vs Celo mainnet
const CUSD = (
  process.env.NETWORK === "testnet"
    ? "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1"
    : "0x765DE816845861e75A25fCA122bb6898B8B1282a"
) as Address;

const DATE_COST_CENTS = Number(process.env.DATE_COST_CENTS ?? 100); // $1.00 default

export type PayerMode = "AGENT_A" | "AGENT_B" | "SPLIT";

export interface X402PaymentResult {
  txHash: Hash;
  amountCents: number;
  mock: boolean;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Triggers x402 payment for a confirmed date booking.
 * Returns the primary tx hash used to record the payment on-chain.
 */
export async function triggerX402Payment(
  walletA: Address,
  walletB: Address,
  payerMode: PayerMode
): Promise<X402PaymentResult> {
  const memo = `Lemon date: ${walletA.slice(0, 6)}…${walletA.slice(-4)} × ${walletB.slice(0, 6)}…${walletB.slice(-4)}`;

  if (!isEngineConfigured()) {
    console.warn("[x402] Engine not configured — using mock payment hash");
    return {
      txHash: ("0x" + "a".repeat(64)) as Hash,
      amountCents: DATE_COST_CENTS,
      mock: true,
    };
  }

  if (payerMode === "SPLIT") {
    const half = Math.ceil(DATE_COST_CENTS / 2);
    // Fire both halves in parallel; use the first hash for the on-chain record
    const [hashA] = await Promise.all([
      sendTransfer((half / 100).toFixed(6), `${memo} [A split]`),
      sendTransfer(((DATE_COST_CENTS - half) / 100).toFixed(6), `${memo} [B split]`),
    ]);
    return { txHash: hashA, amountCents: DATE_COST_CENTS, mock: false };
  }

  const txHash = await sendTransfer((DATE_COST_CENTS / 100).toFixed(6), memo);
  return { txHash, amountCents: DATE_COST_CENTS, mock: false };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isEngineConfigured(): boolean {
  return Boolean(ENGINE_AUTH && ENGINE_AUTH !== "..." && SERVER_WALLET && SERVER_WALLET !== "0x");
}

async function sendTransfer(amount: string, memo: string): Promise<Hash> {
  const chainId = process.env.NETWORK === "testnet" ? 44787 : 42220;

  const { data } = await axios.post(
    `${ENGINE_URL}/contract/${chainId}/${CUSD}/erc20/transfer`,
    {
      toAddress: SERVER_WALLET,
      amount,
      fromWalletAddress: SERVER_WALLET,
      txOverrides: { memo },
    },
    {
      headers: {
        Authorization: `Bearer ${ENGINE_AUTH}`,
        "Content-Type": "application/json",
      },
    }
  );

  return pollQueue(data.result.queueId);
}

async function pollQueue(queueId: string, maxAttempts = 30): Promise<Hash> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const { data } = await axios.get(`${ENGINE_URL}/transaction/status/${queueId}`, {
      headers: { Authorization: `Bearer ${ENGINE_AUTH}` },
    });

    const status: string = data.result?.status;

    if (status === "mined") {
      const txHash = data.result?.transactionHash;
      if (!txHash) throw new Error(`[x402] Engine returned 'mined' but no transactionHash for queue ${queueId}`);
      return txHash as Hash;
    }

    if (status === "errored") {
      throw new Error(`[x402] Engine tx errored: ${data.result?.errorMessage ?? "unknown"}`);
    }

    console.log(`[x402] queue ${queueId} status=${status ?? "unknown"} (attempt ${i + 1}/${maxAttempts})`);
  }

  throw new Error("[x402] Engine tx timed out after 60 s");
}
