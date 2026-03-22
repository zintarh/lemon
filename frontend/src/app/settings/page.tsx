"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { LemonPulseLoader } from "@/components/LemonPulseLoader";
import { useAgentProfile } from "@/hooks/useAgentProfile";
import { useUpdateAgent } from "@/hooks/useUpdateAgent";
import { parseError } from "@/lib/errors";
import type { BillingMode } from "@/hooks/useRegisterAgent";
import { avatarUriToDisplayUrl } from "@/lib/avatarUri";

const LOOKING_FOR_CHIPS = [
  { id: "connection", label: "Real connection" },
  { id: "conversations", label: "Deep conversations" },
  { id: "adventures", label: "Shared adventures" },
  { id: "fun", label: "Fun & vibes" },
  { id: "stability", label: "Stability" },
  { id: "growth", label: "Growth mindset" },
  { id: "stimulation", label: "Mental stimulation" },
  { id: "spontaneity", label: "Spontaneity" },
];

const DEAL_BREAKER_CHIPS = [
  { id: "smoking", label: "Smoking" },
  { id: "dishonesty", label: "Dishonesty" },
  { id: "ambition", label: "No ambition" },
  { id: "flakey", label: "Flakey" },
  { id: "negativity", label: "Negativity" },
  { id: "closed", label: "Close-minded" },
];

/** Sidebar sections — jump nav (same pattern as onboarding side steps) */
const subStepMeta = [
  { n: "01", title: "Identity & style", desc: "Photo & personality" },
  { n: "02", title: "Matching & billing", desc: "Seek, deal-breakers, pay" },
  { n: "03", title: "Contact info", desc: "Reveal after trust" },
] as const;

type SettingsSectionIndex = 0 | 1 | 2;

function chipIdsFromLabels(labels: string[], chips: { id: string; label: string }[]) {
  return labels.flatMap((label) => {
    const found = chips.find((c) => c.label === label || c.id === label);
    return found ? [found.id] : [];
  });
}

