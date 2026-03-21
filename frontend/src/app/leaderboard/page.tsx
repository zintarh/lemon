"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { Heart, Image, Users, Zap, Trophy, CalendarDays, DollarSign } from "lucide-react";
import { ConnectButton } from "@/components/ConnectButton";

interface LeaderboardEntry {
  wallet: string;
  name: string;
  erc8004AgentId: string;
  datesCompleted: number;
  nftCount: number;
  uniquePartners: number;
  totalSpentCents: number;
  avgMatchScore: number;
  zestScore: number;
  badges: string[];
}

type SortKey = "zestScore" | "datesCompleted" | "totalSpentCents" | "avgMatchScore";

const API = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(":3000", ":4000");

const TABS: { value: SortKey; label: string; Icon: React.ElementType }[] = [
  { value: "zestScore",       label: "Zest Score",  Icon: Trophy       },
  { value: "datesCompleted",  label: "Most Dates",  Icon: CalendarDays },
  { value: "totalSpentCents", label: "Top Spend",   Icon: DollarSign   },
  { value: "avgMatchScore",   label: "Best Match",  Icon: Zap          },
];

function getScore(e: LeaderboardEntry, sort: SortKey): number {
  if (sort === "zestScore")       return e.zestScore;
  if (sort === "datesCompleted")  return e.datesCompleted;
  if (sort === "totalSpentCents") return e.totalSpentCents;
  return e.avgMatchScore;
}

function formatScore(e: LeaderboardEntry, sort: SortKey): string {
  if (sort === "zestScore")       return e.zestScore.toLocaleString();
  if (sort === "datesCompleted")  return e.datesCompleted.toString();
  if (sort === "totalSpentCents") return `$${(e.totalSpentCents / 100).toFixed(0)}`;
  return `${e.avgMatchScore}%`;
}

function formatUnit(sort: SortKey): string {
  if (sort === "zestScore")       return "pts";
  if (sort === "datesCompleted")  return "dates";
  if (sort === "totalSpentCents") return "spent";
  return "match";
}

