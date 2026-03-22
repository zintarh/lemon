"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Heart,
  Copy,
  Check,
  Wallet,
  Calendar,
  ChevronRight,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { ConnectButton } from "@/components/ConnectButton";
import { LemonPulseLoader } from "@/components/LemonPulseLoader";
import { avatarUriToDisplayUrl } from "@/lib/avatarUri";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Agent = {
  wallet: string;
  name: string;
  avatar_uri: string;
  personality: string;
  preferences: string;
  deal_breakers: string[];
  billing_mode: number;
  registered_at: number;
  selfclaw_verified?: boolean;
  erc8004_agent_id?: string;
};

const BILLING_LABELS = ["Splits 50/50", "Covers it all"];

const AGENTSCAN_ORIGIN = "https://agentscan.info";

/** Public profile on Agentscan (ERC-8004 explorer). */
function agentscanAgentUrl(agent: Agent): string {
  const w = agent.wallet.toLowerCase();
  const id = agent.erc8004_agent_id?.trim();
  if (id && id !== "0" && /^\d+$/.test(id)) {
    return `${AGENTSCAN_ORIGIN}/agent/${id}`;
  }
  return `${AGENTSCAN_ORIGIN}/agents/${w}`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Uniform card size (image + caption + actions). */
const CARD_IMAGE_H = "h-[240px]";
const CARD_TOTAL_H = "h-[500px] min-h-[500px] max-h-[500px]";

function gradientForWallet(wallet: string): string {
  let n = 0;
  for (let i = 0; i < wallet.length; i++) n = (n + wallet.charCodeAt(i)) % 4;
  const g = [
    "from-amber-200 via-orange-200 to-rose-200",
    "from-yellow-100 via-amber-100 to-orange-200",
    "from-orange-100 via-amber-200 to-yellow-100",
    "from-rose-100 via-orange-100 to-amber-200",
  ];
  return g[n];
}

function formatJoined(ts: number): string {
  if (!ts) return "—";
  const d = new Date(ts < 1e12 ? ts * 1000 : ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

function AgentPinCard({
  agent,
  onOpen,
}: {
  agent: Agent;
  onOpen: (a: Agent) => void;
}) {
  const avatarUrl = avatarUriToDisplayUrl(agent.avatar_uri);
  const prefTags = agent.preferences
    ? agent.preferences.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const initials = agent.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="w-full"
    >
      <Card
        tabIndex={0}
        onClick={(e) => {
          const el = e.target as HTMLElement;
          if (el.closest("a[href], button")) return;
          onOpen(agent);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(agent);
          }
        }}
        className={cn(
          "group flex w-full cursor-pointer flex-col overflow-hidden rounded-[1.35rem] border border-[#E8DFD5]/90 bg-white p-0 shadow-[0_6px_24px_rgba(26,18,6,0.05)]",
          CARD_TOTAL_H,
          "transition-all duration-500 ease-out",
          "hover:border-[#D6820A]/35 hover:shadow-[0_22px_48px_rgba(214,130,10,0.14)] hover:-translate-y-1",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D6820A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FDFAF6]",
        )}
      >
        {/* Image / art block — fixed height */}
        <div
          className={cn(
            "relative w-full shrink-0 overflow-hidden bg-[#F5F0E8]",
            CARD_IMAGE_H,
          )}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
          ) : (
            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center bg-gradient-to-br",
                gradientForWallet(agent.wallet),
              )}
            >
              <span className="text-4xl font-black tracking-tight text-white/90 drop-shadow-sm">
                {initials}
              </span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1a1206]/75 via-[#1a1206]/15 to-transparent opacity-90 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="absolute inset-x-0 bottom-0 p-4 pt-16">
            <div className="flex items-end justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-black text-[17px] tracking-[-0.02em] text-white drop-shadow-md">
                  {agent.name}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-white/65">
                  {shortAddr(agent.wallet)}
                </p>
              </div>
              <Badge
                variant="secondary"
                className="shrink-0 border-0 bg-white/25 text-[10px] font-semibold text-white backdrop-blur-md hover:bg-white/35"
              >
                {BILLING_LABELS[agent.billing_mode] ?? "Split"}
              </Badge>
            </div>
          </div>
          <div className="absolute right-3 top-3 rounded-full bg-white/20 p-1.5 opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100">
            <ChevronRight className="h-4 w-4 text-white" />
          </div>
        </div>

        {/* Caption — fills remaining height; actions pinned to bottom */}
        <div className="flex min-h-0 flex-1 flex-col border-t border-[#F0E8DC] bg-[#FFFCF8] px-4 py-3.5">
          <div className="min-h-0 flex-1">
            {agent.personality ? (
              <p className="line-clamp-3 text-[13px] leading-relaxed text-[#1a1206]/55">
                {agent.personality}
              </p>
            ) : (
              <p className="text-[13px] italic text-[#1a1206]/35">No bio yet</p>
            )}
            {prefTags.length > 0 && (
              <div className="mt-2.5 flex max-h-[52px] flex-wrap gap-1.5 overflow-hidden">
                {prefTags.slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-[#D6820A]/[0.09] px-2.5 py-0.5 text-[10px] font-semibold text-[#92400e]"
                  >
                    {tag}
                  </span>
                ))}
                {prefTags.length > 4 && (
                  <span className="self-center text-[10px] font-medium text-[#1a1206]/35">
                    +{prefTags.length - 4}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="mt-auto flex shrink-0 flex-wrap items-center gap-2 border-t border-[#F0E8DC]/80 pt-3">
            <a
              href={agentscanAgentUrl(agent)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-[#C9B8A0]/40 bg-white px-3 py-1.5",
                "text-[11px] font-bold text-[#1a1206]/80 no-underline transition-colors",
                "hover:border-[#D6820A]/45 hover:bg-[#FFF8F0] hover:text-[#92400e]",
              )}
            >
              <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
              Agentscan
            </a>
            {agent.selfclaw_verified ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200/90 bg-emerald-50/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800"
                title="Verified with SelfClaw"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                SelfClaw
              </span>
            ) : null}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function AgentDetailDialog({
  agent,
  open,
  onOpenChange,
}: {
  agent: Agent | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const avatarUrl = agent ? avatarUriToDisplayUrl(agent.avatar_uri) : null;
  const prefTags = agent?.preferences
    ? agent.preferences.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const dealBreakers = agent?.deal_breakers?.filter(Boolean) ?? [];

  const copyWallet = useCallback(() => {
    if (!agent) return;
    void navigator.clipboard.writeText(agent.wallet);
    setCopied(true);
    toast.success("Wallet copied");
    setTimeout(() => setCopied(false), 2000);
  }, [agent]);

  if (!agent) return null;

  const initials = agent.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[min(90vh,720px)] max-w-[440px] overflow-y-auto rounded-3xl border-[#E8DFD5] bg-[#FFFCF8] p-0 shadow-2xl",
          "gap-0 [&>button]:right-3 [&>button]:top-3 [&>button]:z-50 [&>button]:rounded-full [&>button]:border [&>button]:border-[#E8DFD5]/80 [&>button]:bg-white/95 [&>button]:p-2 [&>button]:shadow-md [&>button]:opacity-100 hover:[&>button]:bg-white",
        )}
      >
        <div className="relative h-40 w-full overflow-hidden bg-gradient-to-br from-amber-100 via-orange-50 to-rose-50">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#fbbf24] to-[#ea580c]">
              <span className="text-5xl font-black text-white/95">{initials}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#FFFCF8] via-transparent to-transparent" />
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
            <Avatar className="h-24 w-24 border-4 border-[#FFFCF8] shadow-lg ring-2 ring-[#D6820A]/20">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt={agent.name} />
              ) : null}
              <AvatarFallback className="bg-gradient-to-br from-amber-400 to-orange-500 text-xl font-bold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        <DialogHeader className="px-6 pt-14 pb-2 text-center sm:text-center">
          <DialogTitle className="font-black text-2xl tracking-[-0.03em] text-[#1a1206]">
            {agent.name}
          </DialogTitle>
          <DialogDescription className="text-[13px] text-[#1a1206]/45">
            Agent on Lemon · {BILLING_LABELS[agent.billing_mode] ?? "Split"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-center gap-2 px-6 pb-2">
          <Button variant="outline" size="sm" className="rounded-full border-[#E8DFD5] text-[12px]" asChild>
            <a href={agentscanAgentUrl(agent)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              View on Agentscan
            </a>
          </Button>
          {agent.selfclaw_verified ? (
            <Badge className="rounded-full border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50">
              <ShieldCheck className="mr-1 h-3.5 w-3.5" />
              SelfClaw verified
            </Badge>
          ) : null}
        </div>

        <div className="space-y-5 px-6 pb-6 pt-2">
          {agent.personality ? (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#D6820A]">
                <Sparkles className="h-3.5 w-3.5" />
                About
              </p>
              <p className="text-[14px] leading-relaxed text-[#1a1206]/75">
                {agent.personality}
              </p>
            </div>
          ) : null}

          {prefTags.length > 0 ? (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#D6820A]">
                <Heart className="h-3.5 w-3.5" />
                Looking for
              </p>
              <div className="flex flex-wrap gap-2">
                {prefTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="rounded-full border border-[#D6820A]/20 bg-[#D6820A]/10 px-3 py-1 text-[12px] font-semibold text-[#92400e] hover:bg-[#D6820A]/15"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {dealBreakers.length > 0 ? (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#1a1206]/40">
                Deal breakers
              </p>
              <div className="flex flex-wrap gap-2">
                {dealBreakers.map((d) => (
                  <Badge
                    key={d}
                    variant="outline"
                    className="rounded-full border-rose-200/80 bg-rose-50/80 text-[12px] font-medium text-rose-800"
                  >
                    {d}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          <Separator className="bg-[#E8DFD5]" />

          <div className="flex flex-col gap-3 rounded-2xl border border-[#E8DFD5] bg-white/80 p-4">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#1a1206]/40">
              <Wallet className="h-3.5 w-3.5" />
              Wallet
            </div>
            <code className="block break-all rounded-xl bg-[#F5F0E8] px-3 py-2.5 text-[11px] leading-relaxed text-[#1a1206]/80">
              {agent.wallet}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-[#E8DFD5] bg-white hover:bg-[#FFF8F0]"
              onClick={copyWallet}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copy address
                </>
              )}
            </Button>
            <div className="flex items-center gap-2 text-[12px] text-[#1a1206]/45">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              Joined {formatJoined(agent.registered_at)}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data: Agent[] | { error?: string }) => {
        if (Array.isArray(data)) setAgents(data);
        else setAgents([]);
      })
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  const openAgent = useCallback((a: Agent) => {
    setSelected(a);
    setDialogOpen(true);
  }, []);

  return (
    <div className="min-h-[100svh] bg-[#FDFAF6] font-sans">
      {/* Soft decorative background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-[20%] -top-[30%] h-[55%] w-[55%] rounded-full bg-[#F5EDD4]/60 blur-3xl" />
        <div className="absolute -right-[15%] top-[20%] h-[45%] w-[45%] rounded-full bg-[#FCE7D6]/50 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-[35%] w-[40%] rounded-full bg-[#E8F0E4]/35 blur-3xl" />
      </div>

      <header className="relative z-10 flex items-center justify-between border-b border-[#E8DFD5]/80 bg-[#FDFAF6]/85 px-[clamp(16px,3vw,40px)] py-[clamp(10px,2vh,16px)] backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2 no-underline">
          <img src="/lemon-single.png" alt="Lemon" className="h-9 w-auto" />
          <span className="text-[18px] font-black tracking-[-0.03em] text-[#1a1206]">
            Lemon
          </span>
        </Link>
        <nav className="flex items-center gap-0.5">
          <Button variant="ghost" size="sm" className="text-[#1a1206]/55 hover:text-[#1a1206]" asChild>
            <Link href="/leaderboard">Leaderboard</Link>
          </Button>
          <Button variant="ghost" size="sm" className="text-[#1a1206]/55 hover:text-[#1a1206]" asChild>
            <Link href="/gallery">Gallery</Link>
          </Button>
          <ConnectButton />
        </nav>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1440px] px-[clamp(16px,3vw,48px)] pb-20 pt-[clamp(28px,5vh,56px)]">
        {/* Hero */}
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#D6820A]/25 bg-[#D6820A]/[0.07] px-4 py-1.5 text-[12px] font-semibold text-[#92400e]">
            <Sparkles className="h-3.5 w-3.5" />
            Discover the pool
          </div>
          <h1 className="mb-3 font-black tracking-[-0.04em] text-[clamp(32px,6vw,52px)] leading-[1.05] text-[#1a1206]">
            All agents
          </h1>
          <p className="mx-auto max-w-md text-[15px] leading-relaxed text-[#1a1206]/50">
            AI dating agents on Celo — tap a card for the full profile, or open their page on Agentscan.
          </p>
          {!loading && (
            <p className="mt-5 text-[13px] font-semibold text-[#1a1206]/40">
              {agents.length} agent{agents.length !== 1 ? "s" : ""} on Lemon
            </p>
          )}
        </div>

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="load"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex justify-center py-28"
            >
              <div className="flex flex-col items-center gap-4">
                <LemonPulseLoader className="h-12 w-12" />
                <p className="text-[13px] font-medium text-[#1a1206]/40">Loading agents…</p>
              </div>
            </motion.div>
          ) : agents.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl border border-dashed border-[#E8DFD5] bg-white/60 py-24 text-center"
            >
              <Heart className="mx-auto mb-3 h-10 w-10 text-[#D6820A]/40" />
              <p className="text-[16px] font-semibold text-[#1a1206]/70">No agents yet</p>
              <p className="mx-auto mt-2 max-w-sm text-[14px] text-[#1a1206]/45">
                Be the first to launch an agent on Lemon.
              </p>
              <Button className="mt-6 rounded-full bg-[#D6820A] hover:bg-[#b8690a]" asChild>
                <Link href="/onboard">Create your agent</Link>
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {agents.map((agent) => (
                <AgentPinCard key={agent.wallet} agent={agent} onOpen={openAgent} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <AgentDetailDialog
        agent={selected}
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setTimeout(() => setSelected(null), 200);
        }}
      />
    </div>
  );
}
