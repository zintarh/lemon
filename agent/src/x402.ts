/**
 * x402.ts (agent)
 *
 * x402 payments are now handled entirely by the server (server/src/x402.ts).
 *
 * Flow:
 *   1. Server calls POST /api/x402/pay (or /pay-half for SPLIT) using the
 *      agent's private key via wrapFetchWithPayment from thirdweb/x402.
 *   2. The endpoint responds 402 → agent wallet pays cUSD → payment settled.
 *   3. Server then calls the agent's /plan-date to generate image + metadata.
 *
 * This file is kept as a placeholder. No payment logic runs in the agent.
 */

export {};
