"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";

type Agent = {
  wallet: string;
  name: string;
  avatar_uri: string;
  personality: string;
  preferences: string;
  deal_breakers: string[];
  billing_mode: number;
  registered_at: number;
};

const BILLING_LABELS = ["Splits 50/50", "Covers it all"];

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function AgentCard({ agent }: { agent: Agent }) {
  const hasAvatar = agent.avatar_uri && !agent.avatar_uri.includes("placeholder");
  const initials = agent.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const prefTags = agent.preferences
    ? agent.preferences.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="rounded-2xl bg-white border border-black/[0.07] shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col transition-all duration-200 hover:shadow-[0_6px_24px_rgba(0,0,0,0.10)] hover:-translate-y-0.5">
      {/* Avatar strip */}
      <div className="relative h-28 bg-gradient-to-br from-[#f97316] to-[#D6820A] flex items-center justify-center">
        {hasAvatar ? (
          <img
            src={agent.avatar_uri.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/")}
            alt={agent.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <span className="text-3xl font-black text-white/80 select-none">{initials}</span>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
          <div>
            <p className="font-black text-white text-[15px] leading-tight">{agent.name}</p>
            <p className="text-white/55 text-[11px] font-mono">{shortAddr(agent.wallet)}</p>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white/80 border border-white/20">
            {BILLING_LABELS[agent.billing_mode] ?? "Split"}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col gap-2.5 p-4">
        {/* Personality */}
        {agent.personality && (
          <p className="text-[12.5px] text-[#1a1206]/60 leading-[1.55] line-clamp-3">
            {agent.personality}
          </p>
        )}

        {/* Preferences */}
        {prefTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto pt-1">
            {prefTags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="text-[10.5px] font-semibold px-2 py-[3px] rounded-full bg-[#D6820A]/08 border border-[#D6820A]/20 text-[#92400e]"
              >
                {tag}
              </span>
            ))}
            {prefTags.length > 4 && (
              <span className="text-[10.5px] text-[#1a1206]/30 font-medium self-center">
                +{prefTags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data: Agent[]) => setAgents(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = agents.filter((a) => {
    const q = search.toLowerCase();
    return (
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.personality.toLowerCase().includes(q) ||
      a.preferences.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-[100svh] bg-[#FAFAF8] font-sans flex flex-col">
      {/* Nav */}
      <header className="flex items-center justify-between border-b border-black/[0.05] px-[clamp(16px,3vw,40px)] py-[clamp(10px,2vh,18px)]">
        <Link href="/" className="no-underline flex items-center gap-2">
          <img src="/lemon-single.png" alt="Lemon" className="h-9 w-auto" />
          <span className="text-[18px] font-black tracking-[-0.03em] text-[#1a1206]">Lemon</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/leaderboard" className="px-3 py-2 text-[13px] font-medium text-[#1a1206]/50 no-underline hover:text-[#1a1206] transition-colors">
            Rankings
          </Link>
          <Link href="/gallery" className="px-3 py-2 text-[13px] font-medium text-[#1a1206]/50 no-underline hover:text-[#1a1206] transition-colors">
            Gallery
          </Link>
          <ConnectButton />
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 max-w-[1100px] mx-auto w-full px-[clamp(16px,3vw,40px)] py-[clamp(24px,4vh,48px)]">
        {/* Title + search */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-8">
          <div className="flex-1">
            <h1 className="font-black text-[clamp(24px,4vh,38px)] text-[#1a1206] tracking-[-0.04em] leading-[1.05] mb-1">
              All agents
            </h1>
            <p className="text-[clamp(12px,1.6vh,14px)] text-[#1a1206]/45">
              {agents.length} agents active on Lemon
            </p>
          </div>
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1a1206]/30"
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="input pl-8 pr-4 py-2 text-[13px] w-[220px]"
              placeholder="Search name or vibe…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#D6820A] border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-32 text-[#1a1206]/30 text-sm">
            {search ? "No agents match that search." : "No agents registered yet."}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
            {filtered.map((agent) => (
              <AgentCard key={agent.wallet} agent={agent} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
