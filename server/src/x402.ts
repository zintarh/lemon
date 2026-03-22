/**
 * x402.ts (server)
 *
 * Proper x402 HTTP-native payment integration using thirdweb.
 *
 * Flow per date booking:
 *   1. performDateBooking calls collectDatePayment(payerMode, agentAKey, agentBKey)
 *   2. payViaX402 makes a plain POST to /api/x402/pay (or /pay-half)
 *   3. Server responds HTTP 402 with payment requirements (amount, token, chain)
 *   4. wrapFetchWithPayment auto-signs + retries with X-PAYMENT header
 *   5. settlePayment verifies + settles on-chain → 200 OK
 *   6. Booking proceeds
 *
 * For SPLIT billing: both agent wallets pay half in parallel.
 */

import { createThirdwebClient, defineChain, type Chain } from "thirdweb";
import { privateKeyToAccount } from "thirdweb/wallets";
import { settlePayment, facilitator, wrapFetchWithPayment } from "thirdweb/x402";
import type { Request, Response } from "express";

// ─── Config ──────────────────────────────────────────────────────────────────

const IS_TESTNET = process.env.NETWORK !== "mainnet";
const chain: Chain = IS_TESTNET ? defineChain(11142220) : defineChain(42220);

export const TREASURY_ADDRESS = (
  process.env.LEMON_TREASURY_ADDRESS ??
  process.env.DEPLOYER_ADDRESS ??
  ""
) as `0x${string}`;

const DATE_COST_CENTS = Number(process.env.DATE_COST_CENTS ?? 100);
export const DATE_COST_USD = (DATE_COST_CENTS / 100).toFixed(2);       // "1.00"
export const DATE_COST_HALF_USD = (DATE_COST_CENTS / 200).toFixed(2);  // "0.50"

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:4000";
export const X402_PAY_URL = `${SERVER_URL}/api/x402/pay`;
export const X402_PAY_HALF_URL = `${SERVER_URL}/api/x402/pay-half`;

// ─── Thirdweb clients ─────────────────────────────────────────────────────────

export const serverClient = createThirdwebClient({
  secretKey: process.env.THIRDWEB_SECRET_KEY!,
});

let _thirdwebFacilitator: ReturnType<typeof facilitator> | null = null;
function getThirdwebFacilitator() {
  if (!_thirdwebFacilitator) {
    if (!TREASURY_ADDRESS) {
      throw new Error(
        "[x402] LEMON_TREASURY_ADDRESS (or DEPLOYER_ADDRESS) is not set in env — x402 payments are disabled"
      );
    }
    _thirdwebFacilitator = facilitator({
      client: serverClient,
      serverWalletAddress: TREASURY_ADDRESS,
    });
  }
  return _thirdwebFacilitator;
}

// ─── Server side: settle an incoming x402 payment ────────────────────────────

/**
 * x402 middleware for Express endpoints.
 * Returns true if payment settled (proceed). Returns false if 402 was sent (stop).
 */
export async function settleX402(
  req: Request,
  res: Response,
  endpoint: string,
  priceUSD: string,
): Promise<boolean> {
  const paymentData =
    (req.headers["x-payment"] as string | undefined) ??
    (req.headers["payment-signature"] as string | undefined);

  const result = await settlePayment({
    resourceUrl: endpoint,
    method: "POST",
    paymentData,
    payTo: TREASURY_ADDRESS,
    network: chain,
    price: priceUSD,
    facilitator: getThirdwebFacilitator(),
  });

  if (result.status !== 200) {
    res
      .status(result.status)
      .set(result.responseHeaders as Record<string, string>)
      .json(result.responseBody);
    return false;
  }

  return true;
}

// ─── Client side: agent pays via x402 ────────────────────────────────────────

/**
 * Makes an x402 payment from an agent's wallet to the given endpoint.
 * Uses wrapFetchWithPayment with a minimal wallet shim that adapts an Account
 * to the interface wrapFetchWithPayment expects.
 */
async function payViaX402(
  agentPrivateKey: `0x${string}`,
  endpoint: string,
  body: string,
): Promise<void> {
  const account = privateKeyToAccount({ client: serverClient, privateKey: agentPrivateKey });

  // wrapFetchWithPayment(fetch, client, wallet, options)
  // "wallet" only needs getAccount() + getChain() + switchChain() in the payment path
  const walletShim = {
    getAccount: () => account,
    getChain: () => chain,
    switchChain: async (_newChain: Chain) => { /* agent wallet is always on the same chain */ },
  };

  const fetchWithPayment = wrapFetchWithPayment(
    fetch,
    serverClient,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    walletShim as any,
  );

  const res = await fetchWithPayment(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[x402] Payment failed (${res.status}): ${text.slice(0, 300)}`);
  }

  console.log(`[x402] ✓ Payment settled — ${account.address.slice(0, 8)}… → ${endpoint}`);
}

// ─── Exported: collect date payment ──────────────────────────────────────────

/**
 * Collects cUSD payment for a date booking via proper x402 HTTP protocol.
 *
 * AGENT_A → agentA's wallet pays full cost via /api/x402/pay
 * AGENT_B → agentB's wallet pays full cost via /api/x402/pay
 * SPLIT   → both wallets pay half in parallel via /api/x402/pay-half
 */
export async function collectDatePayment(params: {
  payerMode: "AGENT_A" | "AGENT_B" | "SPLIT";
  agentAPrivateKey: `0x${string}`;
  agentBPrivateKey: `0x${string}`;
  walletA: string;
  walletB: string;
}): Promise<void> {
  const { payerMode, agentAPrivateKey, agentBPrivateKey } = params;
  const body = JSON.stringify({ walletA: params.walletA, walletB: params.walletB });

  if (payerMode === "SPLIT") {
    console.log(`[x402] SPLIT — both agents paying ${DATE_COST_HALF_USD} USD each…`);
    await Promise.all([
      payViaX402(agentAPrivateKey, X402_PAY_HALF_URL, body),
      payViaX402(agentBPrivateKey, X402_PAY_HALF_URL, body),
    ]);
    console.log("[x402] ✓ SPLIT payment complete");
    return;
  }

  const payerKey = payerMode === "AGENT_A" ? agentAPrivateKey : agentBPrivateKey;
  const label = payerMode === "AGENT_A" ? "agentA" : "agentB";
  console.log(`[x402] ${label} paying ${DATE_COST_USD} USD…`);
  await payViaX402(payerKey, X402_PAY_URL, body);
  console.log(`[x402] ✓ Full payment by ${label} complete`);
}
