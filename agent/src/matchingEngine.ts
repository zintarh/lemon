/**
 * matchingEngine.ts
 *
 * Off-chain matching algorithm. Scores agent pairs based on overlapping interests,
 * personality compatibility, and preference alignment. Hard-filters any pair where
 * one agent's deal breakers conflict with the other agent's stated profile.
 */

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface AgentProfile {
  wallet: string;
  name: string;
  personality: string;
  preferences: string;
  dealBreakers: string[];
  billingMode: "SPLIT" | "SOLO";
}

export interface MatchResult {
  agentA: string;
  agentB: string;
  compatibilityScore: number; // 0–100
  sharedInterests: string[];
  dealBreakerConflicts: string[];
  viable: boolean;
}

/**
 * Checks if agentB's profile triggers any of agentA's deal breakers (and vice versa).
 * Returns an array of conflict descriptions; empty = no conflicts.
 */
export async function checkDealBreakers(
  agentA: AgentProfile,
  agentB: AgentProfile
): Promise<string[]> {
  if (agentA.dealBreakers.length === 0 && agentB.dealBreakers.length === 0) {
    return [];
  }

  const prompt = `
You are evaluating whether two dating agent profiles have deal breaker conflicts.

Agent A — "${agentA.name}":
  Personality: ${agentA.personality}
  Preferences: ${agentA.preferences}
  Deal Breakers: ${agentA.dealBreakers.join(", ") || "none"}

Agent B — "${agentB.name}":
  Personality: ${agentB.personality}
  Preferences: ${agentB.preferences}
  Deal Breakers: ${agentB.dealBreakers.join(", ") || "none"}

List ONLY the deal breaker conflicts that exist between these two agents.
A conflict exists when one agent's deal breaker clearly applies to the other agent's profile.
Return a JSON object: { "conflicts": [] } if no conflicts, or { "conflicts": ["reason1", ...] }.
Return only the JSON object, nothing else.
`.trim();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  try {
    const text = response.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("Empty response");
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : (parsed.conflicts ?? []);
  } catch (err) {
    console.error("[matchingEngine] checkDealBreakers parse failed:", err);
    return [];
  }
}

/**
 * Scores two agents for compatibility and identifies shared interests.
 */
export async function scoreCompatibility(
  agentA: AgentProfile,
  agentB: AgentProfile
): Promise<{ score: number; sharedInterests: string[] }> {
  const prompt = `
You are scoring compatibility between two AI dating agents.

Agent A — "${agentA.name}":
  Personality: ${agentA.personality}
  Preferences: ${agentA.preferences}

Agent B — "${agentB.name}":
  Personality: ${agentB.personality}
  Preferences: ${agentB.preferences}

Return a JSON object with:
  - "score": integer 0–100 representing compatibility
  - "sharedInterests": array of strings describing overlapping interests/values

Return only the JSON object, nothing else.
`.trim();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  try {
    const text = response.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("Empty response");
    return JSON.parse(text) as { score: number; sharedInterests: string[] };
  } catch (err) {
    console.error("[matchingEngine] scoreCompatibility parse failed:", err);
    return { score: 0, sharedInterests: [] };
  }
}

/**
 * Main matching function. Takes a list of active agent profiles and returns
 * viable match pairs sorted by compatibility score (highest first).
 */
export async function findMatches(agents: AgentProfile[]): Promise<MatchResult[]> {
  const results: MatchResult[] = [];

  for (let i = 0; i < agents.length; i++) {
    for (let j = i + 1; j < agents.length; j++) {
      const agentA = agents[i];
      const agentB = agents[j];

      const [conflicts, compat] = await Promise.all([
        checkDealBreakers(agentA, agentB),
        scoreCompatibility(agentA, agentB),
      ]);

      results.push({
        agentA: agentA.wallet,
        agentB: agentB.wallet,
        compatibilityScore: compat.score,
        sharedInterests: compat.sharedInterests,
        dealBreakerConflicts: conflicts,
        viable: conflicts.length === 0 && compat.score >= 40,
      });
    }
  }

  return results
    .filter((r) => r.viable)
    .sort((a, b) => b.compatibilityScore - a.compatibilityScore);
}
