/**
 * db.ts
 *
 * Supabase client + typed query helpers.
 * All reads go through here instead of direct RPC calls.
 */

import { createClient } from "@supabase/supabase-js";

// ─── Types (mirror the SQL schema) ──────────────────────────────────────────

export type AgentRow = {
  wallet: string;
  name: string;
  avatar_uri: string;
  agent_uri: string;
  personality: string;
  preferences: string;
  deal_breakers: string[];
  billing_mode: number;
  erc8004_agent_id: string;
  selfclaw_public_key: string;
  selfclaw_private_key: string;   // Ed25519 private key — kept server-side only
  selfclaw_session_id: string;    // pending verification session — allows resume
  selfclaw_human_id: string;
  selfclaw_verified: boolean;
  agent_wallet: string;
  agent_private_key: string;
  registered_at: number;
  active: boolean;       // agent is registered — NEVER cleared by the system
  in_pool: boolean;      // agent wants to be matched — toggled by user + cleared after each date
  indexed_at: string;
};

export type DateRow = {
  date_id: string;
  agent_a: string;
  agent_b: string;
  template: number;
  status: number;
  payer_mode: number;
  cost_usd: string;
  payment_token: string;
  x402_tx_hash: string;
  nft_token_id: string | null;
  scheduled_at: number;
  completed_at: number | null;
  metadata_uri: string | null;
  image_url: string | null;
  tweet_url: string | null;
  needs_user_mint?: boolean | null;
  failure_reason?: string | null;
  refund_status?: string | null; // refunded | failed | not_charged | not_needed
  refund_note?: string | null;
  indexed_at: string;
};

export type ConversationRow = {
  id: string;
  wallet_a: string;
  wallet_b: string;
  transcript: object;
  passed: boolean;
  deal_breaker_hit: string | null;
  template_suggested: string | null;
  shared_interests: string[];
  created_at: string;
};

export type MatchRow = {
  id: string;
  wallet_a: string;
  wallet_b: string;
  score: number;
  reasoning: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      agents: { Row: AgentRow; Insert: AgentRow; Update: Partial<AgentRow> };
      dates: { Row: DateRow; Insert: DateRow; Update: Partial<DateRow> };
      conversations: { Row: ConversationRow; Insert: Omit<ConversationRow, "id" | "created_at">; Update: Partial<ConversationRow> };
      matches: { Row: MatchRow; Insert: Omit<MatchRow, "id" | "created_at">; Update: Partial<MatchRow> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// ─── Client ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createClient<any>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Agent queries ───────────────────────────────────────────────────────────

/** All registered agents — used for leaderboard, profile lookups. Never filtered by pool status. */
export async function dbGetAllActiveAgents(): Promise<AgentRow[]> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("active", true);
  if (error) throw new Error(`[db] getActiveAgents: ${error.message}`);
  return data ?? [];
}

/** Agents that have opted into the pool and are ready to be matched. Used by matcher only. */
export async function dbGetAllInPoolAgents(): Promise<AgentRow[]> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("active", true)
    .eq("in_pool", true);
  if (error) throw new Error(`[db] getInPoolAgents: ${error.message}`);
  return data ?? [];
}

export async function dbGetAgent(wallet: string): Promise<AgentRow | null> {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("wallet", wallet.toLowerCase())
    .single();
  if (error && error.code !== "PGRST116") throw new Error(`[db] getAgent: ${error.message}`);
  return data ?? null;
}

export async function dbUpsertAgent(agent: AgentRow): Promise<void> {
  const { error } = await supabase
    .from("agents")
    .upsert({ ...agent, wallet: agent.wallet.toLowerCase() }, { onConflict: "wallet" });
  if (error) throw new Error(`[db] upsertAgent: ${error.message}`);
}

// ─── Date queries ─────────────────────────────────────────────────────────────

export async function dbGetDate(dateId: string): Promise<DateRow | null> {
  const { data, error } = await supabase
    .from("dates")
    .select("*")
    .eq("date_id", dateId)
    .single();
  if (error && error.code !== "PGRST116") throw new Error(`[db] getDate: ${error.message}`);
  return data ?? null;
}

export async function dbGetAgentDates(wallet: string): Promise<DateRow[]> {
  const w = wallet.toLowerCase();
  const { data, error } = await supabase
    .from("dates")
    .select("*")
    .or(`agent_a.eq.${w},agent_b.eq.${w}`)
    .order("scheduled_at", { ascending: false });
  if (error) throw new Error(`[db] getAgentDates: ${error.message}`);
  return data ?? [];
}

