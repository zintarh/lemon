"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, usePublicClient } from "wagmi";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { ConnectButton } from "@/components/ConnectButton";
import { LemonPulseLoader } from "@/components/LemonPulseLoader";
import { useRegisterAgent, type BillingMode } from "@/hooks/useRegisterAgent";
import { parseError } from "@/lib/errors";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LEMON_AGENT_ADDRESS, LEMON_DATE_ADDRESS, erc20Abi, CUSD_ADDRESS, lemonAgentAbi } from "@/lib/contracts";

// ── Chip data ──────────────────────────────────────────────────────────────────

const LOOKING_FOR_CHIPS = [
  { id: "connection",    label: "Real connection"    },
  { id: "conversations", label: "Deep conversations" },
  { id: "adventures",   label: "Shared adventures"  },
  { id: "fun",          label: "Fun & vibes"         },
  { id: "stability",    label: "Stability"           },
  { id: "growth",       label: "Growth mindset"      },
  { id: "stimulation",  label: "Mental stimulation"  },
  { id: "spontaneity",  label: "Spontaneity"         },
];

const DEAL_BREAKER_CHIPS = [
  { id: "smoking",    label: "Smoking"      },
  { id: "dishonesty", label: "Dishonesty"   },
  { id: "ambition",   label: "No ambition"  },
  { id: "flakey",     label: "Flakey"       },
  { id: "negativity", label: "Negativity"   },
  { id: "closed",     label: "Close-minded" },
];

// ── Templates ──────────────────────────────────────────────────────────────────

interface Template {
  id: string; title: string; tagline: string; personality: string;
  lookingFor: string[]; dealBreakers: string[];
  image: string; accent: string; accentTo: string;
}

const TEMPLATES: Template[] = [
  {
    id: "zest", title: "The Zest",
    tagline: "Sharp, energetic — lights up every room",
    personality: "Spontaneous spirit who lives for new experiences. Always planning the next trip, trying the weirdest restaurant, or saying yes to a random road trip. Hates routine, loves a good story.",
    lookingFor: ["adventures", "spontaneity", "fun"], dealBreakers: ["negativity", "flakey"],
    image: "/personality/personality0.jpg", accent: "#f97316", accentTo: "#ef4444",
  },
  {
    id: "pith", title: "The Pith",
    tagline: "Deep, layered — substance beneath the surface",
    personality: "Finds beauty in ideas and complexity. Loves long conversations about philosophy, science, and the human condition. Equally happy debating or sitting in comfortable silence with a book.",
    lookingFor: ["conversations", "stimulation", "connection"], dealBreakers: ["closed", "dishonesty"],
    image: "/personality/personality1.jpg", accent: "#3b82f6", accentTo: "#6366f1",
  },
  {
    id: "pulp", title: "The Pulp",
    tagline: "Raw, textured — the creative core",
    personality: "Sees the world through a unique lens. Always creating — music, writing, design, or just daydreaming. Has strong aesthetic opinions and appreciates people who notice the details.",
    lookingFor: ["connection", "conversations"], dealBreakers: ["closed", "dishonesty"],
    image: "/personality/personality2.jpg", accent: "#a855f7", accentTo: "#ec4899",
  },
  {
    id: "squeeze", title: "The Squeeze",
    tagline: "All-in, nothing held back",
    personality: "Believes in real connection and doesn't do things halfway. Emotionally expressive, attentive, and genuinely interested in who you are — not just what you do.",
    lookingFor: ["connection", "stability"], dealBreakers: ["dishonesty", "flakey"],
    image: "/personality/personality3.jpg", accent: "#f472b6", accentTo: "#e11d48",
  },
  {
    id: "grove", title: "The Grove",
    tagline: "Rooted, growing — always reaching higher",
    personality: "Goal-oriented but not workaholic. Ambitious in everything — career, health, relationships. Knows what they want and respects someone who does too.",
    lookingFor: ["growth", "stimulation", "stability"], dealBreakers: ["ambition", "dishonesty"],
    image: "/personality/personality4.jpg", accent: "#10b981", accentTo: "#0d9488",
  },
  {
    id: "rind", title: "The Rind",
    tagline: "Bright outer layer — the first impression",
    personality: "Genuinely interested in people and brings good energy everywhere. Warm humor, loves food and good company. Can make friends with anyone in five minutes flat.",
    lookingFor: ["fun", "connection", "spontaneity"], dealBreakers: ["negativity", "flakey"],
    image: "/personality/personality5.jpg", accent: "#fbbf24", accentTo: "#f97316",
  },
];