function toggle(arr: string[], val: string) {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

function VerifyIdentityModal({
  wallet,
  onClose,
  onVerified,
}: {
  wallet: string;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [qrData, setQrData] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${SERVER}/api/agents/${wallet}/selfclaw/retry`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.verified) {
          onVerified();
          onClose();
          return;
        }
        if (d.qrData) setQrData(d.qrData);
        else setError("Could not generate QR code. Try again.");
        setLoading(false);
        setPolling(true);
      })
      .catch(() => {
        setError("Server error. Try again.");
        setLoading(false);
      });
  }, [wallet]);

  useEffect(() => {
    if (!polling) return;
    const id = setInterval(async () => {
      try {
        const r = await fetch(`${SERVER}/api/agents/${wallet}/selfclaw`);
        const d = await r.json();
        if (d.verified) {
          onVerified();
          onClose();
          clearInterval(id);
        }
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [polling, wallet]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F5F0E8]/90 backdrop-blur-md px-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl flex flex-col gap-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#1a1206]/40 mb-0.5">Step 2 of 2</p>
            <h2 className="text-[20px] font-bold tracking-[-0.02em] text-[#1a1206]">Verify your identity</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#1a1206]/30 hover:text-[#1a1206]/60 text-xl leading-none cursor-pointer border-none bg-transparent"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="text-[13px] text-[#1a1206]/50 leading-relaxed -mt-2">
          Scan with the <strong className="text-[#1a1206]/70">Self app</strong> to prove you&apos;re a real human. This gives your agent a reputation score on-chain.
        </p>

        <div className="flex items-center justify-center min-h-[200px]">
          {loading && (
            <div className="flex flex-col items-center gap-3">
              <LemonPulseLoader className="h-10 w-10" />
              <p className="text-[12px] text-[#1a1206]/40">Generating QR code…</p>
            </div>
          )}
          {error && <p className="text-[13px] text-red-500 text-center">{error}</p>}
          {qrData && !loading && (
            <div className="flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrData} alt="Scan to verify" className="w-48 h-48 rounded-2xl border border-[rgba(0,0,0,0.08)]" />
              <div className="flex items-center gap-2 text-[11px] text-[#1a1206]/40">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                Waiting for scan…
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-[rgba(214,130,10,0.06)] border border-[rgba(214,130,10,0.15)] px-4 py-3 text-[12px] text-[#92400e] leading-relaxed">
          <span className="font-semibold text-[#92400e]">Self app:</span> download from the App Store or Google Play, then scan this QR code.
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white border border-black/[0.07] shadow-[0_1px_8px_rgba(0,0,0,0.04)] px-[clamp(16px,2vw,22px)] py-[clamp(14px,2vh,20px)]">
      <div className="mb-[clamp(8px,1.2vh,14px)]">
        <p className="text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.12em] uppercase text-[#1a1206]/[0.32] m-0">{title}</p>
        {sub && (
          <p className="text-[clamp(11px,1.4vh,13px)] text-[#1a1206]/[0.42] leading-[1.45] m-0 mt-0.5">{sub}</p>
        )}
      </div>
      {children}
    </div>
  );
}

function ChipGroup({
  chips,
  selected,
  onToggle,
  variant = "gold",
}: {
  chips: { id: string; label: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  variant?: "gold" | "red";
}) {
  return (
    <div className="flex flex-wrap gap-[clamp(5px,0.8vh,8px)]">
      {chips.map((c) => {
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

export default function SettingsPage() {
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();
  const router = useRouter();

  const { data: profile, isLoading: profileLoading, refetch: refetchProfile } = useAgentProfile(address);
  const { update, isPending, isConfirming, isSuccess, error, hash: updateTxHash } = useUpdateAgent();

  /** Which sidebar section is highlighted (jump nav — not a forced wizard). */
  const [activeSection, setActiveSection] = useState<SettingsSectionIndex>(0);
  const [dbAgent, setDbAgent] = useState<{ selfclaw_verified?: boolean } | null>(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);

  useEffect(() => {
    if (!address) return;
    fetch(`${process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000"}/api/agents/${address}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setDbAgent(data))
      .catch(() => {});
  }, [address]);

  const [personality, setPersonality] = useState("");
  const [lookingFor, setLookingFor] = useState<string[]>([]);
  const [dealBreakers, setDealBreakers] = useState<string[]>([]);
  const [billingMode, setBillingMode] = useState<BillingMode>(0);
  const [avatarURI, setAvatarURI] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const mainScrollRef = useRef<HTMLElement>(null);
  const identitySectionRef = useRef<HTMLElement>(null);
  const prefsSectionRef = useRef<HTMLElement>(null);
  const contactSectionRef = useRef<HTMLElement>(null);

  const [tgHandle, setTgHandle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [revealPriceCents, setRevealPriceCents] = useState(0);
  const [contactSaving, setContactSaving] = useState(false);
  /** Avoid double sync / duplicate toasts when isSuccess stays true for the same tx */
  const lastSyncedUpdateHash = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (ready && !authenticated) router.replace("/");
  }, [ready, authenticated, router]);

  useEffect(() => {
    if (!profile || hydrated) return;
    setPersonality(profile.personality ?? "");
    setAvatarURI(profile.avatarURI ?? "ipfs://placeholder");
    setAvatarPreview(null);
    setBillingMode((profile.billingMode === 1 ? 1 : 0) as BillingMode);
    const prefLabels = (profile.preferences ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setLookingFor(chipIdsFromLabels(prefLabels, LOOKING_FOR_CHIPS));
    setDealBreakers(chipIdsFromLabels(profile.dealBreakers ?? [], DEAL_BREAKER_CHIPS));
    setHydrated(true);
  }, [profile, hydrated]);

  useEffect(() => {
    if (!address) return;
    fetch(`/api/settings/contact?wallet=${address}`)
      .then(async (r) => {
        if (!r.ok) return;
        return r.json() as Promise<{
          telegram_handle?: string;
          email?: string;
          phone?: string;
          reveal_price_cents?: number;
        }>;
      })
      .then((d) => {
        if (!d) return;
        setTgHandle(d.telegram_handle ?? "");
        setContactEmail(d.email ?? "");
        setContactPhone(d.phone ?? "");
        setRevealPriceCents(d.reveal_price_cents ?? 0);
      })
      .catch(() => {});
  }, [address]);

  async function handleSaveContact() {
    if (!address) return;
    setContactSaving(true);
    try {
      const res = await fetch("/api/settings/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: address,
          telegram_handle: tgHandle.startsWith("@") ? tgHandle : tgHandle ? `@${tgHandle}` : "",
          email: contactEmail,
          phone: contactPhone,
          reveal_price_cents: revealPriceCents,
        }),
      });
      if (res.ok) toast.success("Contact info saved.");
      else toast.error("Failed to save contact info.");
    } catch {
      toast.error("Failed to save contact info.");
    } finally {
      setContactSaving(false);
    }
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
      if (res.ok) {
        const json = await res.json();
        if (json.uri) setAvatarURI(json.uri);
      }
    } catch {
      /* keep existing */
    } finally {
      setAvatarLoading(false);
    }
  }

  const scrollToSection = useCallback((i: SettingsSectionIndex) => {
    setActiveSection(i);
    const refs = [identitySectionRef, prefsSectionRef, contactSectionRef];
    refs[i].current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  /** Sync sidebar highlight while user scrolls the main column */
  useEffect(() => {
    const root = mainScrollRef.current;
    const sections = [identitySectionRef.current, prefsSectionRef.current, contactSectionRef.current];
    if (!root || sections.some((el) => !el)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting && e.intersectionRatio > 0)
          .sort((x, y) => y.intersectionRatio - x.intersectionRatio);
        if (visible.length === 0) return;
        const idx = sections.indexOf(visible[0].target as HTMLElement);
        if (idx >= 0) setActiveSection(idx as SettingsSectionIndex);
      },
      { root, rootMargin: "-10% 0px -48% 0px", threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
    );

    for (const el of sections) observer.observe(el!);
    return () => observer.disconnect();
  }, [hydrated]);

  function validateSubStep1() {
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

  function handleSaveOnChain() {
    if (!validateSubStep1()) {
      scrollToSection(1);
      return;
    }
    const preferences = lookingFor.map((id) => LOOKING_FOR_CHIPS.find((c) => c.id === id)?.label ?? id).join(", ");
    const dealBreakersArr = dealBreakers.map((id) => DEAL_BREAKER_CHIPS.find((c) => c.id === id)?.label ?? id);
    update({
      avatarURI,
      agentURI: profile?.agentURI ?? "ipfs://placeholder",
      personality: personality.trim() || "open-minded",
      preferences,
      dealBreakers: dealBreakersArr,
      billingMode,
    });
  }

  useEffect(() => {
    if (error) toast.error("Update failed", { description: parseError(error) });
  }, [error]);

  /** On-chain updateProfile → pull same data from contract into Supabase (matcher reads DB). */
  useEffect(() => {
    if (!isSuccess || !updateTxHash || !address) return;
    if (lastSyncedUpdateHash.current === updateTxHash) return;
    lastSyncedUpdateHash.current = updateTxHash;

    let cancelled = false;
    (async () => {
      let synced = false;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const r = await fetch(`${SERVER}/api/agents/${address}/sync-profile`, { method: "POST" });
          if (r.ok) {
            synced = true;
            break;
          }
        } catch {
          /* retry */
        }
        await new Promise((r) => setTimeout(r, 2000));
        if (cancelled) return;
      }
      if (cancelled) return;
      await refetchProfile();
      if (synced) {
        toast.success("Profile updated", { description: "On-chain and server are in sync." });
      } else {
        toast.warning("Updated on-chain", {
          description: "Server sync is delayed — matching may use old prefs until sync succeeds. Retry from dashboard.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSuccess, updateTxHash, address, refetchProfile]);

  const avatarSrc = avatarPreview ?? avatarUriToDisplayUrl(profile?.avatarURI);

  const pageClass = "h-[100svh] flex flex-col bg-[#FAFAF8] overflow-hidden font-sans max-w-5xl mx-auto w-full";

  if (!ready || !authenticated) {
    return (
      <div className="h-[100svh] flex items-center justify-center bg-[#FAFAF8]">
        <LemonPulseLoader className="h-10 w-10" />
      </div>
    );
  }

  return (
    <div className={pageClass}>
      {showVerifyModal && address && (
        <VerifyIdentityModal
          wallet={address}
          onClose={() => setShowVerifyModal(false)}
          onVerified={() => {
            setDbAgent((prev) => ({ ...prev, selfclaw_verified: true }));
            setShowVerifyModal(false);
          }}
        />
      )}

      {dbAgent && !dbAgent.selfclaw_verified && (
        <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center justify-between gap-3">
          <p className="text-[12px] text-amber-800 leading-snug">
            <strong>Verify your identity</strong> to unlock reputation on-chain — your agent needs it to build trust.
          </p>
          <button
            type="button"
            onClick={() => setShowVerifyModal(true)}
            className="shrink-0 text-[11px] font-bold text-amber-900 bg-amber-200 hover:bg-amber-300 border-none rounded-full px-3 py-1 cursor-pointer transition-colors"
          >
            Verify now
          </button>
        </div>
      )}

      <header className="flex items-center justify-between border-b border-black/[0.05] shrink-0 px-[clamp(16px,3vw,36px)] py-[clamp(10px,2vh,18px)]">
        <Link
          href="/dashboard"
          className="no-underline flex items-center gap-2 text-[#1a1206]/50 hover:text-[#1a1206] transition-colors text-sm font-semibold"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Dashboard
        </Link>
        <Link href="/" className="no-underline">
          <img src="/lemon-logo.png" alt="Lemon" className="h-[clamp(36px,5vh,52px)] w-auto" />
        </Link>
        <ConnectButton />
      </header>

      {profileLoading || !hydrated ? (
        <div className="flex-1 flex items-center justify-center">
          <LemonPulseLoader className="h-9 w-9" />
        </div>
      ) : (
        <>
          {/* Mobile: same sections as sidebar, jump without finishing step 1 first */}
          <div className="flex md:hidden shrink-0 gap-2 px-[clamp(12px,3vw,24px)] py-2.5 border-b border-black/[0.06] bg-[#FAFAF8] overflow-x-auto">
            {subStepMeta.map((s, i) => (
              <button
                key={s.n}
                type="button"
                onClick={() => scrollToSection(i as SettingsSectionIndex)}
                className={[
                  "shrink-0 rounded-full px-3.5 py-1.5 text-[11px] font-bold border-[1.5px] cursor-pointer transition-colors",
                  activeSection === i
                    ? "bg-[#D6820A]/10 border-[#D6820A] text-[#92400e]"
                    : "bg-white border-black/10 text-[#1a1206]/45",
                ].join(" ")}
              >
                {s.n}{" "}
                {i === 0 ? "Identity" : i === 1 ? "Matching" : "Contact"}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 flex">
            {/* Sidebar — same structure as onboarding (jump nav, not linear lock) */}
            <aside className="hidden md:flex shrink-0 border-r border-black/[0.06] flex-col gap-[clamp(6px,1vh,12px)] w-[clamp(150px,18vw,210px)] px-[clamp(10px,1.5vw,18px)] py-[clamp(16px,2.5vh,28px)]">
              <div className="rounded-xl overflow-hidden mb-[clamp(8px,1.5vh,16px)] shadow-[0_3px_14px_rgba(0,0,0,0.10)]">
                <div
                  className="relative h-[clamp(56px,9vh,90px)] flex items-center justify-center overflow-hidden"
                  style={{
                    background: avatarSrc
                      ? "transparent"
                      : "linear-gradient(135deg, #fbbf24, #f97316)",
                  }}
                >
                  {avatarSrc ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={avatarSrc} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <span className="text-[clamp(10px,1.3vh,13px)] font-extrabold text-white/90 tracking-[-0.02em] z-[1]">
                      {profile?.name?.slice(0, 1) ?? "?"}
                    </span>
                  )}
                  <div className="absolute inset-0 bg-[#1a1206]/[0.08] pointer-events-none" />
                  <p className="absolute bottom-[7px] left-[10px] font-extrabold text-[clamp(10px,1.3vh,13px)] text-white m-0 tracking-[-0.02em] z-[1] truncate max-w-[90%]">
                    {profile?.name ?? "Agent"}
                  </p>
                </div>
              </div>

              <p className="text-[clamp(9px,1.1vh,11px)] text-[#1a1206]/35 leading-[1.4] px-0.5 -mt-1 mb-1">
                Jump to any section — update what you want, then save on-chain.
              </p>

              {subStepMeta.map((s, i) => {
                const isActive = activeSection === i;
                return (
                  <button
                    key={s.n}
                    type="button"
                    onClick={() => scrollToSection(i as SettingsSectionIndex)}
                    className={[
                      "flex items-start gap-[clamp(8px,1vw,12px)] rounded-xl border-none cursor-pointer text-left w-full transition-colors duration-150",
                      "p-[clamp(8px,1.2vh,12px)_clamp(8px,1vw,12px)]",
                      isActive ? "bg-[#D6820A]/[0.09]" : "bg-transparent",
                    ].join(" ")}
                  >
                    <div
                      className={[
                        "shrink-0 rounded-full flex items-center justify-center font-extrabold transition-all duration-200",
                        "w-[clamp(20px,2.8vh,26px)] h-[clamp(20px,2.8vh,26px)] text-[clamp(9px,1.1vh,11px)]",
                        isActive ? "bg-[#D6820A] text-white" : "bg-[#E6DDD0] text-[#1a1206]/30",
                      ].join(" ")}
                    >
                      {s.n}
                    </div>
                    <div>
                      <p
                        className={[
                          "font-bold text-[clamp(11px,1.4vh,13px)] m-0 mb-0.5 leading-[1.2]",
                          isActive ? "text-[#92400e]" : "text-[#1a1206]/40",
                        ].join(" ")}
                      >
                        {s.title}
                      </p>
                      <p className="text-[clamp(9px,1.1vh,11px)] text-[#1a1206]/30 m-0 leading-[1.4]">{s.desc}</p>
                    </div>
                  </button>
                );
              })}
            </aside>

            <main
              ref={mainScrollRef}
              className="flex-1 min-w-0 flex flex-col gap-[clamp(8px,1.4vh,14px)] overflow-y-auto px-[clamp(16px,3vw,44px)] py-[clamp(16px,2.5vh,32px)]"
            >
              <div className="shrink-0">
                <p className="text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.12em] uppercase text-[#1a1206]/28 mb-1">Agent settings</p>
                <h2 className="font-black text-[clamp(18px,3vh,28px)] text-[#1a1206] tracking-[-0.03em] leading-[1.1] m-0">
                  Your profile
                </h2>
                <p className="text-[clamp(12px,1.4vh,14px)] text-[#1a1206]/40 m-0 mt-1">
                  Three sections — scroll or use the sidebar to jump.{" "}
                  <span className="font-semibold text-[#1a1206]/55">Update my agent</span> saves to the contract, then syncs the same data to the server for matching. Contact is step 03 and saves separately.
                </p>
              </div>

              <section ref={identitySectionRef} className="scroll-mt-4 flex flex-col gap-[clamp(8px,1.4vh,14px)]">
                <p className="text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.12em] uppercase text-[#1a1206]/22 m-0 shrink-0">
                  {subStepMeta[0].n} — {subStepMeta[0].title}
                </p>
                <SectionCard title="Identity" sub="Update your photo. Name is set at registration.">
                    <div className="flex items-center gap-[clamp(12px,2vw,20px)]">
                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        title="Change photo"
                        className={[
                          "shrink-0 flex items-center justify-center cursor-pointer overflow-hidden",
                          "w-[clamp(52px,7vh,72px)] h-[clamp(52px,7vh,72px)] rounded-[clamp(12px,1.8vh,18px)]",
                          avatarSrc ? "border-2 border-dashed border-[#D6820A]" : "border-none",
                        ].join(" ")}
                        style={{
                          background: avatarSrc ? "transparent" : "linear-gradient(135deg, #fbbf24, #ea580c)",
                        }}
                      >
                        {avatarLoading ? (
                          <LemonPulseLoader className="h-5 w-5 drop-shadow-md brightness-0 invert" />
                        ) : avatarSrc ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={avatarSrc} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-[clamp(9px,1.2vh,11px)] font-bold text-white/85 text-center leading-[1.4]">
                            Add
                            <br />
                            photo
                          </span>
                        )}
                      </button>
                      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.1em] uppercase text-[#1a1206]/32 mb-1">Agent name</p>
                        <p className="text-[clamp(16px,2.2vh,20px)] font-black text-[#1a1206] tracking-[-0.02em] m-0 truncate">
                          {profile?.name}
                        </p>
                        <p className="text-[clamp(10px,1.3vh,12px)] text-[#1a1206]/35 mt-0.5 font-mono m-0">
                          {address ? `${address.slice(0, 8)}…${address.slice(-6)}` : ""}
                        </p>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard title="Personality" sub="How your agent presents itself in conversations.">
                    <textarea
                      className="input w-full resize-none pt-3 text-[clamp(12px,1.6vh,14px)] leading-[1.6]"
                      style={{ minHeight: "clamp(80px,12vh,140px)" }}
                      value={personality}
                      onChange={(e) => setPersonality(e.target.value)}
                      maxLength={500}
                    />
                    <p className="text-right text-[11px] text-[#1a1206]/25 mt-1 m-0">{personality.length}/500</p>
                  </SectionCard>
              </section>

              <section ref={prefsSectionRef} className="scroll-mt-4 flex flex-col gap-[clamp(8px,1.4vh,14px)] pt-2">
                <p className="text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.12em] uppercase text-[#1a1206]/22 m-0 shrink-0">
                  {subStepMeta[1].n} — {subStepMeta[1].title}
                </p>
                  <SectionCard title="Looking for" sub="Select what your agent seeks in a match.">
                    <ChipGroup chips={LOOKING_FOR_CHIPS} selected={lookingFor} onToggle={(id) => setLookingFor((p) => toggle(p, id))} />
                  </SectionCard>

                  <SectionCard title="Deal breakers" sub="Your agent exits conversations that hit these.">
                    <ChipGroup
                      chips={DEAL_BREAKER_CHIPS}
                      selected={dealBreakers}
                      onToggle={(id) => setDealBreakers((p) => toggle(p, id))}
                      variant="red"
                    />
                  </SectionCard>

                  <SectionCard title="Per-date payment" sub="Settled via x402 on Celo — not a subscription.">
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { value: 0 as BillingMode, label: "Split 50/50" },
                        { value: 1 as BillingMode, label: "I cover it" },
                      ].map((opt) => (
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
              </section>

              <section ref={contactSectionRef} className="scroll-mt-4 flex flex-col gap-[clamp(8px,1.4vh,14px)] pt-2">
                <p className="text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.12em] uppercase text-[#1a1206]/22 m-0 shrink-0">
                  {subStepMeta[2].n} — {subStepMeta[2].title}
                </p>

                <div className="rounded-2xl bg-white border border-black/[0.07] shadow-[0_1px_8px_rgba(0,0,0,0.04)] px-[clamp(16px,2vw,22px)] py-[clamp(14px,2vh,20px)]">
                  <div className="flex items-center justify-between gap-3 mb-[clamp(8px,1.2vh,14px)]">
                    <div>
                      <p className="text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.12em] uppercase text-[#1a1206]/[0.32] m-0">Contact info</p>
                      <p className="text-[clamp(11px,1.4vh,13px)] text-[#1a1206]/[0.42] leading-[1.45] m-0 mt-0.5">
                        Saved separately — used after 3 completed dates with the same person.
                      </p>
                    </div>
                    {dbAgent?.selfclaw_verified ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 shrink-0">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Verified
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowVerifyModal(true)}
                        className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-[#D6820A] bg-[#D6820A]/08 border border-[#D6820A]/25 rounded-full px-2 py-0.5 cursor-pointer hover:bg-[#D6820A]/15 transition-colors"
                      >
                        Verify →
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="block text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.1em] uppercase text-[#1a1206]/32 mb-[clamp(5px,0.8vh,8px)]">
                        Telegram handle
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1a1206]/30 text-sm font-semibold select-none">@</span>
                        <input
                          className="input pl-7 text-[clamp(13px,1.7vh,15px)]"
                          value={tgHandle.replace(/^@/, "")}
                          onChange={(e) => setTgHandle(e.target.value)}
                          placeholder="yourhandle"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.1em] uppercase text-[#1a1206]/32 mb-[clamp(5px,0.8vh,8px)]">
                        Email
                      </label>
                      <input
                        className="input text-[clamp(13px,1.7vh,15px)]"
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.1em] uppercase text-[#1a1206]/32 mb-[clamp(5px,0.8vh,8px)]">
                        Phone
                      </label>
                      <input
                        className="input text-[clamp(13px,1.7vh,15px)]"
                        type="tel"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        placeholder="+1 555 000 0000"
                      />
                    </div>
                    <div>
                      <label className="block text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.1em] uppercase text-[#1a1206]/32 mb-[clamp(5px,0.8vh,8px)]">
                        Early reveal price (USD) — optional
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1a1206]/30 text-sm font-semibold select-none">$</span>
                        <input
                          className="input pl-7 text-[clamp(13px,1.7vh,15px)]"
                          type="number"
                          min={0}
                          step={0.5}
                          placeholder="0 — free after 3 dates"
                          value={revealPriceCents > 0 ? (revealPriceCents / 100).toFixed(2) : ""}
                          onChange={(e) => setRevealPriceCents(Math.round(parseFloat(e.target.value || "0") * 100))}
                        />
                      </div>
                      <p className="text-[11px] text-[#1a1206]/28 mt-1 leading-[1.5] m-0">
                        {revealPriceCents > 0
                          ? `Agents can pay $${(revealPriceCents / 100).toFixed(2)} to see your Telegram sooner.`
                          : "Leave blank to only reveal after 3 completed dates."}
                      </p>
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        className="btn btn-secondary text-[clamp(12px,1.5vh,14px)]"
                        style={{ opacity: contactSaving ? 0.55 : 1, cursor: contactSaving ? "not-allowed" : "pointer" }}
                        disabled={contactSaving}
                        onClick={handleSaveContact}
                      >
                        {contactSaving ? "Saving…" : "Save contact details"}
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            </main>
          </div>

          <div className="shrink-0 border-t border-black/[0.06] bg-[#FAFAF8]/95 backdrop-blur-[16px] px-[clamp(16px,2.5vw,36px)] py-[clamp(10px,1.5vh,16px)] flex gap-2.5 justify-between items-center flex-wrap">
            <button type="button" className="btn btn-secondary text-[clamp(12px,1.5vh,14px)]" onClick={() => router.push("/dashboard")}>
              ← Dashboard
            </button>
            <button
              type="button"
              className="btn btn-primary text-[clamp(12px,1.5vh,14px)]"
              style={{ opacity: isPending || isConfirming ? 0.55 : 1, cursor: isPending || isConfirming ? "not-allowed" : "pointer" }}
              disabled={isPending || isConfirming}
              onClick={handleSaveOnChain}
            >
              {isPending ? "Confirm in wallet…" : isConfirming ? "Updating…" : "Update my agent →"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
