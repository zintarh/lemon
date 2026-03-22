/**
 * selfclaw.ts — Human verification via Self Agent ID REST API
 *
 * Docs: https://app.ai.self.xyz/api-docs
 *
 * Flow:
 *  1. POST /register  → sessionToken + qrImageBase64 + deepLink + agentAddress
 *  2. Display QR (already rendered by API) / deepLink to user
 *  3. User scans with Self app → passport proof submitted on-chain
 *  4. Poll GET /register/status with Bearer token until stage === "completed"
 *  5. On completed → write agentAddress as humanId to DB, set selfclaw_verified = true
 */

import type { Address } from "viem";

const BASE = "https://app.ai.self.xyz/api/agent";

// ─── Session type ─────────────────────────────────────────────────────────────

export interface SelfSession {
  sessionToken: string;
  deepLink: string;
  qrDataUrl: string | null;   // data:image/png;base64,... — ready to use in <img src>
  agentAddress: string | null;
  // Kept for API compatibility (no longer used by new API)
  publicKey: string;
  privateKey: string;
}

// ─── Start a verification session ─────────────────────────────────────────────

export async function startSelfSession(params: {
  wallet: Address;
  agentName: string;
  agentDescription?: string;
  existingPublicKey?: string;
  existingPrivateKey?: string;
}): Promise<SelfSession> {
  const network = (process.env.NETWORK ?? "testnet") === "mainnet" ? "mainnet" : "testnet";

  console.log(`[self-agent-id] POST /register → wallet=${params.wallet} network=${network}`);

  const res = await fetch(`${BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "linked",
      network,
      humanAddress: params.wallet,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`[self-agent-id] /register ${res.status}: ${text.slice(0, 300)}`);
  }

  let data: {
    sessionToken: string;
    stage: string;
    qrImageBase64?: string;
    deepLink?: string;
    agentAddress?: string;
    [key: string]: unknown;
  };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`[self-agent-id] /register returned non-JSON: ${text.slice(0, 200)}`);
  }

  if (!data.sessionToken) {
    throw new Error(`[self-agent-id] /register missing sessionToken. Got: ${JSON.stringify(data).slice(0, 200)}`);
  }

  console.log(`[self-agent-id] /register ok, stage=${data.stage}, agentAddress=${data.agentAddress}`);

  // API returns raw base64 PNG (no data URL prefix)
  const qrDataUrl = data.qrImageBase64
    ? `data:image/png;base64,${data.qrImageBase64}`
    : null;

  return {
    sessionToken: data.sessionToken,
    deepLink: data.deepLink ?? "",
    qrDataUrl,
    agentAddress: data.agentAddress ?? null,
    publicKey: "",   // not used by new API
    privateKey: "",  // not used by new API
  };
}

// ─── Background poller ────────────────────────────────────────────────────────

export async function pollAndUpdateDB(
  sessionToken: string,
  _wallet: Address,
  _agentName: string,
  _agentDescription: string | undefined,
  onVerified: (humanId: string) => Promise<void>
): Promise<void> {
  const timeoutAt = Date.now() + 30 * 60 * 1000; // 30 min max (session TTL is 30 min)
  console.log(`[self-agent-id] Polling register/status for session ${sessionToken.slice(0, 20)}…`);

  while (Date.now() < timeoutAt) {
    await new Promise<void>((r) => setTimeout(r, 7_000));
    try {
      const res = await fetch(`${BASE}/register/status`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });

      if (res.status === 410) {
        console.log("[self-agent-id] Session expired (410)");
        return;
      }
      if (!res.ok) {
        console.warn(`[self-agent-id] /register/status ${res.status}`);
        continue;
      }

      const data = await res.json() as {
        stage?: string;
        agentId?: string | number;
        agentAddress?: string;
        sessionToken?: string;
        [key: string]: unknown;
      };

      console.log(`[self-agent-id] poll stage=${data.stage}`);

      // Update the rolling session token if refreshed
      if (data.sessionToken) {
        sessionToken = data.sessionToken;
      }

      if (data.stage === "completed") {
        const humanId = (data.agentAddress as string | undefined)
          ?? String(data.agentId ?? "");
        console.log(`[self-agent-id] ✓ Verified! humanId=${humanId}`);
        await onVerified(humanId);
        return;
      }

      if (data.stage === "failed" || data.stage === "expired") {
        console.log(`[self-agent-id] Session ended with stage=${data.stage}`);
        return;
      }
    } catch (e) {
      console.warn("[self-agent-id] poll error:", (e as Error).message);
    }
  }
  console.warn("[self-agent-id] Polling timed out");
}

// ─── Quick status check (kept for API compatibility — reads from DB state) ───

export async function checkSelfStatus(
  _wallet: Address,
  _publicKey?: string
): Promise<{ verified: boolean; humanId: string | null }> {
  // Status is now tracked entirely via DB; no external check needed.
  return { verified: false, humanId: null };
}
