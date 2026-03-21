/**
 * selfclaw.ts — Human verification via @selfxyz/agent-sdk
 *
 * Flow:
 *  1. Server calls startSelfSession(wallet) → gets deepLink + sessionToken
 *  2. deepLink is converted to a QR code data-URL and returned to frontend
 *  3. User scans QR with the Self app on their phone
 *  4. pollAndUpdateDB() runs in background, polls until verified, then writes DB
 */

import { requestRegistration } from "@selfxyz/agent-sdk";
import QRCode from "qrcode";
import type { Address } from "viem";

const NETWORK = (process.env.NETWORK === "mainnet" ? "mainnet" : "testnet") as "mainnet" | "testnet";

// ─── Start a registration session ────────────────────────────────────────────

export interface SelfSession {
  sessionToken: string;
  deepLink: string;
  qrDataUrl: string | null;   // data: URI — send to frontend
  agentAddress: string | null;
}

export async function startSelfSession(params: {
  wallet: Address;
  agentName: string;
  agentDescription?: string;
}): Promise<SelfSession | null> {
  const { wallet, agentName, agentDescription } = params;

  try {
    const session = await requestRegistration({
      mode: "linked",
      network: NETWORK,
      humanAddress: wallet,
      agentName: agentName.slice(0, 40),
      agentDescription: agentDescription ?? `Lemon AI dating agent`,
      disclosures: { ofac: true },
    });

    // Convert deepLink → QR code data URL so frontend can render it
    let qrDataUrl: string | null = null;
    try {
      qrDataUrl = await QRCode.toDataURL(session.deepLink, {
        width: 256,
        margin: 2,
        color: { dark: "#1a1206", light: "#ffffff" },
      });
    } catch (qrErr) {
      console.warn("[self] QR generation failed:", qrErr);
    }

    console.log(`[self] Session created for ${wallet}: token=${session.sessionToken.slice(0, 12)}…`);

    return {
      sessionToken: session.sessionToken,
      deepLink: session.deepLink,
      qrDataUrl,
      agentAddress: session.agentAddress ?? null,
    };
  } catch (err) {
    console.error("[self] requestRegistration failed:", (err as Error).message);
    return null;
  }
}

// ─── Background poll ──────────────────────────────────────────────────────────

export async function pollAndUpdateDB(
  sessionToken: string,
  wallet: Address,
  agentName: string,
  agentDescription: string | undefined,
  onVerified: (humanId: string) => Promise<void>
): Promise<void> {
  try {
    // Re-hydrate session from token to resume polling
    const session = await requestRegistration({
      mode: "linked",
      network: NETWORK,
      humanAddress: wallet,
      agentName: agentName.slice(0, 40),
      agentDescription: agentDescription ?? `Lemon AI dating agent`,
      disclosures: { ofac: true },
    });

    // Use the returned session's waitForCompletion (5 min timeout)
    const result = await session.waitForCompletion({ timeoutMs: 5 * 60 * 1000 });

    if (result) {
      const humanId = result.agentId?.toString() ?? session.agentAddress ?? "";
      console.log(`[self] Verified: wallet=${wallet} humanId=${humanId}`);
      await onVerified(humanId);
    }
  } catch (err) {
    console.warn(`[self] pollAndUpdateDB failed for ${wallet}:`, (err as Error).message);
  }
}

// ─── Check on-chain status ────────────────────────────────────────────────────

export async function checkSelfStatus(wallet: Address): Promise<{
  verified: boolean;
  humanId: string | null;
}> {
  try {
    const { getAgentsForHuman } = await import("@selfxyz/agent-sdk");
    const agents = await getAgentsForHuman(wallet, { network: NETWORK });
    const verified = Array.isArray(agents) && agents.length > 0;
    const humanId = verified ? (agents[0]?.agentId?.toString() ?? null) : null;
    return { verified, humanId };
  } catch {
    return { verified: false, humanId: null };
  }
}
