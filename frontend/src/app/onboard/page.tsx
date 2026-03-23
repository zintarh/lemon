"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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

// ── ElevenLabs TTS helper ──────────────────────────────────────────────────────

async function speakText(text: string): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
  if (apiKey) {
    try {
      const voiceId = "21m00Tcm4TlvDq8ikWAM"; // Rachel
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        return new Promise(resolve => {
          const audio = new Audio(url);
          audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(url); resolve(); };
          audio.play().catch(() => resolve());
        });
      }
    } catch { /* fall through to browser TTS */ }
  }
  // Fallback: browser speech synthesis
  return new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

// ── VoiceOnboardingModal ───────────────────────────────────────────────────────

const VOICE_QUESTIONS = [
  "Hi! I'm Lemon, your AI matchmaker. What's your name?",
  "Nice to meet you! Tell me a bit about yourself — your personality and vibe.",
  "What are you looking for in a connection? For example: deep conversations, adventures, stability?",
  "Last one — what are your deal breakers? What absolutely won't you tolerate in a match?",
];

interface VoiceProfile {
  name: string;
  personality: string;
  lookingFor: string[];
  dealBreakers: string[];
}

function VoiceOnboardingModal({
  onComplete,
  onClose,
}: {
  onComplete: (profile: VoiceProfile) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"speaking" | "listening" | "reviewing" | "processing" | "error">("speaking");
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const isMounted = useRef(true);
  // Accumulates final transcript segments across continuous recognition events
  const accumulatedRef = useRef("");

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SpeechRecognitionAPI = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      setErrorMsg("Your browser doesn't support voice input. Try Chrome or Edge.");
      setPhase("error");
      return;
    }

    accumulatedRef.current = "";
    setCurrentAnswer("");

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.continuous = true;      // keep recording until user clicks Done
    recognition.interimResults = true;  // stream words as they're spoken
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      if (!isMounted.current) return;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          accumulatedRef.current += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      // Show final + in-progress words in real time
      setCurrentAnswer(accumulatedRef.current + interim);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      if (!isMounted.current) return;
      // "no-speech" with continuous mode is non-fatal — just keep waiting
      if (event.error === "no-speech") return;
      setErrorMsg(`Microphone error: ${event.error}. Please try again.`);
      setPhase("error");
    };

    // onend fires when recognition.stop() is explicitly called (user clicks Done)
    recognition.onend = () => {
      if (!isMounted.current) return;
      setCurrentAnswer(accumulatedRef.current.trim());
      setPhase("reviewing");
    };

    recognition.start();
    setPhase("listening");
  }, []);

  const askQuestion = useCallback(async (index: number) => {
    if (!isMounted.current) return;
    setPhase("speaking");
    setCurrentAnswer("");
    await speakText(VOICE_QUESTIONS[index]);
    if (!isMounted.current) return;
    startListening();
  }, [startListening]);

  // Start first question on mount
  useEffect(() => {
    askQuestion(0);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopListening() {
    // Triggers recognition.onend → transitions to "reviewing"
    recognitionRef.current?.stop();
  }

  function handleNext() {
    const newAnswers = [...answers, currentAnswer];
    setAnswers(newAnswers);

    if (qIndex < VOICE_QUESTIONS.length - 1) {
      setQIndex(qIndex + 1);
      askQuestion(qIndex + 1);
    } else {
      // All answers collected — send to API
      processProfile(newAnswers);
    }
  }

  function handleReRecord() {
    askQuestion(qIndex);
  }

  async function processProfile(allAnswers: string[]) {
    setPhase("processing");
    try {
      const res = await fetch("/api/voice-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameAnswer: allAnswers[0] ?? "",
          aboutAnswer: allAnswers[1] ?? "",
          lookingForAnswer: allAnswers[2] ?? "",
          dealBreakersAnswer: allAnswers[3] ?? "",
        }),
      });
      if (!res.ok) throw new Error("Profile extraction failed");
      const profile: VoiceProfile = await res.json();
      onComplete(profile);
    } catch (e) {
      if (isMounted.current) {
        setErrorMsg((e as Error).message ?? "Something went wrong. Try again.");
        setPhase("error");
      }
    }
  }

  const progressPct = ((qIndex + (phase === "processing" ? 1 : 0)) / VOICE_QUESTIONS.length) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-[6px] p-0 sm:p-4">
      <div className="relative bg-[#FAFAF8] rounded-t-[28px] sm:rounded-[28px] shadow-[0_24px_80px_rgba(0,0,0,0.25)] max-w-[460px] w-full px-5 py-6 sm:px-8 sm:py-8 flex flex-col gap-5">

        {/* Close */}
        <button
          onClick={() => { stopListening(); onClose(); }}
          className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center bg-black/[0.06] text-black/50 hover:bg-black/10 transition-colors border-none cursor-pointer text-sm font-bold"
        >
          ✕
        </button>

        {/* Header */}
        <div>
          <p className="text-[11px] font-bold tracking-[0.1em] uppercase text-[#1a1206]/30 m-0 mb-1">
            Voice Setup · {qIndex + 1} of {VOICE_QUESTIONS.length}
          </p>
          {/* Progress bar */}
          <div className="h-1 rounded-full bg-black/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#D6820A] transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Question */}
        <p className="text-[18px] font-bold text-[#1a1206] leading-[1.35] tracking-[-0.02em] m-0">
          {VOICE_QUESTIONS[qIndex]}
        </p>

        {/* Status area */}
        {phase === "speaking" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-14 h-14 rounded-full bg-[#D6820A]/10 flex items-center justify-center text-2xl animate-pulse">
              🎙️
            </div>
            <p className="text-sm text-[#1a1206]/40">Lemon is speaking…</p>
          </div>
        )}

        {phase === "listening" && (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 shrink-0">
                <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
                <div className="relative w-10 h-10 rounded-full bg-red-500/10 border-2 border-red-400 flex items-center justify-center text-xl">
                  🎤
                </div>
              </div>
              <p className="text-[13px] text-red-500 font-semibold">Listening — take your time</p>
            </div>

            {/* Live transcript preview */}
            <div className="w-full min-h-[64px] rounded-2xl bg-black/[0.03] border border-black/[0.07] px-4 py-3">
              {currentAnswer ? (
                <p className="text-[13.5px] text-[#1a1206]/75 m-0 leading-[1.6] italic">{currentAnswer}</p>
              ) : (
                <p className="text-[13px] text-[#1a1206]/25 m-0 italic">Your words will appear here…</p>
              )}
            </div>

            {/* Done button — the only way to stop; no auto-cutoff */}
            <button
              onClick={stopListening}
              className="w-full rounded-xl border-none py-3 text-[14px] font-bold text-white cursor-pointer transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #D6820A, #b86e00)" }}
            >
              Done speaking →
            </button>
          </div>
        )}

        {phase === "reviewing" && (
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl bg-black/[0.03] border border-black/[0.07] px-4 py-3">
              {currentAnswer ? (
                <p className="text-[14px] text-[#1a1206]/80 m-0 leading-[1.5] italic">
                  &ldquo;{currentAnswer}&rdquo;
                </p>
              ) : (
                <p className="text-[13px] text-[#1a1206]/35 m-0 italic">No speech detected — try again.</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReRecord}
                className="flex-1 rounded-xl border border-black/10 bg-white py-2.5 text-[13px] font-semibold text-[#1a1206]/60 cursor-pointer hover:bg-black/[0.03] transition-colors"
              >
                Re-record
              </button>
              <button
                onClick={handleNext}
                className="flex-1 rounded-xl border-none py-2.5 text-[13px] font-bold text-white cursor-pointer transition-colors"
                style={{ background: "linear-gradient(135deg, #D6820A, #b86e00)" }}
              >
                {qIndex < VOICE_QUESTIONS.length - 1 ? "Next →" : "Done ✓"}
              </button>
            </div>
          </div>
        )}

        {phase === "processing" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-14 h-14 rounded-full bg-[#D6820A]/10 flex items-center justify-center text-2xl animate-spin">
              ⚙️
            </div>
            <p className="text-sm text-[#1a1206]/40">Building your profile…</p>
          </div>
        )}

        {phase === "error" && (
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-[13px] text-red-700 m-0">{errorMsg}</p>
            </div>
            <button
              onClick={() => askQuestion(qIndex)}
              className="rounded-xl border-none py-2.5 text-[13px] font-bold text-white cursor-pointer"
              style={{ background: "linear-gradient(135deg, #D6820A, #b86e00)" }}
            >
              Try again
            </button>
          </div>
        )}

        {/* Skip */}
        <button
          onClick={() => { stopListening(); onClose(); }}
          className="text-[11px] text-[#1a1206]/30 underline underline-offset-2 cursor-pointer bg-transparent border-none text-center"
        >
          Switch to template setup instead
        </button>
      </div>
    </div>
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

  // Fund agent wallet — user transfers cUSD directly to their agent's on-chain wallet
  const { writeContract: writeFund, data: fundHash, isPending: isFundPending } = useWriteContract();
  const { isLoading: isFundConfirming, isSuccess: isFundSuccess } = useWaitForTransactionReceipt({ hash: fundHash });

  // Agent wallet address returned from server after registration
  const [agentWalletAddress, setAgentWalletAddress] = useState<string | null>(null);

  // Funding amount — user picks how much cUSD to put in their agent's wallet
  const SPEND_PRESETS = [5, 10, 20, 50] as const;
  const [spendLimit, setSpendLimit] = useState<number>(10);

  function handleFund() {
    if (!agentWalletAddress) return;
    writeFund({
      address: CUSD_ADDRESS,
      abi: erc20Abi,
      functionName: "transfer",
      args: [agentWalletAddress as `0x${string}`, parseUnits(spendLimit.toString(), 18)],
    });
  }

  // Auto-navigate to dashboard after funding confirms
  useEffect(() => {
    if (isFundSuccess) router.push("/dashboard");
  }, [isFundSuccess, router]);

  const [onboardMode, setOnboardMode] = useState<"choose" | "template">("choose");
  const [showVoiceModal, setShowVoiceModal] = useState(false);

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

  function handleVoiceComplete(profile: VoiceProfile) {
    setName(profile.name);
    setPersonalityFree(profile.personality);
    setLookingFor(profile.lookingFor);
    setDealBreakers(profile.dealBreakers);
    // Pick the closest template by lookingFor overlap (for sidebar thumbnail)
    const best = TEMPLATES.reduce((a, b) => {
      const scoreA = a.lookingFor.filter(id => profile.lookingFor.includes(id)).length;
      const scoreB = b.lookingFor.filter(id => profile.lookingFor.includes(id)).length;
      return scoreB > scoreA ? b : a;
    });
    setSelectedId(best.id);
    setShowVoiceModal(false);
    // Drop into the same form as template flow — pre-populated, ready to edit
    setOnboardMode("template");
    setStep(1);
    setSubStep(0);
    toast.success("Profile ready!", { description: "Add a photo and review your details." });
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
    if (!avatarPreview) {
      toast.error("Add a profile photo.", { description: "Your photo is used to generate your agent's date image." });
      avatarInputRef.current?.click(); // pop the file picker for them
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
            const data = await r.json().catch(() => ({}));
            if (!cancelled) {
              setIsServerRegistered(true);
              if (data.agent_wallet) setAgentWalletAddress(data.agent_wallet);
            }
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
            Your agent just joined the pool. One more step — fund your agent&apos;s wallet with cUSD so it can pay for dates.
          </p>

          {/* Fund agent wallet step */}
          <div className="rounded-2xl bg-[#D6820A]/[0.06] border border-[#D6820A]/20 p-[clamp(14px,2vh,20px)] mb-[clamp(14px,2vh,20px)] text-left">
            <p className="font-bold text-[clamp(11px,1.4vh,13px)] text-[#92400e] mb-1">
              Fund your agent&apos;s wallet
            </p>
            <p className="text-[clamp(10px,1.2vh,12px)] text-[#1a1206]/45 leading-[1.5] mb-3">
              Your agent pays for dates autonomously from its own wallet. Send cUSD now — each date costs ~$0.50–$1.00. You can top up anytime from your dashboard.
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
              Sending <span className="font-semibold text-[#92400e]">${spendLimit} cUSD</span> from your wallet to your agent
            </p>

            <button
              className="btn btn-primary w-full text-[clamp(12px,1.5vh,14px)]"
              style={{ opacity: isFundPending || isFundConfirming || !agentWalletAddress ? 0.55 : 1, cursor: isFundPending || isFundConfirming || !agentWalletAddress ? "not-allowed" : "pointer" }}
              disabled={isFundPending || isFundConfirming || !agentWalletAddress}
              onClick={handleFund}
            >
              {!agentWalletAddress ? "Setting up agent…" : isFundPending ? "Confirm in wallet…" : isFundConfirming ? "Funding agent — entering the pool…" : `Send $${spendLimit} cUSD to agent →`}
            </button>
          </div>

          <button
            className="text-[clamp(11px,1.3vh,12.5px)] text-[#1a1206]/35 underline underline-offset-2 cursor-pointer bg-transparent border-none"
            onClick={() => router.push("/dashboard")}
          >
            Skip for now — I&apos;ll fund from dashboard
          </button>
        </div>
      </div>
    </div>
  );


  // ── Mode choice ──────────────────────────────────────────────────────────────

  if (onboardMode === "choose") return (
    <div className={pageClass}>
      {showVoiceModal && (
        <VoiceOnboardingModal
          onComplete={handleVoiceComplete}
          onClose={() => setShowVoiceModal(false)}
        />
      )}
      <MiniHeader right={<ConnectButton />} />
      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-[clamp(20px,4vh,40px)]">
        <div className="text-center max-w-[420px]">
          <h1 className="font-black text-[clamp(26px,4.5vh,52px)] text-[#1a1206] tracking-[-0.045em] leading-[1.05] mb-[clamp(8px,1.5vh,14px)]">
            How do you want to set up your agent?
          </h1>
          <p className="text-[clamp(13px,1.7vh,15px)] text-[#1a1206]/42 leading-[1.55] m-0">
            Voice lets you speak naturally — Lemon will build your profile from what you say.
          </p>
        </div>

        <div className="flex flex-col gap-4 w-full max-w-[400px]">
          {/* Voice option */}
          <button
            type="button"
            onClick={() => { setShowVoiceModal(true); }}
            className="group w-full rounded-[20px] border border-[#D6820A]/30 bg-[#D6820A]/[0.04] hover:bg-[#D6820A]/[0.09] transition-all duration-200 px-6 py-5 text-left cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#D6820A]/15 flex items-center justify-center text-2xl shrink-0">
                🎙️
              </div>
              <div>
                <p className="font-bold text-[clamp(14px,1.8vh,16px)] text-[#1a1206] m-0 mb-0.5">Set up with voice</p>
                <p className="text-[clamp(11px,1.4vh,13px)] text-[#1a1206]/45 m-0 leading-[1.4]">
                  Speak to Lemon — takes about 60 seconds
                </p>
              </div>
              <div className="ml-auto text-[#D6820A] font-bold text-lg group-hover:translate-x-1 transition-transform">→</div>
            </div>
          </button>

          {/* Template option */}
          <button
            type="button"
            onClick={() => setOnboardMode("template")}
            className="group w-full rounded-[20px] border border-black/[0.08] bg-white hover:bg-black/[0.02] transition-all duration-200 px-6 py-5 text-left cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-black/[0.05] flex items-center justify-center text-2xl shrink-0">
                📋
              </div>
              <div>
                <p className="font-bold text-[clamp(14px,1.8vh,16px)] text-[#1a1206] m-0 mb-0.5">Pick a template</p>
                <p className="text-[clamp(11px,1.4vh,13px)] text-[#1a1206]/45 m-0 leading-[1.4]">
                  Choose a personality and customize it
                </p>
              </div>
              <div className="ml-auto text-[#1a1206]/25 font-bold text-lg group-hover:translate-x-1 transition-transform">→</div>
            </div>
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
      <div className="flex-1 min-h-0 px-[clamp(12px,2.5vw,36px)] overflow-y-auto sm:overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-[clamp(8px,1.2vw,16px)] h-full sm:h-full pb-2 sm:pb-0" style={{ gridAutoRows: "minmax(140px,1fr)" }}>
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

        {/* Sidebar — hidden on mobile, visible md+ */}
        <aside className="hidden md:flex shrink-0 border-r border-black/[0.06] flex-col gap-[clamp(6px,1vh,12px)] w-[clamp(150px,18vw,210px)] px-[clamp(10px,1.5vw,18px)] py-[clamp(16px,2.5vh,28px)]">
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

          {/* Mobile step indicator — only visible below md */}
          <div className="md:hidden shrink-0 flex items-center gap-3 mb-1">
            {subStepMeta.map((s, i) => {
              const isDone = subStep > i;
              const isActive = subStep === i;
              return (
                <button
                  key={s.n}
                  type="button"
                  onClick={() => setSubStep(i)}
                  className={[
                    "flex items-center gap-2 rounded-xl px-3 py-1.5 text-left border-none cursor-pointer transition-colors",
                    isActive ? "bg-[#D6820A]/10" : "bg-transparent",
                  ].join(" ")}
                >
                  <div className={[
                    "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-extrabold shrink-0",
                    isDone ? "bg-green-600 text-white" : isActive ? "bg-[#D6820A] text-white" : "bg-[#E6DDD0] text-[#1a1206]/30",
                  ].join(" ")}>
                    {isDone ? "✓" : s.n}
                  </div>
                  <span className={[
                    "text-[11px] font-bold",
                    isActive ? "text-[#92400e]" : isDone ? "text-green-600" : "text-[#1a1206]/35",
                  ].join(" ")}>
                    {s.title}
                  </span>
                </button>
              );
            })}
          </div>

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
            <SectionCard title="Identity" sub="Give your agent a name and a photo — both required.">
              <div className="flex items-center gap-[clamp(12px,2vw,20px)]">
                <div className="shrink-0 relative">
                  {/* Pulsing ring when no photo yet — draws attention */}
                  {!avatarPreview && !avatarLoading && (
                    <span className="absolute inset-0 rounded-[clamp(12px,1.8vh,18px)] animate-ping bg-[#D6820A]/30 pointer-events-none" />
                  )}
                  <div
                    onClick={() => avatarInputRef.current?.click()}
                    title="Upload photo (required)"
                    className={[
                      "relative flex items-center justify-center cursor-pointer overflow-hidden",
                      "w-[clamp(52px,7vh,72px)] h-[clamp(52px,7vh,72px)] rounded-[clamp(12px,1.8vh,18px)]",
                      avatarPreview ? "border-2 border-dashed border-[#D6820A]" : "border-2 border-dashed border-[#D6820A]/60",
                    ].join(" ")}
                    style={{ background: avatarPreview ? "transparent" : `linear-gradient(135deg, ${template?.accent ?? "#e8a820"}, ${template?.accentTo ?? "#c8820a"})` }}
                  >
                    {avatarLoading
                      ? <LemonPulseLoader className="h-5 w-5 drop-shadow-md brightness-0 invert" />
                      : avatarPreview
                      ? <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                      : <span className="text-[clamp(9px,1.2vh,11px)] font-bold text-white/85 text-center leading-[1.4]">Add<br />photo<br /><span className="text-white/60">*</span></span>
                    }
                  </div>
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

            <SectionCard title="Personality" sub="Pre-filled from your setup — edit freely.">
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
