/**
 * agent/src/index.ts
 *
 * Entry point for the Lemon agent runtime.
 * Exposes a simple HTTP server that the backend (server/) calls to trigger
 * matching runs and conversation sessions.
 */

import "./loadEnv.js";
import http from "http";
import { findMatches } from "./matchingEngine.js";
import { runConversation } from "./conversationAgent.js";
import { planDate } from "./dateAgent.js";
import { registerAgentIdentity, updateAgentReputation } from "./erc8004.js";
import type { AgentProfile } from "./matchingEngine.js";
import type { DateTemplate } from "./dateAgent.js";

const VALID_TEMPLATES = new Set<string>(["COFFEE", "BEACH", "WORK", "ROOFTOP_DINNER", "GALLERY_WALK"]);

const PORT = process.env.PORT || process.env.AGENT_PORT || 5000;
const MAX_BODY_BYTES = 512 * 1024;

function internalAuthOk(req: http.IncomingMessage): boolean {
  const secret = process.env.LEMON_INTERNAL_SECRET;
  if (!secret) return true;
  const h = req.headers["x-lemon-internal-secret"];
  const headerVal = Array.isArray(h) ? h[0] : h;
  const auth = req.headers.authorization;
  const bearer =
    typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return headerVal === secret || bearer === secret;
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

async function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer | string) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      size += buf.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Payload too large"));
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => {
      try {
        const data = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  try {
    const isHealthGet = req.method === "GET" && url.pathname === "/health";
    const isRootGet = req.method === "GET" && (url.pathname === "/" || url.pathname === "");
    // Public: health + bare root (so opening the Railway URL in a browser isn’t a scary 401).
    const isPublicGet = isHealthGet || isRootGet;
    if (!isPublicGet && !internalAuthOk(req)) {
      return json(res, 401, { error: "Unauthorized" });
    }

    // ── GET / ────────────────────────────────────────────────────────────────
    if (isRootGet) {
      return json(res, 200, {
        service: "lemon-agent",
        message: "This URL is for your Lemon backend only (match, conversation, plan-date).",
        health: "/health",
      });
    }

    // ── GET /health ──────────────────────────────────────────────────────────
    if (isHealthGet) {
      return json(res, 200, { status: "ok" });
    }

    // ── POST /match ─────────────────────────────────────────────────────────
    // Body: { agents: AgentProfile[] }
    // Returns viable match pairs sorted by score
    if (req.method === "POST" && url.pathname === "/match") {
      const body = (await parseBody(req)) as { agents: AgentProfile[] };
      const matches = await findMatches(body.agents);
      return json(res, 200, { matches });
    }

    // ── POST /conversation ───────────────────────────────────────────────────
    // Body: { profileA: AgentProfile, profileB: AgentProfile, simulate?: boolean }
    // Returns conversation result including pass/fail and suggested template
    if (req.method === "POST" && url.pathname === "/conversation") {
      const body = (await parseBody(req)) as {
        profileA: AgentProfile;
        profileB: AgentProfile;
        simulate?: boolean;
        callbackUrl?: string;
      };

      let onMessage: ((msg: import("./conversationAgent.js").ConversationMessage) => Promise<void>) | undefined;
      if (body.callbackUrl) {
        const cbUrl = body.callbackUrl;
        const secret = process.env.LEMON_INTERNAL_SECRET;
        onMessage = async (msg) => {
          try {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (secret) headers["X-Lemon-Internal-Secret"] = secret;
            await fetch(cbUrl, {
              method: "POST",
              headers,
              body: JSON.stringify({ walletA: body.profileA.wallet, walletB: body.profileB.wallet, message: msg }),
            });
          } catch { /* non-fatal */ }
        };
      }

      const result = await runConversation(body.profileA, body.profileB, body.simulate ?? true, onMessage);
      return json(res, 200, result);
    }

    // ── POST /plan-date ──────────────────────────────────────────────────────
    // Body: { profileA, profileB, template, sharedInterests }
    // Returns DatePlan with IPFS URIs, tweet caption, and payer mode
    if (req.method === "POST" && url.pathname === "/plan-date") {
      const body = (await parseBody(req)) as {
        profileA: AgentProfile;
        profileB: AgentProfile;
        template: string;
        sharedInterests: string[];
        chainResolvedPayer?: "AGENT_A" | "AGENT_B" | "SPLIT";
      };
      if (!VALID_TEMPLATES.has(body.template)) {
        return json(res, 400, { error: `Invalid template: "${body.template}". Must be one of: ${[...VALID_TEMPLATES].join(", ")}` });
      }
      const plan = await planDate(
        body.profileA,
        body.profileB,
        body.template as DateTemplate,
        body.sharedInterests,
        body.chainResolvedPayer,
      );
      return json(res, 200, plan);
    }

    // ── POST /register-agent ─────────────────────────────────────────────────
    // Body: { profile: AgentProfile, agentURI?: string }
    // Registers the agent in the ERC-8004 identity registry (ChaosChain).
    // Called by the server after the on-chain AgentRegistered event fires.
    if (req.method === "POST" && url.pathname === "/register-agent") {
      const body = (await parseBody(req)) as { profile: AgentProfile; agentURI?: string };
      const result = await registerAgentIdentity(body.profile, body.agentURI);
      return json(res, 200, {
        agentId: result.agentId.toString(),
        txHash: result.txHash,
        mock: result.mock,
      });
    }

    // ── POST /update-reputation ──────────────────────────────────────────────
    // Body: { agentId: string, dateCompleted: boolean }
    // Increments / decrements the agent's ERC-8004 reputation score.
    if (req.method === "POST" && url.pathname === "/update-reputation") {
      const body = (await parseBody(req)) as { agentId: string; dateCompleted: boolean };
      const result = await updateAgentReputation(BigInt(body.agentId), body.dateCompleted);
      return json(res, 200, result);
    }

    json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[agent]", err);
    json(res, 500, { error: (err as Error).message });
  }
});

server.listen(PORT, () => {
  console.log(`[agent] Lemon agent runtime listening on port ${PORT}`);
  if (!process.env.LEMON_INTERNAL_SECRET) {
    console.warn("[agent] LEMON_INTERNAL_SECRET is unset — HTTP endpoints are open. Set the same value as the server in production.");
  }
});