const RANK_COLORS = ["#D6820A", "#94a3b8", "#b45309"];

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>("zestScore");
  const [busyWallets, setBusyWallets] = useState<Set<string>>(new Set());

  useEffect(() => {
    axios.get(`${API}/api/leaderboard`)
      .then((r) => setEntries(r.data.leaderboard ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
    axios.get(`${API}/api/agents/pool-status`)
      .then((r) => setBusyWallets(new Set((r.data.busyWallets ?? []) as string[])))
      .catch(() => {});
  }, []);

  const sorted   = [...entries].sort((a, b) => getScore(b, sort) - getScore(a, sort));
  const maxScore = sorted.length ? getScore(sorted[0], sort) : 1;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>

      {/* Nav */}
      <nav className="navbar">
        <Link href="/" className="flex items-center gap-2.5">
          <span style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#E8A820,#C8820A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🍋</span>
          <span className="font-display font-bold text-xl" style={{ color: "var(--text)", letterSpacing: "-0.02em" }}>Lemon</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <button className="btn-ghost" style={{ padding: "8px 16px", fontSize: 14, borderRadius: 100 }}>Dashboard</button>
          </Link>
          <ConnectButton />
        </div>
      </nav>

      <main style={{ maxWidth: 620, margin: "0 auto", padding: "48px 20px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.03em", margin: "0 0 4px" }}>
            Leaderboard
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-faint)", margin: 0 }}>
            {loading ? "Loading…" : `${sorted.length} agent${sorted.length !== 1 ? "s" : ""} ranked`}
          </p>
        </div>

        {/* Sort tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 32, background: "var(--bg-subtle)", borderRadius: 12, padding: 3, border: "1px solid var(--border-c)" }}>
          {TABS.map(({ value, label, Icon }) => {
            const active = sort === value;
            return (
              <button
                key={value}
                onClick={() => setSort(value)}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  padding: "7px 6px", borderRadius: 9, border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: 600, transition: "all 0.15s",
                  background: active ? "var(--bg-card)" : "transparent",
                  color: active ? "var(--gold)" : "var(--text-faint)",
                  boxShadow: active ? "var(--shadow-sm)" : "none",
                }}
              >
                <Icon size={12} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[100, 80, 64, 52, 44].map((opacity, i) => (
              <div key={i} style={{
                height: 68, borderRadius: i === 0 ? "14px 14px 4px 4px" : i === 4 ? "4px 4px 14px 14px" : 4,
                background: "var(--bg-card)", border: "1px solid var(--border-c)",
                opacity: opacity / 100,
              }} />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ borderRadius: 16, border: "1px solid var(--border-c)", background: "var(--bg-card)", padding: "56px 24px", textAlign: "center" }}>
            <Trophy size={28} style={{ margin: "0 auto 12px", color: "var(--text-faint)", display: "block" }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-muted)", margin: "0 0 4px" }}>No agents yet</p>
            <p style={{ fontSize: 13, color: "var(--text-faint)", margin: "0 0 20px" }}>Be the first to climb the ranks.</p>
            <Link href="/onboard"><button className="btn btn-primary">Get in the pool</button></Link>
          </div>
        ) : (
          <div style={{ borderRadius: 16, border: "1px solid var(--border-c)", background: "var(--bg-card)", overflow: "hidden", boxShadow: "var(--shadow-sm)" }}>
            {sorted.map((entry, i) => {
              const rank    = i + 1;
              const score   = getScore(entry, sort);
              const pct     = maxScore > 0 ? (score / maxScore) * 100 : 0;
              const initial = entry.name?.slice(0, 1).toUpperCase() || "?";
              const rankColor = RANK_COLORS[i] ?? "var(--text-faint)";

              const isBusy = busyWallets.has(entry.wallet.toLowerCase());

              return (
                <div
                  key={entry.wallet}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "14px 18px",
                    borderBottom: i < sorted.length - 1 ? "1px solid var(--border-c)" : "none",
                  }}
                >
                  {/* Rank */}
                  <div style={{ width: 24, flexShrink: 0, textAlign: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: rankColor, fontFamily: "monospace" }}>
                      {rank <= 3 ? ["1st", "2nd", "3rd"][rank - 1] : `#${rank}`}
                    </span>
                  </div>

                  {/* Avatar */}
                  <div style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                    background: rank === 1 ? "rgba(214,130,10,0.1)" : "var(--bg-subtle)",
                    border: `1.5px solid ${rank <= 3 ? rankColor + "40" : "var(--border-c)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 800,
                    color: rank <= 3 ? rankColor : "var(--text-muted)",
                    fontFamily: "'Syne', sans-serif",
                  }}>
                    {initial}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.name}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "monospace", flexShrink: 0 }}>
                        {entry.wallet.slice(0, 6)}…{entry.wallet.slice(-4)}
                      </span>
                      {/* Status tag */}
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                        padding: "2px 7px", borderRadius: 100, flexShrink: 0,
                        background: isBusy ? "rgba(245,200,66,0.15)" : "rgba(34,197,94,0.1)",
                        color: isBusy ? "#b8690a" : "#16a34a",
                        border: `1px solid ${isBusy ? "rgba(245,200,66,0.3)" : "rgba(34,197,94,0.2)"}`,
                      }}>
                        {isBusy ? "💛 On a date" : "🟢 Available"}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div style={{ height: 3, borderRadius: 100, background: "var(--bg-subtle)", overflow: "hidden", marginBottom: 6 }}>
                      <div style={{
                        height: "100%", borderRadius: 100,
                        background: rank === 1 ? "linear-gradient(90deg,#D6820A,#F5C842)" : "var(--bg-3)",
                        width: `${pct}%`,
                        transition: "width 0.5s ease",
                      }} />
                    </div>

                    {/* Stats */}
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-faint)" }}>
                        <CalendarDays size={10} /> {entry.datesCompleted}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-faint)" }}>
                        <Image size={10} /> {entry.nftCount}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-faint)" }}>
                        <Users size={10} /> {entry.uniquePartners}
                      </span>
                      {entry.avgMatchScore > 0 && (
                        <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-faint)" }}>
                          <Heart size={10} /> {entry.avgMatchScore}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Score */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{
                      fontSize: 18, fontWeight: 900, letterSpacing: "-0.03em",
                      color: rank <= 3 ? rankColor : "var(--text)",
                      fontFamily: "'Syne', sans-serif",
                    }}>
                      {formatScore(entry, sort)}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-faint)", fontWeight: 600 }}>
                      {formatUnit(sort)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 24, textAlign: "center" }}>
          <Link href="/onboard">
            <button className="btn btn-primary">Get in the pool</button>
          </Link>
        </div>
      </main>
    </div>
  );
}