export async function dbUpsertDate(date: DateRow): Promise<void> {
  const { error } = await supabase
    .from("dates")
    .upsert(date, { onConflict: "date_id" });
  if (error) throw new Error(`[db] upsertDate: ${error.message}`);
}

export async function dbUpdateDate(dateId: string, patch: Partial<DateRow>): Promise<void> {
  let { error } = await supabase
    .from("dates")
    .update(patch)
    .eq("date_id", dateId);

  // Backward compatibility: older DBs may not yet have failure/refund columns.
  if (error && /column .* does not exist/i.test(error.message)) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { failure_reason, refund_status, refund_note, needs_user_mint, ...fallback } = patch;
    ({ error } = await supabase
      .from("dates")
      .update(fallback)
      .eq("date_id", dateId));
  }

  if (error) throw new Error(`[db] updateDate: ${error.message}`);
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export type LeaderboardEntry = {
  wallet: string;
  name: string;
  avatarUri: string;
  erc8004AgentId: string;
  selfclawVerified: boolean;
  datesCompleted: number;
  nftCount: number;
  uniquePartners: number;
  totalSpentCents: number;
  avgMatchScore: number;
  zestScore: number;
  badges: string[];
};

export async function dbGetLeaderboard(): Promise<LeaderboardEntry[]> {
  // 1. Fetch all completed dates
  const { data: dates, error: datesErr } = await supabase
    .from("dates")
    .select("agent_a, agent_b, cost_usd, nft_token_id")
    .eq("status", 2); // 2 = COMPLETED
  if (datesErr) throw new Error(`[db] getLeaderboard dates: ${datesErr.message}`);

  // 2. Fetch all match scores
  const { data: matches, error: matchErr } = await supabase
    .from("matches")
    .select("wallet_a, wallet_b, score");
  if (matchErr) throw new Error(`[db] getLeaderboard matches: ${matchErr.message}`);

  // 3. Fetch agents
  const { data: agents, error: agentsErr } = await supabase
    .from("agents")
    .select("wallet, name, avatar_uri, erc8004_agent_id, selfclaw_verified")
    .eq("active", true);
  if (agentsErr) throw new Error(`[db] getLeaderboard agents: ${agentsErr.message}`);

  // Per-agent stats from completed dates
  const stats = new Map<string, { dates: number; spent: number; nftCount: number; partners: Set<string> }>();
  for (const d of dates ?? []) {
    for (const [w, partner] of [[d.agent_a, d.agent_b], [d.agent_b, d.agent_a]] as [string, string][]) {
      if (!stats.has(w)) stats.set(w, { dates: 0, spent: 0, nftCount: 0, partners: new Set() });
      const s = stats.get(w)!;
      s.dates += 1;
      s.spent += Number(d.cost_usd ?? 0);
      if (d.nft_token_id) s.nftCount += 1;
      s.partners.add(partner);
    }
  }

  // Per-agent avg match score
  const matchScores = new Map<string, number[]>();
  for (const m of matches ?? []) {
    for (const w of [m.wallet_a, m.wallet_b]) {
      if (!matchScores.has(w)) matchScores.set(w, []);
      matchScores.get(w)!.push(m.score);
    }
  }

  // Build entries
  const entries: LeaderboardEntry[] = (agents ?? []).map((a) => {
    const s = stats.get(a.wallet) ?? { dates: 0, spent: 0, nftCount: 0, partners: new Set<string>() };
    const scores = matchScores.get(a.wallet) ?? [];
    const avgScore = scores.length
      ? Math.round(scores.reduce((acc, v) => acc + v, 0) / scores.length)
      : 0;
    const uniquePartners = s.partners.size;

    // Zest Score: weighted composite
    const zestScore =
      s.dates * 10 +
      s.nftCount * 15 +
      uniquePartners * 5 +
      Math.round(avgScore * 0.5);

    return {
      wallet: a.wallet,
      name: a.name,
      avatarUri: a.avatar_uri ?? "",
      erc8004AgentId: a.erc8004_agent_id,
      selfclawVerified: a.selfclaw_verified ?? false,
      datesCompleted: s.dates,
      nftCount: s.nftCount,
      uniquePartners,
      totalSpentCents: s.spent,
      avgMatchScore: avgScore,
      zestScore,
      badges: [],
    };
  });

  // Compute avg spend for "High Value" badge threshold
  const avgSpend = entries.length
    ? entries.reduce((acc, e) => acc + e.totalSpentCents, 0) / entries.length
    : 0;

  for (const e of entries) {
    const b: string[] = [];
    if (e.datesCompleted >= 1) b.push("First Date");
    if (e.datesCompleted >= 5) b.push("Dating Pro");
    if (e.nftCount >= 3) b.push("Memory Maker");
    if (e.nftCount >= 10) b.push("Hopeless Romantic");
    if (e.uniquePartners >= 5) b.push("Social Butterfly");
    if (e.avgMatchScore >= 85) b.push("Unmatched");
    if (e.datesCompleted >= 1 && e.totalSpentCents > avgSpend) b.push("High Value");
    e.badges = b;
  }

  return entries.sort((a, b) => b.zestScore - a.zestScore);
}

