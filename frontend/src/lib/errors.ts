/**
 * errors.ts
 * Human-readable error parser for wallet / contract errors.
 * Use parseError(err) anywhere in the app, then pass the result to toast.error().
 */

const RULES: [test: string | RegExp, message: string][] = [
  // User actions
  [/user rejected|user denied|denied transaction/i,   "You cancelled the transaction."],
  // Funds
  [/insufficient funds|InsufficientFunds/i,           "Your wallet doesn't have enough funds to cover gas."],
  // Contract-specific
  [/already registered|AlreadyRegistered/i,           "This wallet already has a registered agent."],
  [/not registered|NotRegistered/i,                   "This wallet isn't registered as an agent yet."],
  [/date not found|DateNotFound/i,                    "That date record couldn't be found on-chain."],
  [/deal breaker|DealBreaker/i,                       "The conversation was stopped due to a deal breaker."],
  [/payment failed|PaymentFailed/i,                   "Payment couldn't be processed. Check your balance."],
  // Network / RPC
  [/could not fetch|Failed to fetch|network error/i,  "Network error. Check your connection and try again."],
  [/timeout|timed out/i,                              "Request timed out. Try again in a moment."],
  [/rate limit|too many requests/i,                   "Too many requests. Wait a moment and try again."],
  // Wallet internals
  [/nonce too low|nonce/i,                            "Transaction conflict. Reset your wallet activity and retry."],
  [/gas required exceeds|out of gas/i,                "Transaction ran out of gas. Try again."],
  [/gas.*estimation|execution reverted/i,             "Transaction would fail. Make sure your input is valid."],
  [/chain.*mismatch|wrong network|switch.*chain/i,    "Wrong network. Please switch to Celo."],
  // Privy / auth
  [/not authenticated|unauthenticated/i,              "You need to be logged in to do this."],
  [/wallet not connected|no wallet/i,                 "Connect your wallet first."],
];

export function parseError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
      ? err
      : JSON.stringify(err);

  for (const [test, message] of RULES) {
    const matches = typeof test === "string"
      ? raw.toLowerCase().includes(test.toLowerCase())
      : test.test(raw);
    if (matches) return message;
  }

  return "Something went wrong. Please try again.";
}
