"use client";

import { useEffect, useState, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useReadContracts } from "wagmi";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@/components/ConnectButton";
import { LemonPulseLoader } from "@/components/LemonPulseLoader";
import { useAgentProfile, useIsRegistered } from "@/hooks/useAgentProfile";
import { useAgentDates, useDateRecord } from "@/hooks/useDates";
import {
  DATE_TEMPLATE_LABELS,
  LEMON_DATE_ADDRESS,
  lemonDateAbi,

} from "@/lib/contracts";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { motion } from "framer-motion";
import { toast } from "sonner";
import type { Address } from "viem";
import { avatarUriToDisplayUrlOrUndefined } from "@/lib/avatarUri";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

// ── Constants ────────────────────────────────────────────────────────────────

const DATE_EMOJIS: Record<number, string> = {
  0: "☕", 1: "🏖️", 2: "💼", 3: "🌆", 4: "🎨",
};

const STATUS_CONFIG: Record<number, { label: string; className: string; dot?: boolean }> = {
  0: { label: "Pending",   className: "bg-amber-50 text-amber-700 border-amber-200" },
  1: { label: "Active",    className: "bg-green-50 text-green-700 border-green-200",  dot: true },
  2: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  3: { label: "Cancelled", className: "bg-red-50 text-red-600 border-red-200" },
};

// ── Types ────────────────────────────────────────────────────────────────────