// ─── Contact reveals ──────────────────────────────────────────────────────────

export type ContactRevealRow = {
  wallet: string;
  telegram_handle: string;
  telegram_chat_id: string;
  email: string;
  phone: string;
  reveal_price_cents: number; // 0 = free after 3 dates, >0 = paid early reveal price
  updated_at?: string;
};

export async function dbGetContactReveal(wallet: string): Promise<ContactRevealRow | null> {
  const { data, error } = await supabase
    .from("contact_reveals")
    .select("*")
    .eq("wallet", wallet.toLowerCase())
    .single();
  if (error && error.code !== "PGRST116") throw new Error(`[db] getContactReveal: ${error.message}`);
  return data ?? null;
}

export async function dbUpsertContactReveal(row: Omit<ContactRevealRow, "updated_at">): Promise<void> {
  const { error } = await supabase
    .from("contact_reveals")
    .upsert(
      { ...row, wallet: row.wallet.toLowerCase(), updated_at: new Date().toISOString() },
      { onConflict: "wallet" }
    );
  if (error) throw new Error(`[db] upsertContactReveal: ${error.message}`);
}

/**
 * Returns true if this agent has any pending (0) or active (1) date with ANYONE.
 * Used to prevent an agent from going on two dates at the same time.
 */
export async function dbAgentHasActiveDate(wallet: string): Promise<boolean> {
  const w = wallet.toLowerCase();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("dates")
    .select("*", { count: "exact", head: true })
    .in("status", [0, 1])
    .gte("indexed_at", twoHoursAgo)
    .or(`agent_a.eq.${w},agent_b.eq.${w}`);
  return (count ?? 0) > 0;
}

/** Returns true if a pending (0) or active (1) date already exists between two agents,
 *  indexed within the last 2 hours. Older stuck rows are treated as expired.
 *  Uses `indexed_at` (see supabase/schema.sql — `dates` has no `created_at`). */
export async function dbHasActiveDateBetween(walletA: string, walletB: string): Promise<boolean> {
  const a = walletA.toLowerCase();
  const b = walletB.toLowerCase();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("dates")
    .select("*", { count: "exact", head: true })
    .in("status", [0, 1])
    .gte("indexed_at", twoHoursAgo)
    .or(
      `and(agent_a.eq.${a},agent_b.eq.${b}),and(agent_a.eq.${b},agent_b.eq.${a})`
    );
  return (count ?? 0) > 0;
}

/** Count completed dates between two specific agents. */
export async function dbCountCompletedDatesBetween(walletA: string, walletB: string): Promise<number> {
  const a = walletA.toLowerCase();
  const b = walletB.toLowerCase();
  const { count, error } = await supabase
    .from("dates")
    .select("*", { count: "exact", head: true })
    .eq("status", 2)
    .or(
      `and(agent_a.eq.${a},agent_b.eq.${b}),and(agent_a.eq.${b},agent_b.eq.${a})`
    );
  if (error) throw new Error(`[db] countCompletedDatesBetween: ${error.message}`);
  return count ?? 0;
}

// ─── Conversation store ───────────────────────────────────────────────────────

export async function dbSaveConversation(row: Omit<ConversationRow, "id" | "created_at">): Promise<void> {
  const { error } = await supabase.from("conversations").insert(row);
  if (error) throw new Error(`[db] saveConversation: ${error.message}`);
}

/** Append a single message to an ongoing conversation (creates record if needed). */
export async function dbAppendConversationMessage(
  walletA: string, walletB: string, msg: object
): Promise<void> {
  const a = walletA.toLowerCase();
  const b = walletB.toLowerCase();

  // Try to find existing live conversation (no passed flag yet = still running)
  // Check both orderings since wallet_a/wallet_b can be stored either way
  const { data: existing } = await supabase
    .from("conversations")
    .select("id, transcript")
    .eq("passed", false)
    .or(`and(wallet_a.eq.${a},wallet_b.eq.${b}),and(wallet_a.eq.${b},wallet_b.eq.${a})`)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    const messages = (existing.transcript as { messages?: object[] })?.messages ?? [];
    messages.push(msg);
    await supabase.from("conversations").update({ transcript: { messages } }).eq("id", existing.id);
  } else {
    await supabase.from("conversations").insert({
      wallet_a: a,
      wallet_b: b,
      transcript: { messages: [msg] },
      passed: false,
      shared_interests: [],
    });
  }
}

