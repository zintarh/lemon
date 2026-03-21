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

const PORT = process.env.AGENT_PORT || 5000;

function json(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(payload);
}

async function parseBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
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
    // ── GET /health ──────────────────────────────────────────────────────────
    if (req.method === "GET" && url.pathname === "/health") {
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
        onMessage = async (msg) => {
          try {
            await fetch(cbUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
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
      };
      if (!VALID_TEMPLATES.has(body.template)) {
        return json(res, 400, { error: `Invalid template: "${body.template}". Must be one of: ${[...VALID_TEMPLATES].join(", ")}` });
      }
      const plan = await planDate(
        body.profileA,
        body.profileB,
        body.template as DateTemplate,
        body.sharedInterests
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
});