function toggle(arr: string[], val: string) {
  return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
}

// ── MiniHeader ─────────────────────────────────────────────────────────────────

function MiniHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between border-b border-black/[0.05] shrink-0 px-[clamp(16px,3vw,36px)] py-[clamp(10px,2vh,18px)]">
      <Link href="/" className="no-underline">
        <img src="/lemon-logo.png" alt="Lemon" className="h-[clamp(44px,6.5vh,64px)] w-auto" />
      </Link>
      {right}
    </header>
  );
}

// ── ChipGroup ──────────────────────────────────────────────────────────────────

function ChipGroup({ chips, selected, onToggle, variant = "gold" }: {
  chips: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  variant?: "gold" | "red";
}) {
  return (
    <div className="flex flex-wrap gap-[clamp(5px,0.8vh,8px)]">
      {chips.map(c => {
        const active = selected.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onToggle(c.id)}
            className={[
              "px-[clamp(10px,1.2vw,16px)] py-[clamp(5px,0.8vh,8px)] rounded-full",
              "text-[clamp(11px,1.4vh,13px)] font-semibold border-[1.5px] cursor-pointer",
              "transition-all duration-150 font-sans",
              active
                ? variant === "red"
                  ? "bg-red-600/10 border-red-500/40 text-red-600"
                  : "bg-[#D6820A]/10 border-[#D6820A] text-[#92400e]"
                : "bg-white border-black/10 text-black/50",
            ].join(" ")}
          >
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

// ── SectionCard ────────────────────────────────────────────────────────────────

function SectionCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-black/[0.07] shadow-[0_1px_8px_rgba(0,0,0,0.04)] px-[clamp(16px,2vw,22px)] py-[clamp(14px,2vh,20px)]">
      <div className="mb-[clamp(8px,1.2vh,14px)]">
        <p className="text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.12em] uppercase text-[#1a1206]/[0.32] m-0">
          {title}
        </p>
        {sub && <p className="text-[clamp(11px,1.4vh,13px)] text-[#1a1206]/[0.42] leading-[1.45] m-0 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

// ── Template Card ──────────────────────────────────────────────────────────────

function TemplateCard({ t, selected, onClick }: { t: Template; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "relative w-full h-full border-none p-0 cursor-pointer outline-none",
        "rounded-[clamp(12px,1.5vw,20px)] overflow-hidden",
        "transition-all duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        selected
          ? "scale-[1.02] shadow-[0_0_0_3px_#D6820A,0_8px_32px_rgba(0,0,0,0.18)]"
          : "scale-100 shadow-[0_3px_14px_rgba(0,0,0,0.10)]",
      ].join(" ")}
      style={{ background: `linear-gradient(135deg, ${t.accent}, ${t.accentTo})` }}
    >
      <img
        src={t.image}
        alt={t.title}
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/[0.88] via-black/45 to-black/[0.06]" />

      {selected && (
        <div className="absolute top-[clamp(8px,1.2vh,14px)] right-[clamp(8px,1.2vw,14px)] w-[clamp(22px,3vh,30px)] h-[clamp(22px,3vh,30px)] rounded-full bg-[#D6820A] flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.25)]">
          <span className="text-white text-[clamp(10px,1.4vh,14px)] font-black leading-none">✓</span>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-[clamp(12px,2vh,20px)_clamp(12px,1.5vw,18px)]">
        <h3 className="font-black text-[clamp(13px,1.8vh,20px)] text-white tracking-[-0.03em] leading-[1.15] mb-[clamp(3px,0.5vh,6px)] m-0 [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]">
          {t.title}
        </h3>
        <p className="text-[clamp(10px,1.2vh,12px)] text-white/[0.62] leading-[1.4] m-0 italic">
          {t.tagline}
        </p>
      </div>
    </button>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OnboardPage() {
  const { authenticated, login, user, ready } = usePrivy();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const isConnected = authenticated;
  const walletAddress = address ?? (user?.wallet?.address as `0x${string}` | undefined);
  const router = useRouter();

  useEffect(() => {
    if (ready && !authenticated) {
      router.replace("/");
    }
  }, [ready, authenticated, router]);
  const { register, isPending, isConfirming, isSuccess, error } = useRegisterAgent();

  // ERC-20 approve hook — called after registration to let LemonDate pull cUSD from user wallet
  const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending } = useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });

  // Spending cap — user picks how much cUSD their agent can spend (default $20)
  const SPEND_PRESETS = [5, 10, 20, 50] as const;
  const [spendLimit, setSpendLimit] = useState<number>(20);

  function handleApprove() {
    // cUSD has 18 decimals on Celo
    writeApprove({
      address: CUSD_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [LEMON_DATE_ADDRESS, parseUnits(spendLimit.toString(), 18)],
    });
  }

  // Auto-navigate to dashboard after approve confirms — no manual click needed
  useEffect(() => {
    if (isApproveSuccess) router.push("/dashboard");
  }, [isApproveSuccess, router]);

  const [step, setStep] = useState(0);
  const [subStep, setSubStep] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [personalityFree, setPersonalityFree] = useState("");
  const [lookingFor, setLookingFor] = useState<string[]>([]);
  const [dealBreakers, setDealBreakers] = useState<string[]>([]);
  const [billingMode, setBillingMode] = useState<BillingMode>(0);

  const [avatarURI, setAvatarURI] = useState("ipfs://placeholder");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [isOnChainRegistered, setIsOnChainRegistered] = useState<boolean | null>(null);
  const [isServerRegistered, setIsServerRegistered] = useState<boolean | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const template = TEMPLATES.find(t => t.id === selectedId);

  function selectTemplate(id: string) {
    const t = TEMPLATES.find(t => t.id === id)!;
    setSelectedId(id);
    setPersonalityFree(t.personality);
    setLookingFor(t.lookingFor);
    setDealBreakers(t.dealBreakers);
  }

  function validateStep0() {
    if (!selectedId) {
      toast.error("Pick a personality to continue.", { description: "Select one of the cards above." });
      return false;
    }
    return true;
  }

  function validateSubStep0() {
    if (!name.trim()) {
      toast.error("Your agent needs a name.", { description: "Enter a name to continue." });
      return false;
    }
    if (name.trim().length < 2) {
      toast.error("Name is too short.", { description: "Use at least 2 characters." });
      return false;
    }
    if (!personalityFree.trim()) {
      toast.error("Add a personality description.", { description: "Tell us a bit about your agent." });
      return false;
    }
    return true;
  }

  function validateSubStep1() {
    if (!isConnected) {
      login();
      return false;
    }
    if (lookingFor.length === 0) {
      toast.error("Select at least one preference.", { description: "What is your agent looking for?" });
      return false;
    }
    if (dealBreakers.length === 0) {
      toast.error("Select at least one deal breaker.", { description: "What will your agent not tolerate?" });
      return false;
    }
    return true;
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/avatar", { method: "POST", body: formData });
      if (res.ok) { const json = await res.json(); if (json.uri) setAvatarURI(json.uri); }
    } catch { /* keep placeholder */ } finally { setAvatarLoading(false); }
  }

  function handleSubmit() {
    const preferences = lookingFor.map(id => LOOKING_FOR_CHIPS.find(c => c.id === id)?.label ?? id).join(", ");
    const dealBreakersArr = dealBreakers.map(id => DEAL_BREAKER_CHIPS.find(c => c.id === id)?.label ?? id);
    register({
      name: name.trim() || (template?.title ?? "Agent"),
      avatarURI, agentURI: "ipfs://placeholder",
      personality: personalityFree.trim() || "open-minded",
      preferences: preferences || "genuine connection",
      dealBreakers: dealBreakersArr, billingMode,
    });
  }

  useEffect(() => {
    if (!error) return;
    toast.error("Registration failed", { description: parseError(error) });
  }, [error]);

  // After on-chain tx confirms, notify the server to trigger ERC-8004 + SelfClaw registration
  useEffect(() => {
    if (!isSuccess || !walletAddress || !publicClient) return;
    setIsOnChainRegistered(null);
    setIsServerRegistered(null);

    let cancelled = false;

    const runPostRegisterChecks = async () => {
      try {
        // Retry isRegistered up to 5× — RPC can lag a few seconds after tx confirm
        let chainRegistered = false;
        for (let i = 0; i < 5; i++) {
          chainRegistered = Boolean(await publicClient.readContract({
            address: LEMON_AGENT_ADDRESS,
            abi: lemonAgentAbi,
            functionName: "isRegistered",
            args: [walletAddress],
          }));
          if (chainRegistered) break;
          await new Promise((r) => setTimeout(r, 1500));
        }

        if (cancelled) return;
        setIsOnChainRegistered(chainRegistered);

        // Notify server — best effort with 20s timeout; don't block the success screen
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20_000);
        try {
          const r = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000"}/api/agents/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wallet: walletAddress }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (r.ok) {
            if (!cancelled) setIsServerRegistered(true);
          } else {
            // Server error but tx succeeded — log and still advance
            const err = await r.json().catch(() => ({}));
            console.warn("[onboard] Server register non-fatal:", err);
            if (!cancelled) setIsServerRegistered(true); // let user through; server can sync later
          }
        } catch (fetchErr) {
          clearTimeout(timeout);
          // Network error or timeout — tx is on-chain, don't block user
          console.warn("[onboard] Server register unreachable (non-fatal):", fetchErr);
          if (!cancelled) setIsServerRegistered(true);
        }
      } catch (e) {
        if (cancelled) return;
        console.error("[onboard] Post-register check failed:", e);
        // On-chain tx confirmed but something else went wrong — still let user through
        setIsOnChainRegistered(true);
        setIsServerRegistered(true);
      }
    };

    runPostRegisterChecks();

    return () => {
      cancelled = true;
    };
  }, [isSuccess, walletAddress, publicClient]);

  const pageClass = "h-[100svh] flex flex-col bg-[#FAFAF8] overflow-hidden font-sans max-w-5xl mx-auto w-full";

  // ── Success ────────────────────────────────────────────────────────────────

  if (!ready || !authenticated) return (
    <div className="h-[100svh] flex items-center justify-center bg-[#FAFAF8]">
      <LemonPulseLoader className="h-10 w-10" />
    </div>
  );

  if (isSuccess && (isOnChainRegistered !== true || isServerRegistered !== true)) return (
    <div className={pageClass}>
      <MiniHeader />
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-[460px] w-full text-center">
          <div className="w-[clamp(48px,6.8vh,68px)] h-[clamp(48px,6.8vh,68px)] rounded-[18px] mx-auto mb-[clamp(14px,2vh,22px)] bg-[#D6820A]/10 border border-[#D6820A]/20 flex items-center justify-center text-[clamp(18px,2.8vh,24px)] text-[#92400e]">
            …
          </div>
          <h1 className="font-black text-[clamp(22px,3.8vh,36px)] text-[#1a1206] tracking-[-0.04em] mb-[clamp(8px,1.4vh,12px)]">
            Setting up your agent
          </h1>
          <p className="text-[#1a1206]/55 text-[clamp(12px,1.6vh,14px)] leading-[1.65] mb-5">
            This usually takes a few seconds. Keep this screen open while we finish setup.
          </p>
          {isOnChainRegistered === false && (
            <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-center">
              <p className="text-[clamp(11px,1.3vh,12.5px)] text-red-700 mb-3">
                We couldn&apos;t confirm your registration on-chain. Please try again.
              </p>
              <button
                className="btn btn-secondary text-[clamp(11px,1.3vh,12.5px)]"
                onClick={() => window.location.reload()}
              >
                Retry setup
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (isSuccess) return (
    <div className={pageClass}>
      <MiniHeader />
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-[440px] w-full text-center">
          <div className="w-[clamp(52px,7vh,72px)] h-[clamp(52px,7vh,72px)] rounded-[20px] mx-auto mb-[clamp(16px,2.5vh,24px)] bg-green-600/10 border border-green-600/20 flex items-center justify-center text-[clamp(20px,3vh,28px)] text-green-600">
            ✓
          </div>
          <h1 className="font-black text-[clamp(24px,4vh,40px)] text-[#1a1206] tracking-[-0.04em] mb-[clamp(8px,1.5vh,14px)]">
            {name || template?.title} is in the pool.
          </h1>
          <p className="text-[#1a1206]/50 text-[clamp(13px,1.8vh,15px)] leading-[1.65] mb-[clamp(20px,3.5vh,28px)]">
            Your agent just joined the pool. One more step — approve your agent to pay for dates on your behalf.
          </p>

          {/* Approve step — auto-navigates to dashboard on confirm */}
          <div className="rounded-2xl bg-[#D6820A]/[0.06] border border-[#D6820A]/20 p-[clamp(14px,2vh,20px)] mb-[clamp(14px,2vh,20px)] text-left">
            <p className="font-bold text-[clamp(11px,1.4vh,13px)] text-[#92400e] mb-1">
              One last step — set your agent&apos;s spending limit
            </p>
            <p className="text-[clamp(10px,1.2vh,12px)] text-[#1a1206]/45 leading-[1.5] mb-3">
              Choose how much cUSD your agent can spend on dates. You keep full control — increase or revoke anytime.
            </p>

            {/* Preset buttons */}
            <div className="flex gap-2 mb-3">
              {SPEND_PRESETS.map(amt => (
                <button
                  key={amt}
                  onClick={() => setSpendLimit(amt)}
                  className="flex-1 rounded-xl border py-1.5 text-[12px] font-bold transition-colors cursor-pointer"
                  style={{
                    background: spendLimit === amt ? "#D6820A" : "white",
                    color: spendLimit === amt ? "white" : "#92400e",
                    borderColor: spendLimit === amt ? "#D6820A" : "rgba(214,130,10,0.3)",
                  }}
                >
                  ${amt}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-[#1a1206]/40 mb-3 text-center">
              Approving <span className="font-semibold text-[#92400e]">${spendLimit} cUSD</span> — your wallet stays yours
            </p>

            <button
              className="btn btn-primary w-full text-[clamp(12px,1.5vh,14px)]"
              style={{ opacity: isApprovePending || isApproveConfirming ? 0.55 : 1, cursor: isApprovePending || isApproveConfirming ? "not-allowed" : "pointer" }}
              disabled={isApprovePending || isApproveConfirming}
              onClick={handleApprove}
            >
              {isApprovePending ? "Confirm in wallet…" : isApproveConfirming ? "Activated — entering the pool…" : `Approve $${spendLimit} & enter the pool →`}
            </button>
          </div>

          <button
            className="text-[clamp(11px,1.3vh,12.5px)] text-[#1a1206]/35 underline underline-offset-2 cursor-pointer bg-transparent border-none"
            onClick={() => router.push("/dashboard")}
          >
            I'll do this later
          </button>
        </div>
      </div>
    </div>
  );


  if (step === 0) return (
    <div className={pageClass}>
      <MiniHeader right={
        <span className="text-[clamp(10px,1.3vh,12px)] font-semibold tracking-[0.08em] uppercase text-[#1a1206]/30">
          1 / 2
        </span>
      } />

      <div className="text-center px-6 pt-[clamp(10px,2vh,20px)] pb-[clamp(8px,1.5vh,16px)] shrink-0">
        <h1 className="font-black text-[clamp(22px,4vh,52px)] text-[#1a1206] tracking-[-0.045em] leading-[1.05] mb-[clamp(4px,0.8vh,10px)]">
          Who are you as an agent?
        </h1>
        <p className="text-[clamp(12px,1.6vh,15px)] text-[#1a1206]/42 max-w-[380px] mx-auto leading-[1.55]">
          Pick a personality. You&apos;ll tweak everything on the next screen.
        </p>
      </div>

      {/* Cards grid — fills remaining space */}
      <div className="flex-1 min-h-0 px-[clamp(12px,2.5vw,36px)]">
        <div className="grid grid-cols-3 gap-[clamp(8px,1.2vw,16px)] h-full">
          {TEMPLATES.map(t => (
            <TemplateCard key={t.id} t={t} selected={selectedId === t.id} onClick={() => selectTemplate(t.id)} />
          ))}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="shrink-0 border-t border-black/[0.06] bg-[#FAFAF8]/95 backdrop-blur-[16px] px-[clamp(16px,3vw,36px)] py-[clamp(10px,1.8vh,18px)] flex items-center justify-center gap-3.5">
        {selectedId && (
          <p className="text-[clamp(11px,1.4vh,13px)] text-[#1a1206]/40 whitespace-nowrap">
            Selected: <strong className="text-[#1a1206]">{template?.title}</strong>
          </p>
        )}
        <button
          className="btn btn-primary text-[clamp(13px,1.7vh,16px)] px-[clamp(24px,3vw,40px)] py-[clamp(10px,1.5vh,14px)]"
          onClick={() => { if (validateStep0()) { setStep(1); setSubStep(0); } }}
        >
          Shape your agent →
        </button>
      </div>
    </div>
  );

  // ── Step 1: Customize (sidebar + sub-steps) ───────────────────────────────

  const subStepMeta = [
    { n: "01", title: "Identity & Style",      desc: "Name, photo, personality"   },
    { n: "02", title: "Preferences & Billing", desc: "What you seek, how you pay" },
  ];

  return (
    <div className={pageClass}>
      <MiniHeader right={
        <ConnectButton />
      } />

      {/* Main area */}
      <div className="flex-1 min-h-0 flex">

        {/* Sidebar */}
        <aside className="shrink-0 border-r border-black/[0.06] flex flex-col gap-[clamp(6px,1vh,12px)] w-[clamp(150px,18vw,210px)] px-[clamp(10px,1.5vw,18px)] py-[clamp(16px,2.5vh,28px)]">
          {/* Template thumbnail */}
          <div className="rounded-xl overflow-hidden mb-[clamp(8px,1.5vh,16px)] shadow-[0_3px_14px_rgba(0,0,0,0.10)]">
            <div
              className="relative h-[clamp(56px,9vh,90px)]"
              style={{ background: `linear-gradient(135deg, ${template?.accent}, ${template?.accentTo})` }}
            >
              {template && (
                <img
                  src={template.image}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-[#1a1206]/[0.10]" />
              <p className="absolute bottom-[7px] left-[10px] font-extrabold text-[clamp(10px,1.3vh,13px)] text-white m-0 tracking-[-0.02em]">
                {template?.title}
              </p>
            </div>
          </div>

          {/* Nav steps */}
          {subStepMeta.map((s, i) => {
            const isDone = subStep > i;
            const isActive = subStep === i;
            return (
              <button
                key={s.n}
                type="button"
                onClick={() => setSubStep(i)}
                className={[
                  "flex items-start gap-[clamp(8px,1vw,12px)] rounded-xl border-none cursor-pointer text-left w-full transition-colors duration-150",
                  "p-[clamp(8px,1.2vh,12px)_clamp(8px,1vw,12px)]",
                  isActive ? "bg-[#D6820A]/[0.09]" : "bg-transparent",
                ].join(" ")}
              >
                <div className={[
                  "shrink-0 rounded-full flex items-center justify-center font-extrabold transition-all duration-200",
                  "w-[clamp(20px,2.8vh,26px)] h-[clamp(20px,2.8vh,26px)] text-[clamp(9px,1.1vh,11px)]",
                  isDone ? "bg-green-600 text-white" : isActive ? "bg-[#D6820A] text-white" : "bg-[#E6DDD0] text-[#1a1206]/30",
                ].join(" ")}>
                  {isDone ? "✓" : s.n}
                </div>
                <div>
                  <p className={[
                    "font-bold text-[clamp(11px,1.4vh,13px)] m-0 mb-0.5 leading-[1.2]",
                    isActive ? "text-[#92400e]" : isDone ? "text-green-600" : "text-[#1a1206]/40",
                  ].join(" ")}>
                    {s.title}
                  </p>
                  <p className="text-[clamp(9px,1.1vh,11px)] text-[#1a1206]/30 m-0 leading-[1.4]">
                    {s.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </aside>

        {/* Content */}
        <main className="flex-1 min-w-0 flex flex-col gap-[clamp(8px,1.4vh,14px)] overflow-y-auto px-[clamp(16px,3vw,44px)] py-[clamp(16px,2.5vh,32px)]">

          {/* Sub-step label */}
          <div className="shrink-0">
            <p className="text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.12em] uppercase text-[#1a1206]/28 mb-1">
              {subStepMeta[subStep].n} / 02
            </p>
            <h2 className="font-black text-[clamp(18px,3vh,28px)] text-[#1a1206] tracking-[-0.03em] leading-[1.1] m-0">
              {subStepMeta[subStep].title}
            </h2>
          </div>


          {/* Sub-step 0: Identity & Style */}
          {subStep === 0 && (<>
            <SectionCard title="Identity" sub="Give your agent a name and a face.">
              <div className="flex items-center gap-[clamp(12px,2vw,20px)]">
                <div
                  onClick={() => avatarInputRef.current?.click()}
                  title="Upload photo"
                  className={[
                    "shrink-0 flex items-center justify-center cursor-pointer overflow-hidden",
                    "w-[clamp(52px,7vh,72px)] h-[clamp(52px,7vh,72px)] rounded-[clamp(12px,1.8vh,18px)]",
                    avatarPreview ? "border-2 border-dashed border-[#D6820A]" : "border-none",
                  ].join(" ")}
                  style={{ background: avatarPreview ? "transparent" : `linear-gradient(135deg, ${template?.accent ?? "#e8a820"}, ${template?.accentTo ?? "#c8820a"})` }}
                >
                  {avatarLoading
                    ? <LemonPulseLoader className="h-5 w-5 drop-shadow-md brightness-0 invert" />
                    : avatarPreview
                    ? <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                    : <span className="text-[clamp(9px,1.2vh,11px)] font-bold text-white/85 text-center leading-[1.4]">Add<br />photo</span>
                  }
                </div>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                <div className="flex-1">
                  <label className="block text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.1em] uppercase text-[#1a1206]/32 mb-[clamp(5px,0.8vh,8px)]">
                    Agent name
                  </label>
                  <input
                    className="input text-[clamp(14px,1.8vh,16px)] font-semibold"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="River, Alex, Quinn…"
                    maxLength={32}
                    autoFocus
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Personality" sub="Pre-filled from your template — edit freely.">
              <textarea
                className="input w-full resize-none pt-3 text-[clamp(12px,1.6vh,14px)] leading-[1.6]"
                style={{ minHeight: "clamp(80px,12vh,140px)" }}
                value={personalityFree}
                onChange={e => setPersonalityFree(e.target.value)}
                maxLength={500}
              />
            </SectionCard>
          </>)}

          {/* Sub-step 1: Preferences & Billing */}
          {subStep === 1 && (<>
            <SectionCard title="Looking for" sub="Select what your agent seeks in a match.">
              <ChipGroup chips={LOOKING_FOR_CHIPS} selected={lookingFor} onToggle={id => setLookingFor(p => toggle(p, id))} />
            </SectionCard>

            <SectionCard title="Deal breakers" sub="Your agent exits conversations that hit these.">
              <ChipGroup chips={DEAL_BREAKER_CHIPS} selected={dealBreakers} onToggle={id => setDealBreakers(p => toggle(p, id))} variant="red" />
            </SectionCard>

            <SectionCard title="Per-date payment" sub="Settled via x402 on Celo — not a subscription.">
              <div className="flex gap-2">
                {[
                  { value: 0 as BillingMode, label: "Split 50/50" },
                  { value: 1 as BillingMode, label: "I cover it"  },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setBillingMode(opt.value)}
                    className={[
                      "rounded-full cursor-pointer font-semibold transition-all duration-150 font-sans border-[1.5px]",
                      "px-[clamp(14px,1.8vw,20px)] py-[clamp(6px,0.9vh,9px)] text-[clamp(11px,1.4vh,13px)]",
                      billingMode === opt.value
                        ? "bg-[#D6820A]/10 border-[#D6820A] text-[#92400e]"
                        : "bg-white border-black/10 text-[#1a1206]/50",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </SectionCard>

          </>)}
        </main>
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 border-t border-black/[0.06] bg-[#FAFAF8]/95 backdrop-blur-[16px] px-[clamp(16px,2.5vw,36px)] py-[clamp(10px,1.5vh,16px)] flex gap-2.5 justify-end">
        <button
          className="btn btn-secondary text-[clamp(12px,1.5vh,14px)]"
          onClick={() => { if (subStep === 0) setStep(0); else setSubStep(0); }}
        >
          ← Back
        </button>
        {subStep === 0 ? (
          <button
            className="btn btn-primary text-[clamp(12px,1.5vh,14px)]"
            onClick={() => { if (validateSubStep0()) setSubStep(1); }}
          >
            Set your standards →
          </button>
        ) : (
          <button
            className="btn btn-primary text-[clamp(12px,1.5vh,14px)]"
            style={{ opacity: isPending || isConfirming ? 0.55 : 1, cursor: isPending || isConfirming ? "not-allowed" : "pointer" }}
            disabled={isPending || isConfirming}
            onClick={() => { if (validateSubStep1()) handleSubmit(); }}
          >
            {isPending ? "Confirm in wallet…" : isConfirming ? "Going live…" : "Launch your agent →"}
          </button>
        )}
      </div>
    </div>
  );
}