type DateRecord = {
  id: bigint;
  agentA: Address;
  agentB: Address;
  template: number;
  status: number;
  payerMode: number;
  costUSD: bigint;
  paymentToken: Address;
  payerA: Address;
  payerB: Address;
  nftTokenId: bigint;
  scheduledAt: bigint;
  completedAt: bigint;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function resolveAvatar(uri?: string | null): string | undefined {
  return avatarUriToDisplayUrlOrUndefined(uri);
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function useCountdown(scheduledAt: bigint | undefined) {
  const endMs = scheduledAt ? Number(scheduledAt) * 1000 + 30 * 60 * 1000 : 0;
  const [remaining, setRemaining] = useState(() =>
    endMs ? Math.max(0, (endMs - Date.now()) / 1000) : 1800
  );

  useEffect(() => {
    if (!endMs) return;
    const tick = () => setRemaining(Math.max(0, (endMs - Date.now()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endMs]);

  const progress = Math.min(100, ((1800 - remaining) / 1800) * 100);
  return { remaining, progress };
}

// ── Navbar ───────────────────────────────────────────────────────────────────

function DashNav({ name, avatarSrc }: { name?: string; avatarSrc?: string }) {
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] bg-[rgba(253,250,246,0.9)] px-6 py-3 backdrop-blur-[20px]">
      <Link href="/" className="flex items-center gap-1 no-underline">
        <img src="/lemon-single.png" alt="Lemon" className="h-8 w-auto" />
        <span className="text-[17px] font-black tracking-[-0.03em] text-[#1a1206] [font-family:Inter,sans-serif]">
          Lemon
        </span>
      </Link>
      <div className="flex items-center gap-3">
        {name && (
          <div className="flex items-center gap-2">
            <Avatar className="h-7 w-7 border border-[rgba(200,146,10,0.3)] bg-[rgba(248,230,130,0.4)]">
              {avatarSrc ? <AvatarImage src={avatarSrc} alt="" className="object-cover" /> : null}
              <AvatarFallback className="bg-transparent text-[11px] font-black text-[#92400e]">
                {name[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-[13px] font-semibold text-[#3d1f08] sm:block">{name}</span>
          </div>
        )}
        <ConnectButton />
      </div>
    </nav>
  );
}

// ── Stats ────────────────────────────────────────────────────────────────────

type AgentStats = {
  datesCompleted: number;
  nftCount: number;
  totalSpentCents: number;
  avgMatchScore: number;
  zestScore: number;
  badges: string[];
};

function StatsRow({ stats }: { stats: AgentStats | null }) {
  const items = [
    { v: stats?.datesCompleted?.toString() ?? "0", l: "Dates" },
    { v: stats?.nftCount?.toString() ?? "0",       l: "Memories" },
    { v: stats?.totalSpentCents ? `$${(stats.totalSpentCents / 100).toFixed(0)}` : "$0", l: "Spent" },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((s) => (
        <div
          key={s.l}
          className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-3 text-center shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
        >
          <div className="text-[22px] font-black tracking-[-0.03em] text-[#1a1206]">{s.v}</div>
          <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[rgba(26,18,6,0.38)]">{s.l}</div>
        </div>
      ))}
    </div>
  );
}

// ── DateCard ─────────────────────────────────────────────────────────────────

function DateCard({ dateId, myAddress }: { dateId: bigint; myAddress: Address }) {
  const { data: record } = useDateRecord(dateId) as { data: DateRecord | undefined };
  const partnerAddr = record
    ? (record.agentA.toLowerCase() === myAddress.toLowerCase() ? record.agentB : record.agentA) as Address
    : undefined;
  const { data: partnerProfile } = useAgentProfile(partnerAddr);

  if (!record) {
    return <div className="h-[68px] animate-pulse rounded-2xl bg-[rgba(0,0,0,0.04)]" />;
  }

  const s = STATUS_CONFIG[record.status] ?? STATUS_CONFIG[0];
  const ts = record.completedAt > 0n ? record.completedAt : record.scheduledAt;
  const dateStr = ts > 0n
    ? new Date(Number(ts) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  const partnerName = partnerProfile?.name ?? shortAddr(partnerAddr ?? "0x0000");
  const avatar = resolveAvatar(partnerProfile?.avatarURI);

  return (
    <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-[rgba(0,0,0,0.025)] transition-colors text-left">
      {/* Avatar */}
      <div className="shrink-0 relative">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={partnerName} className="w-11 h-11 rounded-full object-cover" />
        ) : (
          <div className="w-11 h-11 rounded-full bg-amber-100 flex items-center justify-center text-[15px] font-bold text-amber-700">
            {partnerName[0]}
          </div>
        )}
        <span className="absolute -bottom-0.5 -right-0.5 text-[13px]">{DATE_EMOJIS[record.template] ?? "🍋"}</span>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-[14px] font-semibold text-[#1a1206] truncate">{partnerName}</span>
          <span className="text-[11px] text-[rgba(26,18,6,0.35)] shrink-0">{dateStr}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] text-[rgba(26,18,6,0.45)] truncate">
            {DATE_TEMPLATE_LABELS[record.template] ?? "Date"}
          </span>
          <Badge className={`shrink-0 rounded-full border px-2 py-0 text-[10px] font-semibold ${s.className}`}>
            {s.dot && <span className="mr-1 inline-block h-[5px] w-[5px] animate-pulse rounded-full bg-green-500" />}
            {s.label}
          </Badge>
        </div>
      </div>
    </button>
  );
}

// ── Active Date Panel ─────────────────────────────────────────────────────────

function ActiveDatePanel({ dateId, myAddress }: { dateId: bigint; myAddress: Address }) {
  const { data: record } = useDateRecord(dateId) as { data: DateRecord | undefined };
  const { remaining, progress } = useCountdown(record?.scheduledAt);
  const { data: myProfile } = useAgentProfile(myAddress);
  const partnerAddr =
    record
      ? record.agentA.toLowerCase() === myAddress.toLowerCase()
        ? record.agentB
        : record.agentA
      : undefined;
  const { data: partnerProfile } = useAgentProfile(partnerAddr);

  if (!record) {
    return (
      <div className="flex h-full items-center justify-center">
        <LemonPulseLoader className="h-10 w-10" />
      </div>
    );
  }

  const myAvatar = resolveAvatar(myProfile?.avatarURI);
  const partnerAvatar = resolveAvatar(partnerProfile?.avatarURI);

  const isDone = remaining === 0;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-[2px] text-[11px] font-bold uppercase tracking-[0.1em] text-[rgba(26,18,6,0.35)]">
            Live Conversation
          </p>
          <h2 className="text-[20px] font-bold tracking-[-0.02em] text-[#1a1206]">
            {DATE_EMOJIS[record.template]} {DATE_TEMPLATE_LABELS[record.template] ?? "Date"}
          </h2>
        </div>
        {!isDone ? (
          <div className="flex items-center gap-[6px] rounded-full border border-green-200 bg-green-50 px-3 py-[5px]">
            <span className="h-[6px] w-[6px] animate-pulse rounded-full bg-green-500" />
            <span className="text-[12px] font-semibold text-green-700">In Progress</span>
          </div>
        ) : (
          <div className="flex items-center gap-[6px] rounded-full border border-emerald-200 bg-emerald-50 px-3 py-[5px]">
            <span className="text-[12px] font-semibold text-emerald-700">✓ Complete</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-6 rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white py-6">
        <div className="flex flex-col items-center gap-2">
          <Avatar className="h-14 w-14 border-2 border-[rgba(200,146,10,0.3)] bg-[rgba(248,230,130,0.4)]">
            {myAvatar ? <AvatarImage src={myAvatar} alt="" className="object-cover" /> : null}
            <AvatarFallback className="bg-transparent text-[20px] font-black text-[#92400e]">
              {myProfile?.name?.[0]?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
          <span className="max-w-[90px] truncate text-[12px] font-semibold text-[#3d1f08]">
            {myProfile?.name ?? shortAddr(myAddress)}
          </span>
          <span className="text-[10px] text-[rgba(26,18,6,0.35)]">You</span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <div className="rounded-full bg-[rgba(214,130,10,0.1)] px-3 py-1 text-[13px] font-black text-[#D6820A]">
            vs
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <Avatar className="h-14 w-14 border-2 border-[rgba(99,102,241,0.3)] bg-[rgba(99,102,241,0.08)]">
            {partnerAvatar ? <AvatarImage src={partnerAvatar} alt="" className="object-cover" /> : null}
            <AvatarFallback className="bg-transparent text-[20px] font-black text-indigo-600">
              {partnerProfile?.name?.[0]?.toUpperCase() ?? "?"}
            </AvatarFallback>
          </Avatar>
          <span className="max-w-[90px] truncate text-[12px] font-semibold text-[#3d1f08]">
            {partnerProfile?.name ?? (partnerAddr ? shortAddr(partnerAddr) : "…")}
          </span>
          <span className="text-[10px] text-[rgba(26,18,6,0.35)]">Partner</span>
        </div>
      </div>

      <div className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[rgba(26,18,6,0.45)]">
            {isDone ? "Conversation complete" : "Time remaining"}
          </span>
          <span
            className={`text-[22px] font-black tracking-[-0.03em] ${
              isDone ? "text-emerald-600" : "text-[#D6820A]"
            }`}
          >
            {isDone ? "00:00" : formatTime(remaining)}
          </span>
        </div>
        <Progress value={progress} className="h-[6px]" />
        <p className="mt-2 text-[11px] text-[rgba(26,18,6,0.28)]">
          30-minute conversation · Date #{dateId.toString()}
        </p>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white">
        <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-[rgba(26,18,6,0.35)]">
            Conversation Log
          </p>
          <span className="text-[11px] text-[rgba(26,18,6,0.3)]">Powered by Claude</span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          {!isDone ? (
            <>
              <div className="flex gap-[6px]">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="h-2 w-2 rounded-full bg-[#D6820A]"
                    animate={{ y: [0, -6, 0] }}
                    transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.15 }}
                  />
                ))}
              </div>
              <p className="text-[14px] font-medium text-[rgba(26,18,6,0.5)]">
                Agents are conversing…
              </p>
              <p className="max-w-[220px] text-[12px] leading-[1.6] text-[rgba(26,18,6,0.28)]">
                The full conversation transcript will be available once the date completes.
              </p>
            </>
          ) : (
            <>
              <span className="text-[32px]">🎉</span>
              <p className="text-[15px] font-semibold text-[#1a1206]">Date completed!</p>
              <p className="max-w-[220px] text-[12px] leading-[1.6] text-[rgba(26,18,6,0.35)]">
                A memory NFT has been minted and the match has been sealed on-chain.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#FAFAF8] px-4 py-3">
        <span className="text-[13px] text-[rgba(26,18,6,0.45)]">Date cost</span>
        <span className="text-[15px] font-bold text-[#1a1206]">
          ${(Number(record.costUSD) / 100).toFixed(2)}
        </span>
      </div>
    </div>
  );
}

// ── Live Conversation Panel ───────────────────────────────────────────────────

type LiveMessage = {
  speaker: "A" | "B";
  text: string;
  timestamp: number;
  dealBreakerFlagged?: string | null;
  phase?: "chat" | "proposal" | "accepted";
};

type LiveConvoData = {
  wallet_a: string;
  wallet_b: string;
  passed: boolean;
  template_suggested?: string | null;
  shared_interests?: string[];
  transcript: { messages: LiveMessage[] };
  bookingError?: string | null;
  bookingPending?: boolean;
  bookingComplete?: boolean;
  isStale?: boolean;
  lastMessageAt?: number | null;
};

const DATE_TEMPLATE_DETAILS: Record<string, { emoji: string; label: string; description: string; cost: string; costCents: number }> = {
  COFFEE:         { emoji: "☕", label: "Coffee Date",       description: "A relaxed cafe meetup to get to know each other",         cost: "$0.50", costCents: 50  },
  BEACH:          { emoji: "🏖️", label: "Beach Day",         description: "An outdoor, breezy day by the water",                     cost: "$0.75", costCents: 75  },
  WORK:           { emoji: "💼", label: "Co-Work Session",   description: "A productive afternoon working side by side",             cost: "$0.50", costCents: 50  },
  ROOFTOP_DINNER: { emoji: "🌆", label: "Rooftop Dinner",    description: "An elevated dining experience under the city lights",     cost: "$1.00", costCents: 100 },
  GALLERY_WALK:   { emoji: "🎨", label: "Gallery Walk",      description: "Exploring art galleries and scenic streets together",     cost: "$0.75", costCents: 75  },
};

function TypingIndicator({ name, avatar, isA }: { name: string; avatar?: string; isA: boolean }) {
  return (
    <div className={`flex items-end gap-2 ${isA ? "" : "flex-row-reverse"}`}>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt={name} className="shrink-0 w-7 h-7 rounded-full object-cover" />
      ) : (
        <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${isA ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>{name[0]}</div>
      )}
      <div className={`flex flex-col gap-0.5 ${isA ? "items-start" : "items-end"}`}>
        <span className="text-[10px] text-[rgba(26,18,6,0.35)] font-medium">{name} typing...</span>
        <div className={`rounded-2xl px-3.5 py-2.5 ${isA ? "bg-white border border-[rgba(0,0,0,0.07)]" : "bg-[rgba(99,102,241,0.08)] border border-[rgba(99,102,241,0.12)]"}`}>
          <span className="flex gap-1 items-center h-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[rgba(26,18,6,0.3)] animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-[rgba(26,18,6,0.3)] animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 rounded-full bg-[rgba(26,18,6,0.3)] animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ msg, isA, avatar, name }: { msg: LiveMessage; isA: boolean; avatar?: string; name: string }) {
  if (msg.phase === "proposal") {
    return (
      <div className={`flex items-end gap-2 ${isA ? "" : "flex-row-reverse"}`}>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={name} className="shrink-0 w-7 h-7 rounded-full object-cover" />
        ) : (
          <div className="shrink-0 w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-[11px] font-bold text-amber-700">{name[0]}</div>
        )}
        <div className={`max-w-[62%] flex flex-col gap-1 ${isA ? "items-start" : "items-end"}`}>
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-amber-600">Date proposal 💛</span>
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-[13.5px] leading-[1.55] font-[390] text-[#2a1a06]">
            {msg.text}
          </div>
        </div>
      </div>
    );
  }

  if (msg.phase === "accepted") {
    return (
      <div className={`flex items-end gap-2 ${isA ? "" : "flex-row-reverse"}`}>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={name} className="shrink-0 w-7 h-7 rounded-full object-cover" />
        ) : (
          <div className="shrink-0 w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-[11px] font-bold text-indigo-700">{name[0]}</div>
        )}
        <div className={`max-w-[62%] flex flex-col gap-1 ${isA ? "items-start" : "items-end"}`}>
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-600">They said yes! 💚</span>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-[13.5px] leading-[1.55] font-[390] text-[#1a3a2a]">
            {msg.text}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-2 ${isA ? "" : "flex-row-reverse"}`}>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt={name} className="shrink-0 w-7 h-7 rounded-full object-cover" />
      ) : (
        <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${isA ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"}`}>{name[0]}</div>
      )}
      <div className={`max-w-[62%] flex flex-col gap-0.5 ${isA ? "items-start" : "items-end"}`}>
        {msg.dealBreakerFlagged && (
          <span className="text-[10px] text-red-400 font-medium">⚠ deal breaker flagged</span>
        )}
        <div className={`rounded-2xl px-3.5 py-2 text-[13.5px] leading-[1.55] font-[390] ${isA ? "bg-white border border-[rgba(0,0,0,0.07)] text-[#2a1a06]" : "bg-[rgba(99,102,241,0.08)] border border-[rgba(99,102,241,0.12)] text-[#2a1a06]"}`}>
          {msg.text}
        </div>
      </div>
    </div>
  );
}

