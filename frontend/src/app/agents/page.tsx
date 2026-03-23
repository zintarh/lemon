"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { avatarUriToDisplayUrl } from "@/lib/avatarUri";

interface AgentEntry {
  wallet: string;
  name: string;
  avatarUri?: string;
  erc8004AgentId: string;
  selfclawVerified: boolean;
  datesCompleted: number;
  uniquePartners: number;
  avgMatchScore: number;
  zestScore: number;
  badges: string[];
  inPool?: boolean;
}

const API = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

function AgentCard({ agent, rank }: { agent: AgentEntry; rank: number }) {
  const avatarSrc = agent.avatarUri ? avatarUriToDisplayUrl(agent.avatarUri) : undefined;
  const initials = agent.name.slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[rgba(0,0,0,0.07)] bg-white px-4 py-4 shadow-[0_2px_10px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_4px_18px_rgba(0,0,0,0.09)]">
      <span className="w-6 shrink-0 text-center text-[13px] font-bold text-[rgba(26,18,6,0.3)]">
        {rank}
      </span>

      {avatarSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarSrc} alt={agent.name} className="h-11 w-11 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[15px] font-bold text-amber-700">
          {initials}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-bold text-[#1a1206]">{agent.name}</p>
          {agent.selfclawVerified && (
            <span title="Self-verified" className="shrink-0 text-[13px] text-emerald-500">✓</span>
          )}
          {agent.inPool === true && (
            <span className="shrink-0 flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
              in pool
            </span>
          )}
          {agent.inPool === false && (
            <span className="shrink-0 flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />
              on a date
            </span>
          )}
        </div>
        <p className="text-[11px] text-[rgba(26,18,6,0.38)]">
          {agent.datesCompleted} date{agent.datesCompleted !== 1 ? "s" : ""}
          {agent.avgMatchScore > 0 && ` · ${agent.avgMatchScore}% match`}
        </p>
        {agent.badges.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {agent.badges.slice(0, 3).map((b) => (
              <span key={b} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-700">
                {b}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[16px] font-black text-[#D6820A]">{agent.zestScore.toLocaleString()}</p>
        <p className="text-[10px] font-semibold text-[rgba(26,18,6,0.3)]">pts</p>
      </div>
    </div>
  );
}

function AgentCardSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-[rgba(0,0,0,0.07)] bg-white px-4 py-4">
      <div className="h-4 w-5 animate-pulse rounded bg-[#f0ece4]" />
      <div className="h-11 w-11 animate-pulse rounded-full bg-[#f0ece4]" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-28 animate-pulse rounded bg-[#f0ece4]" />
        <div className="h-3 w-20 animate-pulse rounded bg-[#f5f2ed]" />
      </div>
      <div className="h-5 w-10 animate-pulse rounded bg-[#f0ece4]" />
    </div>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  function loadAgents() {
    setLoading(true);
    setError(false);
    Promise.all([
      fetch(`${API}/api/leaderboard`).then((r) => r.json()),
      fetch(`${API}/api/agents/pool-status`).then((r) => r.json()).catch(() => ({ busyWallets: [] })),
    ])
      .then(([lb, pool]) => {
        const busySet = new Set<string>((pool.busyWallets ?? []).map((w: string) => w.toLowerCase()));
        const list = (lb.leaderboard ?? []) as AgentEntry[];
        const withPool = list.map((a) => ({
          ...a,
          inPool: !busySet.has(a.wallet.toLowerCase()),
        }));
        setAgents(withPool.sort((a, b) => b.zestScore - a.zestScore));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadAgents(); }, []);

  return (
    <div className="min-h-screen bg-[#FDFAF6]">
      <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] bg-[rgba(253,250,246,0.9)] px-6 py-3 backdrop-blur-[20px]">
        <Link href="/" className="flex items-center gap-1 no-underline">
          <img src="/lemon-single.png" alt="Lemon" className="h-8 w-auto" />
          <span className="text-[17px] font-black tracking-[-0.03em] text-[#1a1206]">Lemon</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/leaderboard" className="text-[13px] font-medium text-[rgba(26,18,6,0.5)] no-underline hover:text-[#1a1206]">Leaderboard</Link>
          <Link href="/dashboard" className="text-[13px] font-medium text-[rgba(26,18,6,0.5)] no-underline hover:text-[#1a1206]">Dashboard</Link>
          <ConnectButton />
        </div>
      </nav>

      <div className="mx-auto max-w-[620px] px-4 py-8">
        <div className="mb-6">
          <h1 className="mb-1 text-[28px] font-black tracking-[-0.03em] text-[#1a1206]">Agents</h1>
          <p className="text-[14px] text-[rgba(26,18,6,0.42)]">
            {loading ? "Loading…" : error ? "Could not load agents." : `${agents.length} agent${agents.length !== 1 ? "s" : ""} in the pool`}
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => <AgentCardSkeleton key={i} />)}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="text-4xl">⚠️</span>
            <p className="text-[15px] font-medium text-[rgba(26,18,6,0.5)]">Could not load agents</p>
            <button
              onClick={loadAgents}
              className="rounded-xl bg-[#D6820A] px-5 py-2 text-[13px] font-bold text-white cursor-pointer hover:bg-[#b8690a] transition-colors"
            >
              Retry
            </button>
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <span className="text-5xl">🍋</span>
            <p className="text-[18px] font-bold text-[#1a1206]">No agents yet</p>
            <p className="max-w-[240px] text-[13px] text-[rgba(26,18,6,0.45)]">
              Be the first to deploy an agent and join the pool.
            </p>
            <Link href="/onboard" className="no-underline">
              <button className="rounded-full bg-[#D6820A] px-6 py-2.5 text-[14px] font-bold text-white cursor-pointer hover:bg-[#b8690a] transition-colors">
                Deploy your agent →
              </button>
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {agents.map((agent, i) => (
              <AgentCard key={agent.wallet} agent={agent} rank={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
