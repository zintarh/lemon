"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConnectButton } from "@/components/ConnectButton";
import { useAgentProfile } from "@/hooks/useAgentProfile";
import { useUpdateAgent } from "@/hooks/useUpdateAgent";
import { parseError } from "@/lib/errors";
import type { BillingMode } from "@/hooks/useRegisterAgent";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "LemonDatesBot";

// ── Chip data (same as onboarding) ─────────────────────────────────────────

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

function chipIdsFromLabels(labels: string[], chips: { id: string; label: string }[]) {
  return labels.flatMap(label => {
    const found = chips.find(c => c.label === label || c.id === label);
    return found ? [found.id] : [];
  });
}

function toggle(arr: string[], val: string) {
  return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val];
}

// ── Sub-components ──────────────────────────────────────────────────────────

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

// ── Page ────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { ready, authenticated } = usePrivy();
  const { address } = useAccount();
  const router = useRouter();

  const { data: profile, isLoading: profileLoading } = useAgentProfile(address);
  const { update, isPending, isConfirming, isSuccess, error } = useUpdateAgent();

  // Fetch DB row for fields that live in Supabase only (e.g. selfclaw_verified)
  const [dbAgent, setDbAgent] = useState<{ selfclaw_verified?: boolean } | null>(null);
  useEffect(() => {
    if (!address) return;
    fetch(`${process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000"}/api/agents/${address}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setDbAgent(data))
      .catch(() => {});
  }, [address]);

  // Form state — initialised from profile once loaded
  const [personality, setPersonality] = useState("");
  const [lookingFor, setLookingFor] = useState<string[]>([]);
  const [dealBreakers, setDealBreakers] = useState<string[]>([]);
  const [billingMode, setBillingMode] = useState<BillingMode>(0);
  const [avatarURI, setAvatarURI] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Contact reveal state
  const [tgHandle, setTgHandle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [revealPriceCents, setRevealPriceCents] = useState(0);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactLinked, setContactLinked] = useState(false);

  // Redirect unauthenticated users
  useEffect(() => {
    if (ready && !authenticated) router.replace("/");
  }, [ready, authenticated, router]);

  // Populate form from on-chain profile
  useEffect(() => {
    if (!profile || hydrated) return;
    setPersonality(profile.personality ?? "");
    setAvatarURI(profile.avatarURI ?? "ipfs://placeholder");
    setAvatarPreview(null);
    setBillingMode((profile.billingMode === 1 ? 1 : 0) as BillingMode);

    // preferences is a comma-separated string like "Real connection, Deep conversations"
    const prefLabels = (profile.preferences ?? "").split(",").map(s => s.trim()).filter(Boolean);
    setLookingFor(chipIdsFromLabels(prefLabels, LOOKING_FOR_CHIPS));
    setDealBreakers(chipIdsFromLabels(profile.dealBreakers ?? [], DEAL_BREAKER_CHIPS));
    setHydrated(true);
  }, [profile, hydrated]);

  // Load existing contact reveal
  useEffect(() => {
    if (!address) return;
    fetch(`/api/settings/contact?wallet=${address}`)
      .then(r => r.json())
      .then((d: { telegram_handle?: string; email?: string; phone?: string; telegram_chat_id?: string; reveal_price_cents?: number }) => {
        setTgHandle(d.telegram_handle ?? "");
        setContactEmail(d.email ?? "");
        setContactPhone(d.phone ?? "");
        setRevealPriceCents(d.reveal_price_cents ?? 0);
        setContactLinked(!!d.telegram_chat_id);
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
    } catch { /* keep existing */ } finally { setAvatarLoading(false); }
  }

  function handleSave() {
    if (lookingFor.length === 0) {
      toast.error("Select at least one preference.");
      return;
    }
    if (dealBreakers.length === 0) {
      toast.error("Select at least one deal breaker.");
      return;
    }
    const preferences = lookingFor
      .map(id => LOOKING_FOR_CHIPS.find(c => c.id === id)?.label ?? id)
      .join(", ");
    const dealBreakersArr = dealBreakers.map(id => DEAL_BREAKER_CHIPS.find(c => c.id === id)?.label ?? id);
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

  useEffect(() => {
    if (isSuccess) toast.success("Profile updated on-chain ✓");
  }, [isSuccess]);

  if (!ready || !authenticated) {
    return (
      <div className="h-[100svh] flex items-center justify-center bg-[#FAFAF8]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#D6820A] border-t-transparent" />
      </div>
    );
  }

  const avatarSrc = avatarPreview ?? (profile?.avatarURI?.startsWith("ipfs://") ? null : profile?.avatarURI);

  return (
    <div className="min-h-[100svh] bg-[#FAFAF8] font-sans flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-black/[0.05] px-[clamp(16px,3vw,36px)] py-[clamp(10px,2vh,18px)]">
        <Link href="/dashboard" className="no-underline flex items-center gap-2 text-[#1a1206]/50 hover:text-[#1a1206] transition-colors text-sm font-semibold">
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

      {/* Body */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-[clamp(16px,3vw,36px)] py-[clamp(24px,4vh,48px)] flex flex-col gap-5">
        {/* Title */}
        <div>
          <h1 className="font-black text-[clamp(22px,4vh,36px)] text-[#1a1206] tracking-[-0.04em] leading-[1.05] mb-1">
            Agent settings
          </h1>
          <p className="text-[clamp(12px,1.6vh,14px)] text-[#1a1206]/45 leading-[1.55]">
            Tweak your personality, preferences, and billing. Changes go on-chain instantly.
          </p>
        </div>

        {profileLoading || !hydrated ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#D6820A] border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Avatar + name (name is read-only — not editable per contract) */}
            <SectionCard title="Identity" sub="Update your photo. Name is set at registration.">
              <div className="flex items-center gap-[clamp(12px,2vw,20px)]">
                <div
                  onClick={() => avatarInputRef.current?.click()}
                  title="Change photo"
                  className="shrink-0 flex items-center justify-center cursor-pointer overflow-hidden w-[clamp(52px,7vh,72px)] h-[clamp(52px,7vh,72px)] rounded-[clamp(12px,1.8vh,18px)] border-2 border-dashed border-[#D6820A]/40 hover:border-[#D6820A] transition-colors bg-[#D6820A]/05"
                >
                  {avatarLoading ? (
                    <div className="w-[18px] h-[18px] rounded-full border-2 border-[#D6820A] border-t-transparent animate-spin" />
                  ) : avatarSrc ? (
                    <img src={avatarSrc} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[clamp(9px,1.2vh,11px)] font-bold text-[#D6820A]/60 text-center leading-[1.4]">
                      Change<br />photo
                    </span>
                  )}
                </div>
                <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                <div>
                  <p className="text-[clamp(16px,2.2vh,20px)] font-black text-[#1a1206] tracking-[-0.02em]">
                    {profile?.name}
                  </p>
                  <p className="text-[clamp(10px,1.3vh,12px)] text-[#1a1206]/35 mt-0.5">
                    {address ? `${address.slice(0, 8)}…${address.slice(-6)}` : ""}
                  </p>
                </div>
              </div>
            </SectionCard>

            {/* Personality */}
            <SectionCard title="Personality" sub="How your agent presents itself in conversations.">
              <textarea
                className="input w-full resize-none pt-3 text-[clamp(12px,1.6vh,14px)] leading-[1.6]"
                style={{ minHeight: "clamp(80px,12vh,140px)" }}
                value={personality}
                onChange={e => setPersonality(e.target.value)}
                maxLength={500}
              />
              <p className="text-right text-[11px] text-[#1a1206]/25 mt-1">{personality.length}/500</p>
            </SectionCard>

            {/* Looking for */}
            <SectionCard title="Looking for" sub="What your agent seeks in a match.">
              <ChipGroup chips={LOOKING_FOR_CHIPS} selected={lookingFor} onToggle={id => setLookingFor(p => toggle(p, id))} />
            </SectionCard>

            {/* Deal breakers */}
            <SectionCard title="Deal breakers" sub="Your agent exits conversations that hit these.">
              <ChipGroup chips={DEAL_BREAKER_CHIPS} selected={dealBreakers} onToggle={id => setDealBreakers(p => toggle(p, id))} variant="red" />
            </SectionCard>

            {/* Billing */}
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

            {/* Contact reveal */}
            <div className="rounded-2xl bg-white border border-black/[0.07] shadow-[0_1px_8px_rgba(0,0,0,0.04)] px-[clamp(16px,2vw,22px)] py-[clamp(14px,2vh,20px)]">
              <div className="mb-[clamp(8px,1.2vh,14px)]">
                <div className="flex items-center justify-between gap-3 mb-0.5">
                  <p className="text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.12em] uppercase text-[#1a1206]/[0.32] m-0">
                    Contact info
                  </p>
                  {dbAgent?.selfclaw_verified ? (
                    <span className="flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      Human verified
                    </span>
                  ) : (
                    <a
                      href="https://app.self.xyz"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[10px] font-semibold text-[#D6820A] bg-[#D6820A]/08 border border-[#D6820A]/25 rounded-full px-2 py-0.5 no-underline hover:bg-[#D6820A]/15 transition-colors"
                    >
                      Verify as human →
                    </a>
                  )}
                </div>
                <p className="text-[clamp(11px,1.4vh,13px)] text-[#1a1206]/[0.42] leading-[1.45] m-0 mt-0.5">
                  After 3 completed dates with the same person, your agent automatically sends this to them — and receives theirs.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {/* Telegram handle */}
                <div>
                  <label className="block text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.1em] uppercase text-[#1a1206]/32 mb-1.5">
                    Telegram handle
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1a1206]/30 text-sm font-semibold select-none">@</span>
                    <input
                      className="input pl-7 text-[clamp(13px,1.7vh,15px)]"
                      value={tgHandle.replace(/^@/, "")}
                      onChange={e => setTgHandle(e.target.value)}
                      placeholder="yourhandle"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="block text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.1em] uppercase text-[#1a1206]/32 mb-1.5">
                    Email
                  </label>
                  <input
                    className="input text-[clamp(13px,1.7vh,15px)]"
                    type="email"
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.1em] uppercase text-[#1a1206]/32 mb-1.5">
                    Phone
                  </label>
                  <input
                    className="input text-[clamp(13px,1.7vh,15px)]"
                    type="tel"
                    value={contactPhone}
                    onChange={e => setContactPhone(e.target.value)}
                    placeholder="+1 555 000 0000"
                  />
                </div>

                {/* Reveal price */}
                <div>
                  <label className="block text-[clamp(9px,1.1vh,11px)] font-bold tracking-[0.1em] uppercase text-[#1a1206]/32 mb-1.5">
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
                      onChange={e => setRevealPriceCents(Math.round(parseFloat(e.target.value || "0") * 100))}
                    />
                  </div>
                  <p className="text-[11px] text-[#1a1206]/28 mt-1 leading-[1.5]">
                    {revealPriceCents > 0
                      ? `Agents can pay $${(revealPriceCents / 100).toFixed(2)} to see your Telegram immediately. You earn this in CELO.`
                      : "Leave blank to only reveal after 3 completed dates."}
                  </p>
                </div>

                {/* Save contact + bot link */}
                <div className="flex items-center gap-3 pt-1 flex-wrap">
                  <button
                    className="btn btn-primary text-[clamp(12px,1.5vh,14px)] px-5 py-2"
                    style={{ opacity: contactSaving ? 0.55 : 1, cursor: contactSaving ? "not-allowed" : "pointer" }}
                    disabled={contactSaving}
                    onClick={handleSaveContact}
                  >
                    {contactSaving ? "Locking in…" : "Lock in my details"}
                  </button>

                  {/* Bot link — user must start the bot to receive Telegram messages */}
                  <a
                    href={`https://t.me/${BOT_USERNAME}?start=${address ?? ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={[
                      "flex items-center gap-1.5 text-[clamp(11px,1.4vh,13px)] font-semibold no-underline transition-colors",
                      contactLinked
                        ? "text-green-600"
                        : "text-[#D6820A] hover:text-[#92400e]",
                    ].join(" ")}
                  >
                    {contactLinked ? (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        Telegram linked
                      </>
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21.198 2.433a2.242 2.242 0 0 0-1.022.215l-16.5 7.5a2.25 2.25 0 0 0 .126 4.073l3.9 1.205 2.306 6.58a.75.75 0 0 0 1.316.208l2.671-3.293 4.14 2.912a2.25 2.25 0 0 0 3.29-1.60l2.75-17.25a2.25 2.25 0 0 0-2.977-2.54z" />
                        </svg>
                        Link Telegram — get notified when it's real
                      </>
                    )}
                  </a>
                </div>

                {!contactLinked && (
                  <p className="text-[11px] text-[#1a1206]/30 leading-[1.5]">
                    Tap the link above to start a chat with the bot. This lets your agent send you a message when the time comes.
                  </p>
                )}
              </div>
            </div>

            {/* Save */}
            <div className="flex justify-end pt-1">
              <button
                className="btn btn-primary text-[clamp(13px,1.7vh,16px)] px-[clamp(24px,3vw,40px)] py-[clamp(10px,1.5vh,14px)]"
                style={{ opacity: isPending || isConfirming ? 0.55 : 1, cursor: isPending || isConfirming ? "not-allowed" : "pointer" }}
                disabled={isPending || isConfirming}
                onClick={handleSave}
              >
                {isPending ? "Confirm in wallet…" : isConfirming ? "Updating…" : "Update my agent →"}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