function LiveConversationPanel({
  convo, nameA, nameB, avatarA, avatarB, myAddress,
}: {
  convo: LiveConvoData;
  nameA: string; nameB: string; avatarA?: string; avatarB?: string;
  myAddress?: Address;
}) {
  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";
  const MAX_CHAT_MESSAGES = 18;
  const messages: LiveMessage[] = convo.transcript?.messages ?? [];
  const chatMessages = messages.filter(m => !m.phase || m.phase === "chat");
  const hasProposal = messages.some(m => m.phase === "proposal");
  const hasAccepted = messages.some(m => m.phase === "accepted");
  const dealBreakerCount = messages.filter(m => m.dealBreakerFlagged).length;

  const bookingPending = convo.bookingPending ?? false;
  const bookingComplete = convo.bookingComplete ?? false;
  const bookingError = convo.bookingError ?? null;

  const [retrying, setRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const amIwallet_a = myAddress?.toLowerCase() === convo.wallet_a.toLowerCase();
  const partnerName = amIwallet_a ? nameB : nameA;

  async function handleRetry() {
    setRetrying(true);
    try {
      const r = await fetch(`${SERVER_URL}/api/date/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletA: convo.wallet_a, walletB: convo.wallet_b }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        toast.error("Retry failed", { description: (err as { error?: string }).error ?? r.statusText });
      }
    } catch {
      toast.error("Could not reach server");
    }
    setRetrying(false);
  }

  async function handleRematch() {
    try {
      await fetch(`${SERVER_URL}/api/date/rematch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletA: convo.wallet_a, walletB: convo.wallet_b }),
      });
      toast.success(`Starting new conversation with ${partnerName}…`);
      setDismissed(true);
    } catch {
      toast.error("Could not reach server");
    }
  }

  const clampedCount = Math.min(chatMessages.length, MAX_CHAT_MESSAGES);
  const chatProgress = Math.round((clampedCount / MAX_CHAT_MESSAGES) * 100);

  const templateDetail = DATE_TEMPLATE_DETAILS[convo.template_suggested ?? ""] ?? null;

  // A conversation is stale if the server flagged it, OR if we locally haven't
  // seen a new message in >5 min (belt-and-suspenders in case server is slow to update)
  const lastMsgTs = convo.lastMessageAt ?? (messages.length > 0 ? messages[messages.length - 1].timestamp : 0);
  const isStale = convo.isStale || (!convo.passed && messages.length > 0 && lastMsgTs > 0 && Date.now() - lastMsgTs > 5 * 60 * 1000);

  // Only show typing if the conversation is actively progressing:
  // last message arrived < 90s ago, not stale, not passed, no deal breakers, no proposal yet
  const showTyping = messages.length > 0
    && !convo.passed
    && !isStale
    && dealBreakerCount < 3
    && !hasProposal
    && lastMsgTs > 0
    && Date.now() - lastMsgTs < 90_000;

  const phaseLabel = isStale
    ? "⚠️ Conversation stalled"
    : convo.passed && bookingError
    ? "⚠️ Booking failed"
    : convo.passed && bookingPending
    ? "✨ Booking your date…"
    : convo.passed && bookingComplete
    ? "✓ Date booked!"
    : convo.passed
    ? "💛 Agents hit it off!"
    : hasProposal
    ? "Proposing date…"
    : dealBreakerCount >= 3
    ? "No match"
    : chatMessages.length >= MAX_CHAT_MESSAGES
    ? "Wrapping up…"
    : "Getting to know each other";

  return (
    <div className="flex h-full flex-col gap-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {isStale ? (
            <span className="flex h-2 w-2 rounded-full bg-amber-400" />
          ) : convo.passed && bookingError ? (
            <span className="flex h-2 w-2 rounded-full bg-red-400" />
          ) : convo.passed && bookingComplete ? (
            <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
          ) : convo.passed ? (
            <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          ) : dealBreakerCount >= 3 ? (
            <span className="flex h-2 w-2 rounded-full bg-red-400" />
          ) : (
            <span className="flex h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          )}
          <p className="text-[14px] font-semibold text-[#1a1206]">{phaseLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          {dealBreakerCount > 0 && (
            <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border ${dealBreakerCount >= 3 ? "text-red-600 bg-red-100 border-red-300" : "text-red-500 bg-red-50 border-red-200"}`}>
              ⚠ {dealBreakerCount}/3 flags
            </span>
          )}
          <span className="text-[12px] text-[rgba(26,18,6,0.4)]">{clampedCount} / {MAX_CHAT_MESSAGES}</span>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="h-1 rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden shrink-0">
        <div
          className={`h-full rounded-full transition-all duration-500 ${convo.passed ? "bg-amber-400" : dealBreakerCount >= 3 ? "bg-red-300" : "bg-green-400"}`}
          style={{ width: `${convo.passed ? 100 : chatProgress}%` }}
        />
      </div>

      {/* ── Chat window ── */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col-reverse rounded-2xl border border-[rgba(0,0,0,0.06)] bg-[#FDFAF6] px-3 py-3 gap-2.5">
        {/* Typing indicator — first in DOM = bottom of flex-col-reverse = most recent position */}
        {showTyping && (() => {
          const lastSpeaker = messages[messages.length - 1].speaker;
          const nextIsA = lastSpeaker === "B";
          return (
            <TypingIndicator
              name={nextIsA ? nameA : nameB}
              avatar={nextIsA ? avatarA : avatarB}
              isA={nextIsA}
            />
          );
        })()}

        {/* Stalled banner — conversation died before completing */}
        {isStale && (
          <div className="flex items-center gap-2 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            <span>⚠️</span>
            <span>Conversation stalled — a new one will start automatically on the next match cycle.</span>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="flex items-center gap-2 text-[14px] text-[rgba(26,18,6,0.4)]">
            <LemonPulseLoader className="h-5 w-5 shrink-0" />
            Starting conversation…
          </div>
        ) : [...messages].reverse().map((msg, i) => {
          const isA = msg.speaker === "A";
          return (
            <ChatBubble
              key={i}
              msg={msg}
              isA={isA}
              avatar={isA ? avatarA : avatarB}
              name={isA ? nameA : nameB}
            />
          );
        })}
      </div>

      {/* ── Booking status card ── */}
      {convo.passed && templateDetail && !dismissed && (
        <div className={`shrink-0 rounded-2xl border p-4 flex flex-col gap-3 ${
          bookingError ? "border-red-200 bg-red-50"
          : bookingComplete ? "border-emerald-200 bg-emerald-50"
          : "border-amber-200 bg-amber-50"
        }`}>
          {/* Template + cost */}
          <div className="flex items-center gap-3">
            <span className="text-2xl">{templateDetail.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-bold text-[#1a1206]">{templateDetail.label}</p>
              {bookingError ? (
                <p className="text-[11px] text-red-500 leading-snug truncate">Failed — {bookingError}</p>
              ) : bookingPending ? (
                <p className="text-[11px] text-amber-700 leading-snug">Agent is booking the date…</p>
              ) : bookingComplete ? (
                <p className="text-[11px] text-emerald-600 leading-snug">Date booked! Memory NFT minted. 🎉</p>
              ) : (
                <p className="text-[11px] text-amber-700 leading-snug">Agents agreed — booking in progress…</p>
              )}
            </div>
            <div className="text-right shrink-0">
              <p className="text-[15px] font-black text-[#D6820A]">{templateDetail.cost}</p>
              <p className="text-[9px] text-[rgba(26,18,6,0.4)]">cUSD</p>
            </div>
          </div>

          {/* Spinner while booking */}
          {bookingPending && !bookingError && (
            <div className="flex items-center gap-2">
              <LemonPulseLoader className="h-4 w-4 shrink-0" />
              <p className="text-[11px] text-[rgba(26,18,6,0.45)]">Booking on-chain + minting NFT… ~30s</p>
            </div>
          )}

          {/* Retry on error */}
          {bookingError && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              className="w-full rounded-xl bg-red-500 py-2 text-[13px] font-bold text-white disabled:opacity-50 cursor-pointer hover:bg-red-600 transition-colors"
            >
              {retrying ? "Retrying…" : "Retry booking"}
            </button>
          )}

          {/* Rematch after success */}
          {bookingComplete && (
            <div className="flex gap-2">
              {partnerName && (
                <button
                  onClick={handleRematch}
                  className="flex-1 rounded-xl border border-amber-300 bg-amber-100 py-2 text-[12px] font-bold text-amber-800 cursor-pointer hover:bg-amber-200 transition-colors"
                >
                  💛 Date {partnerName} again
                </button>
              )}
              <button
                onClick={() => setDismissed(true)}
                className="flex-1 rounded-xl border border-[rgba(0,0,0,0.1)] bg-white py-2 text-[12px] font-semibold text-[rgba(26,18,6,0.55)] cursor-pointer hover:bg-[rgba(0,0,0,0.03)] transition-colors"
              >
                🔍 Back to pool
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Idle Panel ────────────────────────────────────────────────────────────────

type PoolStatus = { total: number; verified: number; busy: number; available: number; totalDates: number };

function IdlePanel({ name }: { name?: string }) {
  const [pool, setPool] = useState<PoolStatus | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [checking, setChecking] = useState(false);

  const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

  async function triggerMatch() {
    setChecking(true);
    try {
      const res = await fetch("/api/match/run", { method: "POST" });
      setLastChecked(new Date());
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const matched = (data as { matched?: number }).matched ?? 0;
        if (matched > 0) {
          toast.success(`Matched! Starting ${matched} date${matched !== 1 ? "s" : ""}…`);
        } else {
          toast.info("No new matches right now — check back in a few minutes.");
        }
      }
      // Refresh pool status
      const r = await fetch(`${SERVER}/api/agents/pool-status`);
      if (r.ok) setPool(await r.json());
    } catch {
      toast.error("Could not reach the matching server.");
    }
    setChecking(false);
  }

  useEffect(() => {
    let failures = 0;
    let id: ReturnType<typeof setInterval>;
    const safeFetchPool = async () => {
      try {
        const r = await fetch(`${SERVER}/api/agents/pool-status`);
        if (!r.ok) { failures++; return; }
        failures = 0;
        setPool(await r.json());
      } catch {
        failures++;
        if (failures === 2) {
          clearInterval(id);
          id = setInterval(safeFetchPool, 60_000); // slow to 1 min when server is down
        }
      }
    };
    safeFetchPool();
    id = setInterval(safeFetchPool, 15_000);
    return () => clearInterval(id);
  }, []);

  // Determine which state to show
  const { total = 0, available = 0 } = pool ?? {};
  const othersAvailable = Math.max(0, available - 1); // exclude self, floor at 0

  type IdleState = "loading" | "no-agents" | "only-you" | "looking";
  const state: IdleState = !pool
    ? "loading"
    : total <= 1
    ? "no-agents"
    : othersAvailable <= 0
    ? "only-you"
    : "looking";

  const content: Record<IdleState, { emoji: string; title: string; subtitle: string; showButton: boolean }> = {
    "loading": {
      emoji: "🍋",
      title: "Checking the pool…",
      subtitle: "Fetching live pool status.",
      showButton: false,
    },
    "no-agents": {
      emoji: "🍋",
      title: "You're the first one here!",
      subtitle: "No other agents have joined yet. Share Lemon with a friend to start matching.",
      showButton: false,
    },
    "only-you": {
      emoji: "🍋",
      title: "Waiting for more agents",
      subtitle: `Only ${total} agent${total !== 1 ? "s" : ""} registered so far. Matching starts automatically once more join.`,
      showButton: false,
    },
    "looking": {
      emoji: "🔍",
      title: "Looking for a match",
      subtitle: `${name ?? "Your agent"} is in the pool with ${othersAvailable} other agent${othersAvailable !== 1 ? "s" : ""}. Matching runs automatically every few minutes.`,
      showButton: true,
    },
  };

  const { emoji, title, subtitle, showButton } = content[state];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
      <motion.div
        className="text-5xl"
        animate={{ y: [0, -8, 0] }}
        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
      >
        {emoji}
      </motion.div>

      <div>
        <h3 className="mb-2 text-[20px] font-bold tracking-[-0.02em] text-[#1a1206]">{title}</h3>
        <p className="max-w-[280px] text-[13px] leading-[1.65] text-[rgba(26,18,6,0.45)]">{subtitle}</p>
      </div>

      {pool && (
        <div className="flex items-center gap-3 rounded-2xl border border-[rgba(0,0,0,0.06)] bg-white px-5 py-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[rgba(26,18,6,0.5)]">
            <span className="h-[7px] w-[7px] rounded-full bg-[rgba(0,0,0,0.15)]" />{total} registered
          </span>
          <span className="text-[rgba(26,18,6,0.15)]">·</span>
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600">
            <span className="h-[7px] w-[7px] rounded-full bg-emerald-400" />{pool.verified} verified
          </span>
          <span className="text-[rgba(26,18,6,0.15)]">·</span>
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-600">
            <span className="h-[7px] w-[7px] rounded-full bg-amber-400" />{pool.totalDates} dates
          </span>
        </div>
      )}

      {state === "only-you" && (
        <p className="text-[12px] text-[rgba(26,18,6,0.35)]">
          Invite a friend to join 🍋
        </p>
      )}

      {lastChecked && (
        <p className="text-[11px] text-[rgba(26,18,6,0.3)]">
          Last checked {lastChecked.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </p>
      )}

      {showButton && (
        <button
          onClick={triggerMatch}
          disabled={checking}
          className="rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-5 py-2 text-[13px] font-semibold text-[rgba(26,18,6,0.6)] shadow-[0_1px_4px_rgba(0,0,0,0.04)] transition-colors disabled:opacity-40 cursor-pointer hover:border-[#D6820A] hover:text-[#D6820A]"
        >
          {checking ? "Checking…" : "Check for match now"}
        </button>
      )}
    </div>
  );
}

// ── Reveal Section ────────────────────────────────────────────────────────────

type EligibilityResult = {
  partner: Address;
  eligible: boolean;
  datesCompleted: number;
  datesNeeded: number;
  theirPriceCents: number;
  theirHasTelegram: boolean;
  telegram?: string | null;
};

function RevealSection({ myAddress, partnerAddresses }: { myAddress: Address; partnerAddresses: Address[] }) {
  const [results, setResults] = useState<EligibilityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [paying, setPaying] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!partnerAddresses.length) return;
    setLoading(true);
    Promise.all(
      partnerAddresses.map(async (partner) => {
        try {
          const r = await fetch(`${SERVER}/api/contact/eligibility?myWallet=${myAddress}&theirWallet=${partner}`);
          const d = await r.json();
          return { partner, ...d } as EligibilityResult;
        } catch {
          return null;
        }
      })
    )
      .then((res) => setResults(res.filter(Boolean) as EligibilityResult[]))
      .finally(() => setLoading(false));
  }, [myAddress, partnerAddresses.join(",")]);

  async function reveal(partner: Address) {
    try {
      const r = await fetch(`${SERVER}/api/contact/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ myWallet: myAddress, theirWallet: partner }),
      });
      const d = await r.json();
      if (d.theirs?.telegram) setRevealed((prev) => ({ ...prev, [partner]: d.theirs.telegram }));
    } catch {}
  }

  const visible = results.filter((r) => r.datesCompleted >= 1 || r.eligible);
  if (loading || visible.length === 0) return null;

  return (
    <>
      <Separator className="bg-[rgba(0,0,0,0.06)]" />
      <div>
        <p className="mb-[2px] text-[11px] font-bold uppercase tracking-[0.1em] text-[rgba(26,18,6,0.35)]">
          Connections
        </p>
        <h2 className="mb-3 text-[20px] font-bold tracking-[-0.02em] text-[#1a1206]">Telegram Reveals</h2>
        <div className="flex flex-col gap-2">
          {visible.map((r) => {
            const short = `${r.partner.slice(0, 6)}…${r.partner.slice(-4)}`;
            const tel = revealed[r.partner];

            if (tel) {
              return (
                <div key={r.partner} className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                  <div>
                    <p className="text-[13px] font-semibold text-green-800">{short}</p>
                    <p className="text-[12px] text-green-600">@{tel}</p>
                  </div>
                  <a
                    href={`https://t.me/${tel}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12px] font-bold text-green-700 no-underline border border-green-300 rounded-full px-3 py-1 hover:bg-green-100 transition-colors"
                  >
                    Open chat
                  </a>
                </div>
              );
            }

            if (r.eligible) {
              return (
                <div key={r.partner} className="flex items-center justify-between rounded-xl border border-[rgba(0,0,0,0.06)] bg-white px-4 py-3">
                  <div>
                    <p className="text-[13px] font-semibold text-[#1a1206]">{short}</p>
                    <p className="text-[12px] text-[rgba(26,18,6,0.45)]">3 dates completed — ready to connect</p>
                  </div>
                  <button
                    onClick={() => reveal(r.partner)}
                    className="text-[12px] font-bold text-white bg-[#D6820A] border-none rounded-full px-3 py-1.5 cursor-pointer hover:bg-[#b8690a] transition-colors"
                  >
                    Reveal
                  </button>
                </div>
              );
            }

            return (
              <div key={r.partner} className="rounded-xl border border-[rgba(0,0,0,0.06)] bg-white px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[13px] font-semibold text-[#1a1206]">{short}</p>
                  <span className="text-[11px] text-[rgba(26,18,6,0.4)]">{r.datesCompleted}/3 dates</span>
                </div>
                <div className="h-1.5 rounded-full bg-[rgba(0,0,0,0.06)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#D6820A] transition-all"
                    style={{ width: `${(r.datesCompleted / 3) * 100}%` }}
                  />
                </div>
                {r.theirPriceCents > 0 && r.theirHasTelegram && (
                  <button
                    disabled={paying[r.partner]}
                    onClick={async () => {
                      setPaying((p) => ({ ...p, [r.partner]: true }));
                      // TODO: trigger wagmi sendTransaction for r.theirPriceCents to r.partner
                      // then call POST /api/contact/pay-reveal with txHash
                      setPaying((p) => ({ ...p, [r.partner]: false }));
                    }}
                    className="mt-2 text-[11px] font-semibold text-[#D6820A] bg-[rgba(214,130,10,0.08)] border border-[rgba(214,130,10,0.2)] rounded-full px-3 py-1 cursor-pointer hover:bg-[rgba(214,130,10,0.15)] transition-colors"
                  >
                    Pay ${(r.theirPriceCents / 100).toFixed(2)} to unlock early
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── History Panel ─────────────────────────────────────────────────────────────

function fireConfetti() {
  // Only run in browser
  if (typeof window === "undefined") return;
  import("canvas-confetti").then(({ default: confetti }) => {
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.55 }, colors: ["#D6820A", "#f59e0b", "#fcd34d", "#10b981", "#6366f1"] });
    setTimeout(() => confetti({ particleCount: 60, spread: 50, origin: { y: 0.5, x: 0.3 }, colors: ["#D6820A", "#fcd34d"] }), 250);
    setTimeout(() => confetti({ particleCount: 60, spread: 50, origin: { y: 0.5, x: 0.7 }, colors: ["#10b981", "#6366f1"] }), 400);
  });
}

const IS_MAINNET = process.env.NEXT_PUBLIC_NETWORK === "mainnet";
const REGISTRY_CONTRACT = IS_MAINNET
  ? "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
  : "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const CELOSCAN_BASE = IS_MAINNET
  ? "https://celoscan.io"
  : "https://sepolia.celoscan.io";

function IdentityBadge({ agentId }: { agentId: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(agentId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  const explorerUrl = `${CELOSCAN_BASE}/token/${REGISTRY_CONTRACT}?a=${agentId}`;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold shrink-0">✓</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">ChaosChain Identity</p>
        <p className="text-[11px] font-mono text-emerald-900 truncate">ID #{agentId}</p>
      </div>
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-emerald-400 hover:text-emerald-700 transition-colors"
        title="View on CeloScan"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
      </a>
      <button onClick={copy} className="shrink-0 text-emerald-400 hover:text-emerald-700 transition-colors" title="Copy ID">
        {copied ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        )}
      </button>
    </div>
  );
}

function GetIdentityCard({
  myAddress,
  SERVER_URL,
  onSuccess,
}: {
  myAddress: Address;
  SERVER_URL: string;
  onSuccess: (agentId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);

  async function registerIdentity() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/agents/${myAddress}/register-identity`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.erc8004AgentId && data.erc8004AgentId !== "0") {
        setAgentId(data.erc8004AgentId);
        onSuccess(data.erc8004AgentId);
        fireConfetti();
        toast.success("Identity registered on ChaosChain!", {
          description: `ERC-8004 Agent ID #${data.erc8004AgentId}`,
          duration: 6000,
        });
      } else {
        const msg = data.error ?? "Registration failed — try again later.";
        setError(msg);
        toast.error("Identity registration failed", { description: msg });
      }
    } catch {
      const msg = "Could not reach server — check your connection.";
      setError(msg);
      toast.error(msg);
    }
    setLoading(false);
  }

  if (agentId) {
    return <IdentityBadge agentId={agentId} />;
  }

  return (
    <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 flex flex-col gap-3">
      <div>
        <p className="text-[13px] font-bold text-[#1a1206] mb-0.5">⚠️ Your agent has no identity</p>
        <p className="text-[11.5px] text-[rgba(26,18,6,0.5)] leading-snug">
          The ChaosChain identity registration failed when your agent was created. Register now to give your agent an on-chain ERC-8004 identity.
        </p>
      </div>
      {error && (
        <p className="text-[11px] text-red-600 font-medium">{error}</p>
      )}
      <button
        onClick={registerIdentity}
        disabled={loading}
        className="rounded-xl bg-orange-500 py-2 text-[13px] font-bold text-white disabled:opacity-40 cursor-pointer hover:bg-orange-600 transition-colors"
      >
        {loading ? "Registering on ChaosChain…" : "Register Identity on ChaosChain"}
      </button>
    </div>
  );
}

function VerifyIdentityCard({ myAddress, SERVER_URL }: { myAddress: Address; SERVER_URL: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startVerification() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_URL}/api/agents/${myAddress}/selfclaw/retry`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to start verification");
        return;
      }

      if (data.verified) {
        setVerified(true);
        return;
      }

      // Server returns { qrData, deepLink } — show QR so user can scan
      const qr = data.qrData ?? data.qrUrl ?? data.qr_url ?? null;
      const link = data.deepLink ?? data.deep_link ?? null;

      if (!qr && !link) {
        setError("Could not get verification QR — check server logs");
        return;
      }

      setQrDataUrl(qr);
      setDeepLink(link);

      // Poll until verified
      const interval = setInterval(async () => {
        try {
          const r = await fetch(`${SERVER_URL}/api/agents/${myAddress}/selfclaw`);
          const d = await r.json();
          if (d.verified || d.selfclaw_verified) {
            clearInterval(interval);
            setVerified(true);
          }
        } catch { /* transient — keep polling */ }
      }, 4000);
    } catch (err) {
      setError((err as Error).message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }

  if (verified) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3">
        <span className="text-emerald-500 text-lg">✓</span>
        <div>
          <p className="text-[13px] font-semibold text-emerald-800">Identity verified!</p>
          <p className="text-[11px] text-emerald-600">Your agent now has on-chain reputation.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4 flex flex-col gap-3">
      <div>
        <p className="text-[13px] font-bold text-[#1a1206] mb-0.5">🪪 Verify your identity</p>
        <p className="text-[11.5px] text-[rgba(26,18,6,0.5)] leading-snug">
          Scan with the Self app to prove you&apos;re human and earn your agent&apos;s on-chain reputation.
        </p>
      </div>
      {error && (
        <p className="text-[11px] text-red-600 font-medium bg-red-50 rounded-lg px-2 py-1">{error}</p>
      )}
      {(qrDataUrl || deepLink) ? (
        <div className="flex flex-col items-center gap-2">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="Self verification QR code" className="w-64 h-64 rounded-xl border border-purple-200" />
          ) : (
            <a href={deepLink!} target="_blank" rel="noopener noreferrer"
              className="text-[12px] text-purple-700 underline break-all text-center">
              Open Self app link
            </a>
          )}
          <div className="w-full rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-center">
            <p className="text-[11px] font-bold text-amber-800">Open the Self app → tap Scan</p>
            <p className="text-[10px] text-amber-600 mt-0.5">Point the Self app scanner at this QR code to verify</p>
          </div>
          <div className="flex items-center gap-1.5">
            <LemonPulseLoader className="h-3.5 w-3.5 shrink-0" />
            <span className="text-[10px] text-purple-600">Polling for completion</span>
          </div>
        </div>
      ) : (
        <button
          onClick={startVerification}
          disabled={loading}
          className="rounded-xl bg-purple-600 py-2 text-[13px] font-bold text-white disabled:opacity-40 cursor-pointer hover:bg-purple-700 transition-colors"
        >
          {loading ? "Starting verification…" : "Verify with SelfClaw"}
        </button>
      )}
    </div>
  );
}

function SetupRevealCard({ myAddress }: { myAddress: Address }) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [telegram, setTelegram] = useState("");
  const [price, setPrice] = useState("150"); // cents
  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: myAddress,
          telegram_handle: telegram.replace(/^@+/, ""),
          email: "", phone: "",
          reveal_price_cents: parseInt(price) || 150,
        }),
      });
      if (res.ok) {
        setSaved(true);
        toast.success("Reveal info saved");
      } else {
        const j = await res.json().catch(() => ({}));
        toast.error("Could not save", { description: (j as { error?: string }).error ?? res.statusText });
      }
    } catch {
      toast.error("Could not reach server");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-3">
        <span className="text-emerald-500 text-lg">✓</span>
        <div>
          <p className="text-[13px] font-semibold text-emerald-800">Reveal info saved!</p>
          <p className="text-[11px] text-emerald-600">Matches can now find you after your agent dates.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-col gap-3">
      <div>
        <p className="text-[13px] font-bold text-[#1a1206] mb-0.5">💌 Set up your contact reveal</p>
        <p className="text-[11.5px] text-[rgba(26,18,6,0.5)] leading-snug">
          After a date, matches can pay to see your Telegram. Set your price or make it free after 3 dates.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          value={telegram}
          onChange={e => setTelegram(e.target.value)}
          placeholder="@yourtelegram"
          className="flex-1 rounded-xl border border-[rgba(0,0,0,0.1)] bg-white px-3 py-1.5 text-[13px] outline-none focus:border-amber-400"
        />
        <input
          value={price}
          onChange={e => setPrice(e.target.value)}
          placeholder="Price ¢"
          className="w-20 rounded-xl border border-[rgba(0,0,0,0.1)] bg-white px-3 py-1.5 text-[13px] outline-none focus:border-amber-400"
          type="number" min="0"
        />
      </div>
      <button
        onClick={save}
        disabled={!telegram.trim() || saving}
        className="rounded-xl bg-[#D6820A] py-2 text-[13px] font-bold text-white disabled:opacity-40 cursor-pointer hover:bg-[#b8690a] transition-colors"
      >
        {saving ? "Saving…" : "Save reveal info"}
      </button>
    </div>
  );
}

function HistoryPanel({
  dateIds,
  myAddress,
  stats,
  partnerAddresses,
}: {
  dateIds: bigint[];
  myAddress: Address;
  stats: AgentStats | null;
  partnerAddresses: Address[];
}) {
  const hasCompletedDate = (stats?.datesCompleted ?? 0) > 0;
  const [hasRevealInfo, setHasRevealInfo] = useState<boolean | null>(null);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [hasIdentity, setHasIdentity] = useState<boolean | null>(null);
  const [identityId, setIdentityId] = useState<string | null>(null);
  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

  useEffect(() => {
    fetch(`${SERVER_URL}/api/contact/${myAddress}`)
      .then(r => r.json())
      .then(d => setHasRevealInfo(!!(d.telegram_handle || d.email || d.phone)))
      .catch(() => setHasRevealInfo(false));
  }, [myAddress, SERVER_URL]);

  useEffect(() => {
    fetch(`${SERVER_URL}/api/agents/${myAddress}`)
      .then(r => r.json())
      .then(d => {
        const id = d.erc8004_agent_id;
        const hasId = !!(id && id !== "0");
        setHasIdentity(hasId);
        setIdentityId(hasId ? id : null);
        setIsVerified(!!(d.selfclaw_verified));
      })
      .catch(() => { setIsVerified(null); setHasIdentity(null); });
  }, [myAddress, SERVER_URL]);

  const handleIdentitySuccess = useCallback((agentId: string) => {
    setHasIdentity(true);
    setIdentityId(agentId);
  }, []);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto">
      {/* Stats */}
      <div>
        <p className="mb-[2px] text-[11px] font-bold uppercase tracking-[0.1em] text-[rgba(26,18,6,0.35)]">Overview</p>
        <h2 className="mb-3 text-[20px] font-bold tracking-[-0.02em] text-[#1a1206]">Your Stats</h2>
        <StatsRow stats={stats} />
        {/* Badges */}
        {stats?.badges && stats.badges.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stats.badges.map(b => (
              <span key={b} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                {b}
              </span>
            ))}
          </div>
        )}
      </div>

      <Separator className="bg-[rgba(0,0,0,0.06)]" />

      {/* Identity badge — always show when registered */}
      {hasIdentity === true && identityId && (
        <>
          <IdentityBadge agentId={identityId} />
          <Separator className="bg-[rgba(0,0,0,0.06)]" />
        </>
      )}

      {/* Get identity prompt — show if ERC-8004 registration failed */}
      {hasIdentity === false && (
        <>
          <GetIdentityCard myAddress={myAddress} SERVER_URL={SERVER_URL} onSuccess={handleIdentitySuccess} />
          <Separator className="bg-[rgba(0,0,0,0.06)]" />
        </>
      )}

      {/* Verify identity prompt — show if agent exists but not yet verified */}
      {hasIdentity !== false && isVerified === false && (
        <>
          <VerifyIdentityCard myAddress={myAddress} SERVER_URL={SERVER_URL} />
          <Separator className="bg-[rgba(0,0,0,0.06)]" />
        </>
      )}

      {/* Reveal setup prompt — show after first date if not yet set */}
      {hasCompletedDate && hasRevealInfo === false && (
        <>
          <SetupRevealCard myAddress={myAddress} />
          <Separator className="bg-[rgba(0,0,0,0.06)]" />
        </>
      )}

      <div className="flex items-center justify-between shrink-0">
        <div>
          <p className="mb-[2px] text-[11px] font-bold uppercase tracking-[0.1em] text-[rgba(26,18,6,0.35)]">
            All Dates
          </p>
          <h2 className="text-[20px] font-bold tracking-[-0.02em] text-[#1a1206]">Date History</h2>
        </div>
        <Link href="/leaderboard" className="text-[12px] font-bold text-[#D6820A] no-underline hover:underline">
          Leaderboard →
        </Link>
      </div>

      {dateIds.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <span className="text-[32px]">🍋</span>
          <p className="text-[14px] font-medium text-[rgba(26,18,6,0.45)]">No dates yet</p>
          <p className="max-w-[200px] text-[12px] text-[rgba(26,18,6,0.28)]">
            Your agent&apos;s date history will appear here once matched.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-2 pb-2">
            {[...dateIds].reverse().map((id) => (
              <DateCard key={id.toString()} dateId={id} myAddress={myAddress} />
            ))}
          </div>
        </div>
      )}

      <RevealSection myAddress={myAddress} partnerAddresses={partnerAddresses} />
    </div>
  );
}

// ── Not Connected ─────────────────────────────────────────────────────────────

function NotConnected() {
  return (
    <div className="flex min-h-screen flex-col bg-[#FDFAF6]">
      <nav className="navbar border-b border-[rgba(0,0,0,0.06)] bg-[rgba(253,250,246,0.9)] backdrop-blur-[20px]">
        <Link href="/" className="flex items-center gap-1 no-underline">
          <img src="/lemon-single.png" alt="Lemon" className="h-8 w-auto" />
          <span className="text-[17px] font-black tracking-[-0.03em] text-[#1a1206]">Lemon</span>
        </Link>
        <ConnectButton />
      </nav>
      <main className="flex flex-1 items-center justify-center px-5">
        <div className="flex w-full max-w-[360px] flex-col items-center gap-5 text-center">
          <img src="/lemon-single.png" alt="Lemon" className="h-16 w-16 object-contain" />
          <div>
            <p className="mb-2 text-[22px] font-bold tracking-[-0.02em] text-[#1a1206]">
              Connect to see your agent
            </p>
            <p className="text-[14px] leading-[1.6] text-[rgba(26,18,6,0.45)]">
              You need a connected wallet to view your dashboard.
            </p>
          </div>
          <ConnectButton />
        </div>
      </main>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { authenticated } = usePrivy();
  const { address } = useAccount();
  const { data: isRegistered, isLoading: regLoading } = useIsRegistered(address);
  const { data: profile } = useAgentProfile(address);
  const { data: dateIds } = useAgentDates(address);
  const allDateIds = (dateIds as bigint[] | undefined) ?? [];

  // Fetch stats from server (Supabase-backed leaderboard)
  const [agentStats, setAgentStats] = useState<AgentStats | null>(null);
  useEffect(() => {
    if (!address) return;
    fetch(`${SERVER}/api/leaderboard`)
      .then(r => r.json())
      .then(data => {
        const lb = (data.leaderboard ?? data) as Array<AgentStats & { wallet: string }>;
        const mine = lb.find(e => e.wallet.toLowerCase() === address.toLowerCase());
        setAgentStats(mine ?? null);
      })
      .catch(() => {});
  }, [address]);

  // Batch-fetch last 10 dates to find the active one
  const recentIds = allDateIds.slice(-10);
  const { data: recentRecords } = useReadContracts({
    contracts: recentIds.map((id) => ({
      address: LEMON_DATE_ADDRESS,
      abi: lemonDateAbi,
      functionName: "getDate" as const,
      args: [id] as [bigint],
    })),
    query: { enabled: recentIds.length > 0 },
  });

  const activeDateId = (() => {
    if (!recentRecords) return undefined;
    const idx = recentRecords.findIndex(
      (r) => r.result && (r.result as DateRecord).status === 1
    );
    return idx >= 0 ? recentIds[idx] : undefined;
  })();

  // Poll for live/pending conversation
  const [liveConvo, setLiveConvo] = useState<LiveConvoData | null>(null);
  const livePartnerAddr = liveConvo
    ? (liveConvo.wallet_a.toLowerCase() === address?.toLowerCase() ? liveConvo.wallet_b : liveConvo.wallet_a) as Address
    : undefined;
  const { data: livePartnerProfile } = useAgentProfile(livePartnerAddr);
  useEffect(() => {
    if (!address || activeDateId !== undefined) return;
    let failures = 0;
    let id: ReturnType<typeof setInterval>;
    const poll = async () => {
      try {
        const r = await fetch(`${SERVER}/api/conversation/live?wallet=${address}`);
        if (!r.ok) { failures++; return; }
        failures = 0;
        const data = await r.json();
        setLiveConvo(data ?? null);
      } catch {
        failures++;
        // Back off: slow poll to 15s after 3 consecutive failures (server likely down)
        if (failures === 3) {
          clearInterval(id);
          id = setInterval(poll, 15_000);
        }
      }
    };
    poll();
    id = setInterval(poll, 4_000);
    return () => clearInterval(id);
  }, [address, activeDateId]);

  // Unique partners from recent completed dates (for reveal eligibility checks)
  const partnerAddresses: Address[] = (() => {
    if (!recentRecords || !address) return [];
    const seen = new Set<string>();
    const partners: Address[] = [];
    for (const r of recentRecords) {
      const rec = r.result as DateRecord | undefined;
      if (!rec || rec.status !== 2) continue; // only completed dates
      const partner = rec.agentA.toLowerCase() === address.toLowerCase() ? rec.agentB : rec.agentA;
      if (!seen.has(partner.toLowerCase())) {
        seen.add(partner.toLowerCase());
        partners.push(partner);
      }
    }
    return partners;
  })();

  if (!authenticated) return <NotConnected />;

  // Redirect to onboard if wallet connected but agent not registered
  if (authenticated && address && !regLoading && isRegistered === false) {
    router.replace("/onboard");
    return null;
  }

  // address is guaranteed here because authenticated + registered implies wallet connected
  const myAddress = address ?? "0x0000000000000000000000000000000000000000" as Address;

  const sharedHistoryProps = {
    dateIds: allDateIds,
    myAddress,
    stats: agentStats,
    partnerAddresses,
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FDFAF6]">
      <DashNav name={profile?.name} avatarSrc={resolveAvatar(profile?.avatarURI)} />

      {/* ── Desktop two-column layout ── */}
      <div className="mx-auto hidden w-full max-w-[1200px] flex-1 gap-6 px-6 py-6 lg:flex">
        {/* Left: active date / idle */}
        <div className="flex flex-1 flex-col rounded-3xl border border-[rgba(0,0,0,0.06)] bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.05)]" style={{ maxHeight: "calc(100vh - 72px - 48px)", overflow: "hidden" }}>
          {activeDateId !== undefined ? (
            <ActiveDatePanel dateId={activeDateId} myAddress={myAddress} />
          ) : liveConvo ? (
            <LiveConversationPanel
              convo={liveConvo}
              nameA={profile?.name ?? liveConvo.wallet_a.slice(0, 6)}
              nameB={livePartnerProfile?.name ?? liveConvo.wallet_b.slice(0, 6)}
              avatarA={resolveAvatar(profile?.avatarURI)}
              avatarB={resolveAvatar(livePartnerProfile?.avatarURI)}
              myAddress={myAddress}
            />
          ) : (
            <IdlePanel name={profile?.name} />
          )}
        </div>

        {/* Right: history */}
        <div
          className="flex w-[380px] shrink-0 flex-col rounded-3xl border border-[rgba(0,0,0,0.06)] bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.05)]"
          style={{ maxHeight: "calc(100vh - 72px - 48px)", overflowY: "hidden" }}
        >
          <HistoryPanel {...sharedHistoryProps} />
        </div>
      </div>

      {/* ── Mobile tabbed layout ── */}
      <div className="flex flex-1 flex-col px-4 py-4 lg:hidden">
        <Tabs defaultValue={activeDateId !== undefined || liveConvo ? "live" : "history"}>
          <TabsList className="mb-4 w-full rounded-2xl bg-[rgba(0,0,0,0.04)] p-1">
            <TabsTrigger
              value="live"
              className="flex-1 rounded-xl text-[13px] font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              {activeDateId !== undefined && (
                <span className="mr-1.5 inline-block h-[6px] w-[6px] animate-pulse rounded-full bg-green-500" />
              )}
              Live Date
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="flex-1 rounded-xl text-[13px] font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="live">
            <div className="min-h-[520px] rounded-3xl border border-[rgba(0,0,0,0.06)] bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.05)]">
              {activeDateId !== undefined ? (
                <ActiveDatePanel dateId={activeDateId} myAddress={myAddress} />
              ) : liveConvo ? (
                <LiveConversationPanel
                  convo={liveConvo}
                  nameA={profile?.name ?? liveConvo.wallet_a.slice(0, 6)}
                  nameB={livePartnerProfile?.name ?? liveConvo.wallet_b.slice(0, 6)}
                  avatarA={resolveAvatar(profile?.avatarURI)}
                  avatarB={resolveAvatar(livePartnerProfile?.avatarURI)}
                  myAddress={myAddress}
                />
              ) : (
                <IdlePanel name={profile?.name} />
              )}
            </div>
          </TabsContent>

          <TabsContent value="history">
            <div className="rounded-3xl border border-[rgba(0,0,0,0.06)] bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.05)]">
              <HistoryPanel {...sharedHistoryProps} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
