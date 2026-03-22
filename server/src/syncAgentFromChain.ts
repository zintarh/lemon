/**
 * Pull the canonical agent profile from LemonAgent (on-chain) and upsert into Supabase.
 * Matcher / conversations read from DB — call this after registerAgent or updateProfile
 * so Supabase stays aligned with the contract (indexer may be off in some deployments).
 */

import type { Address } from "viem";
import { getAgentProfile } from "./onchain.js";
import { dbGetAgent, dbUpsertAgent, type AgentRow } from "./db.js";

export async function syncAgentFromChain(wallet: Address): Promise<void> {
  const profile = await getAgentProfile(wallet);
  const existing = await dbGetAgent(wallet);

  const row: AgentRow = {
    wallet: profile.wallet.toLowerCase(),
    name: profile.name,
    avatar_uri: profile.avatarURI,
    agent_uri: profile.agentURI,
    personality: profile.personality,
    preferences: profile.preferences,
    deal_breakers: profile.dealBreakers,
    billing_mode: profile.billingMode,
    erc8004_agent_id: profile.erc8004AgentId.toString(),
    selfclaw_public_key: existing?.selfclaw_public_key ?? "",
    selfclaw_private_key: existing?.selfclaw_private_key ?? "",
    selfclaw_session_id: existing?.selfclaw_session_id ?? "",
    selfclaw_human_id: existing?.selfclaw_human_id ?? "",
    selfclaw_verified: existing?.selfclaw_verified ?? false,
    agent_wallet: existing?.agent_wallet ?? "",
    agent_private_key: existing?.agent_private_key ?? "",
    registered_at: Number(profile.registeredAt),
    active: profile.active,
    indexed_at: new Date().toISOString(),
  };

  await dbUpsertAgent(row);
}