/** Mark all in-progress conversations between two agents as done and optionally store the proposed template + interests. */
export async function dbMarkConversationDone(
  walletA: string,
  walletB: string,
  passed: boolean,
  templateSuggested?: string,
  sharedInterests?: string[]
): Promise<void> {
  const a = walletA.toLowerCase();
  const b = walletB.toLowerCase();
  const patch: Record<string, unknown> = { passed };
  if (templateSuggested) patch.template_suggested = templateSuggested;
  if (sharedInterests?.length) patch.shared_interests = sharedInterests;
  await supabase
    .from("conversations")
    .update(patch)
    .eq("passed", false)
    .or(
      `and(wallet_a.eq.${a},wallet_b.eq.${b}),and(wallet_a.eq.${b},wallet_b.eq.${a})`
    );
}

/**
 * Returns true if this pair should be skipped for matching:
 * - Conversation currently in progress (passed=false, started within last 90 min), OR
 * - Conversation just finished but pending human approval (passed=true, template set, within 15 min)
 *
 * Conversations stuck for >90 min (passed=false) are treated as expired so the pair can re-match.
 */
export async function dbHasLiveConversationBetween(walletA: string, walletB: string): Promise<boolean> {
  const a = walletA.toLowerCase();
  const b = walletB.toLowerCase();
  const filter = `and(wallet_a.eq.${a},wallet_b.eq.${b}),and(wallet_a.eq.${b},wallet_b.eq.${a})`;

  // In-progress — only count if started within the last 90 minutes (prevents zombie blocks)
  const ninetyMinutesAgo = new Date(Date.now() - 90 * 60 * 1000).toISOString();
  const { count: inProgress } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("passed", false)
    .gte("created_at", ninetyMinutesAgo)
    .or(filter);
  if ((inProgress ?? 0) > 0) return true;

  // Pending follow-up (passed=true, template set, within 15 min) — but once booking
  // is marked complete we should not block rematching or keep showing "live" UI.
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: pendingRows } = await supabase
    .from("conversations")
    .select("transcript")
    .eq("passed", true)
    .not("template_suggested", "is", null)
    .gte("created_at", fifteenMinutesAgo)
    .or(filter);
  const hasPending = (pendingRows ?? []).some((r) => {
    const t = (r.transcript as Record<string, unknown>) ?? {};
    const bookingComplete = t.bookingComplete === true;
    const paymentApproval = (t.paymentApproval as Record<string, unknown> | undefined) ?? undefined;
    const approvalPending = paymentApproval?.status === "pending";
    const bookingPending = t.bookingPending === true;
    // Treat as live only while waiting for approval or booking completion.
    // Once completed, the pair should immediately re-enter the pool.
    return !bookingComplete && (approvalPending || bookingPending || !("bookingComplete" in t));
  });
  return hasPending;
}

/**
 * Get the most recent conversation for a wallet — either in-progress (passed=false, ≤90 min old)
 * OR recently finished and pending human approval (passed=true, within last 15 min).
 * Conversations older than 90 min with passed=false are considered stale/dead and ignored.
 */
export async function dbGetLiveConversation(wallet: string): Promise<ConversationRow | null> {
  const w = wallet.toLowerCase();
  const ninetyMinutesAgo = new Date(Date.now() - 90 * 60 * 1000).toISOString();
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  // First: any in-progress conversation started within the last 90 minutes
  const { data: live } = await supabase
    .from("conversations")
    .select("*")
    .or(`wallet_a.eq.${w},wallet_b.eq.${w}`)
    .eq("passed", false)
    .gte("created_at", ninetyMinutesAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (live) return live;

  // Fallback: recently completed, pending approval
  const { data: recent } = await supabase
    .from("conversations")
    .select("*")
    .or(`wallet_a.eq.${w},wallet_b.eq.${w}`)
    .eq("passed", true)
    .not("template_suggested", "is", null)
    .gte("created_at", fifteenMinutesAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (!recent) return null;
  const t = (recent.transcript as Record<string, unknown>) ?? {};
  // Completed booking should no longer be treated as a live conversation.
  if (t.bookingComplete === true) return null;
  return recent;
}

// ─── Match store ──────────────────────────────────────────────────────────────

export async function dbSaveMatches(rows: Omit<MatchRow, "id" | "created_at">[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await supabase.from("matches").insert(rows);
  if (error) throw new Error(`[db] saveMatches: ${error.message}`);
}
