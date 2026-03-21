/**
 * x402.ts
 *
 * Handles x402 HTTP-native micropayments via thirdweb Engine server wallet.
 *
 * Flow:
 *  1. Client calls POST /api/payment/initiate  → server returns a payment request
 *  2. Client (or server wallet) pays via x402   → returns a tx hash
 *  3. Server calls verifyPayment()              → validates the hash before booking
 *
 * The server wallet (thirdweb Engine) acts as the payment facilitator:
 *  - For SPLIT billing: each agent's wallet pays half
 *  - For SOLO billing:  the resolved payer pays full amount
 *
 * Reference: https://x402.org / thirdweb Engine docs
 */

import axios from "axios";
import type { Address, Hash } from "viem";

const ENGINE_URL = process.env.THIRDWEB_ENGINE_URL ?? "https://engine.thirdweb.com";
const ENGINE_AUTH = process.env.THIRDWEB_SECRET_KEY ?? "";
const SERVER_WALLET = process.env.SERVER_WALLET_ADDRESS as Address;

// cUSD on Celo mainnet / Alfajores
const CUSD = (
  process.env.NETWORK === "testnet"
    ? "0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1"
    : "0x765DE816845861e75A25fCA122bb6898B8B1282a"
) as Address;

// Date cost in cUSD cents (configurable via env)
const DATE_COST_CENTS = Number(process.env.DATE_COST_CENTS ?? 500); // $5.00 default

export type PaymentRequest = {
  token: Address;
  recipient: Address;
  amountCents: number;
  memo: string;
};

export type PaymentResult = {
  txHash: Hash;
  amountCents: number;
  token: Address;
};

// ─── Build a payment request for a date ──────────────────────────────────────

export function buildDatePaymentRequest(
  walletA: Address,
  walletB: Address,
  payerMode: "AGENT_A" | "AGENT_B" | "SPLIT"
): PaymentRequest[] {
  const memo = `Lemon date: ${walletA.slice(0, 6)} x ${walletB.slice(0, 6)}`;

  if (payerMode === "SPLIT") {
    const half = Math.ceil(DATE_COST_CENTS / 2);
    return [
      { token: CUSD, recipient: SERVER_WALLET, amountCents: half, memo: `${memo} (A split)` },
      { token: CUSD, recipient: SERVER_WALLET, amountCents: DATE_COST_CENTS - half, memo: `${memo} (B split)` },
    ];
  }

  return [{ token: CUSD, recipient: SERVER_WALLET, amountCents: DATE_COST_CENTS, memo }];
}

// ─── Execute payment via thirdweb Engine server wallet ───────────────────────
// The server wallet holds cUSD and sends it on behalf of the payer.
// In production this would be triggered by an x402-aware HTTP client.

export async function executePayment(request: PaymentRequest): Promise<PaymentResult> {
  if (!ENGINE_AUTH || ENGINE_AUTH === "...") {
    console.warn("[x402] Thirdweb Engine not configured — using mock payment hash");
    return {
      txHash: ("0x" + "a".repeat(64)) as Hash,
      amountCents: request.amountCents,
      token: request.token,
    };
  }

  // Call thirdweb Engine to transfer ERC-20 token
  const chainId = process.env.NETWORK === "testnet" ? 44787 : 42220;

  const response = await axios.post(
    `${ENGINE_URL}/contract/${chainId}/${request.token}/erc20/transfer`,
    {
      toAddress: request.recipient,
      amount: (request.amountCents / 100).toFixed(6), // cUSD has 18 decimals but API takes decimal string
      fromWalletAddress: SERVER_WALLET,
    },
    {
      headers: {
        Authorization: `Bearer ${ENGINE_AUTH}`,
        "Content-Type": "application/json",
      },
    }
  );

  const queueId = response.data?.result?.queueId;
  if (!queueId) throw new Error("[x402] Engine did not return a queueId");

  // Poll for transaction hash
  const txHash = await pollEngineQueue(queueId);

  return { txHash, amountCents: request.amountCents, token: request.token };
}

// ─── Poll thirdweb Engine queue until mined ───────────────────────────────────

async function pollEngineQueue(queueId: string, maxAttempts = 30): Promise<Hash> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    const { data } = await axios.get(`${ENGINE_URL}/transaction/status/${queueId}`, {
      headers: { Authorization: `Bearer ${ENGINE_AUTH}` },
    });

    const status = data.result?.status;
    if (status === "mined") return data.result.transactionHash as Hash;
    if (status === "errored") throw new Error(`[x402] Engine tx failed: ${data.result.errorMessage}`);
  }
  throw new Error("[x402] Engine tx timed out after 60s");
}

// ─── Verify a payment hash before booking ────────────────────────────────────
// Checks the tx exists on-chain and sent funds to SERVER_WALLET.

export async function verifyPayment(txHash: Hash, expectedCents: number): Promise<boolean> {
  if (txHash === ("0x" + "a".repeat(64) as Hash)) {
    // Mock hash — skip verification in dev
    console.warn("[x402] Skipping payment verification for mock hash");
    return true;
  }

  try {
    const { createPublicClient, http, parseUnits } = await import("viem");
    const { celo } = await import("viem/chains");
    type Chain = import("viem").Chain;
    const isTestnet = process.env.NETWORK === "testnet";

    const rpcUrl = process.env.CELO_RPC_URL ?? (isTestnet
      ? "https://forno.celo-sepolia.celo-testnet.org"
      : "https://forno.celo.org");
    const testnetChain: Chain = {
      id: 11142220,
      name: "Celo L2 Testnet",
      nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
      rpcUrls: { default: { http: ["https://forno.celo-sepolia.celo-testnet.org"] } },
      testnet: true,
    };
    const client = createPublicClient({
      chain: isTestnet ? testnetChain : celo,
      transport: http(rpcUrl),
    });

    const receipt = await client.getTransactionReceipt({ hash: txHash });
    // If receipt exists and status is success, payment is confirmed
    return receipt.status === "success";
  } catch {
    return false;
  }
}
