"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useBalance } from "wagmi";
import { formatUnits } from "viem";
import Link from "next/link";
import { LemonPulseLoader } from "@/components/LemonPulseLoader";
import { useIsRegistered } from "@/hooks/useAgentProfile";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

// Celo mainnet token addresses
const CUSDC_MAINNET = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as const;

function fmt(value: bigint | undefined, decimals: number, dp = 2): string {
  if (value === undefined) return "—";
  return Number(formatUnits(value, decimals)).toFixed(dp);
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="flex items-center gap-1.5 mb-3">
      <p className="text-xs text-gray-600 font-mono break-all flex-1">{address}</p>
      <button onClick={copy} className="shrink-0 text-gray-400 hover:text-yellow-500 transition-colors" title="Copy address">
        {copied ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-400">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}

function BalanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center gap-6 py-1">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-mono font-semibold text-gray-900">{value}</span>
    </div>
  );
}

// ─── SelfClaw verify status ───────────────────────────────────────────────────

type VerifyState = "idle" | "loading" | "polling" | "verified" | "failed" | "unavailable";

function useSelfClawVerify(address: string | undefined) {
  const [state, setState] = useState<VerifyState>("idle");
  const [humanId, setHumanId] = useState<string | null>(null);
  const [qrData, setQrData] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check current status from server DB on mount / address change
  useEffect(() => {
    if (!address) return;
    fetch(`${SERVER}/api/agents/${address}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.selfclaw_verified) {
          setState("verified");
          setHumanId(data.selfclaw_human_id ?? null);
        }
      })
      .catch(() => {});
  }, [address]);

  // Poll every 6s while in "polling" state
  useEffect(() => {
    if (state !== "polling" || !address) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${SERVER}/api/agents/${address}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data?.selfclaw_verified) {
          setState("verified");
          setHumanId(data.selfclaw_human_id ?? null);
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch { /* keep polling */ }
    }, 6000);

    // Stop polling after 5 minutes regardless
    const timeout = setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current);
      setState(s => s === "polling" ? "failed" : s);
    }, 5 * 60 * 1000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      clearTimeout(timeout);
    };
  }, [state, address]);

  const startVerify = useCallback(async () => {
    if (!address || state === "loading" || state === "polling" || state === "verified" || state === "unavailable") return;
    setState("loading");
    setQrData(null);
    setDeepLink(null);
    try {
      const res = await fetch(`${SERVER}/api/agents/${address}/selfclaw/retry`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.verified) {
          setState("verified");
          setHumanId(data.humanId ?? null);
        } else if (data.started) {
          setQrData(data.qrData ?? null);
          setDeepLink(data.deepLink ?? null);
          setState("polling");
        } else {
          // Verification service unreachable
          setState("unavailable");
        }
      } else {
        setState("failed");
      }
    } catch {
      setState("failed");
    }
  }, [address, state]);

  return { state, humanId, qrData, deepLink, startVerify };
}

// ─── Verify Modal ─────────────────────────────────────────────────────────────

function VerifyModal({
  qrData,
  deepLink,
  onClose,
}: {
  qrData: string | null;
  deepLink: string | null;
  onClose: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: "rgba(253, 250, 246, 0.94)", backdropFilter: "blur(10px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-white rounded-3xl shadow-2xl p-6 flex flex-col items-center gap-4 w-full max-w-sm">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors"
          aria-label="Close"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Title */}
        <div className="text-center">
          <p className="text-base font-bold text-[#1a1206]">Verify you&apos;re human</p>
          <p className="text-[12px] text-gray-500 mt-0.5">Use the Self app to scan the QR code below</p>
        </div>

        {/* QR */}
        {qrData ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrData}
            alt="Self verification QR"
            className="w-64 h-64 rounded-2xl border border-gray-200"
          />
        ) : (
          <div className="w-64 h-64 rounded-2xl border border-gray-200 flex items-center justify-center">
            <LemonPulseLoader className="h-12 w-12" />
          </div>
        )}

        {/* Instructions */}
        <div className="w-full rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-center">
          <p className="text-[12px] font-bold text-amber-800">Open the Self app → tap Scan</p>
          <p className="text-[11px] text-amber-600 mt-0.5">Point the scanner at this QR code to verify your identity</p>
        </div>

        {/* Deep link fallback */}
        {deepLink && (
          <a
            href={deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full text-center text-[12px] font-semibold text-[#D6820A] hover:text-[#92400e] no-underline bg-[#D6820A]/08 border border-[#D6820A]/25 rounded-xl py-2.5 px-3 transition-colors"
          >
            Or open the Self app directly →
          </a>
        )}

        {/* Polling indicator */}
        <div className="flex items-center gap-2 text-[11px] text-gray-400">
          <LemonPulseLoader className="h-4 w-4 shrink-0 opacity-70" />
          Waiting for verification…
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── ConnectButton ────────────────────────────────────────────────────────────

export function ConnectButton() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { address, chainId } = useAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { state: verifyState, humanId, qrData, deepLink, startVerify } = useSelfClawVerify(address);
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);

  // Auto-open modal when polling starts (QR is ready)
  useEffect(() => {
    if (verifyState === "polling" && qrData) setVerifyModalOpen(true);
  }, [verifyState, qrData]);

  // Close modal once verified
  useEffect(() => {
    if (verifyState === "verified") setVerifyModalOpen(false);
  }, [verifyState]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isMainnet = chainId === 42220;
  const { data: isRegistered } = useIsRegistered(address);

  const { data: celoBalance } = useBalance({ address, query: { enabled: !!address } });
  const { data: cusdcBalance } = useBalance({
    address, token: isMainnet ? CUSDC_MAINNET : undefined,
    query: { enabled: !!address && isMainnet },
  });

  if (!ready) return <div className="h-9 w-28 rounded-xl bg-gray-800 animate-pulse" />;

  if (!authenticated) {
    return (
      <button className="btn btn-primary text-sm py-2 px-3 sm:px-4" onClick={login}>
        Enter the pool
      </button>
    );
  }

  const walletAddr = address ?? user?.wallet?.address;
  const shortAddr = walletAddr
    ? `${walletAddr.slice(0, 6)}…${walletAddr.slice(-4)}`
    : user?.email?.address?.split("@")[0] ?? "Connected";

  const isVerified = verifyState === "verified";

  return (
    <>
    {verifyModalOpen && (
      <VerifyModal
        qrData={qrData}
        deepLink={deepLink}
        onClose={() => setVerifyModalOpen(false)}
      />
    )}
    <div ref={ref} className="relative flex items-center gap-1.5">
      {/* Agent registration status — always visible */}
      {isRegistered ? (
        <span className="hidden sm:flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 select-none">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Agent
        </span>
      ) : (
        <Link
          href="/onboard"
          className="hidden sm:flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-300 rounded-full px-2 py-0.5 no-underline hover:bg-amber-100 transition-colors"
        >
          Register agent →
        </Link>
      )}

      {/* Identity verification status — always visible */}
      {isVerified ? (
        <span
          title={humanId ? `Human ID: ${humanId}` : "Human verified"}
          className="hidden sm:flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 select-none"
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Verified
        </span>
      ) : (
        <button
          onClick={() => {
            if (verifyState === "polling") { setVerifyModalOpen(true); return; }
            startVerify();
          }}
          disabled={verifyState === "loading" || verifyState === "unavailable"}
          className="hidden sm:flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-300 rounded-full px-2 py-0.5 cursor-pointer hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:cursor-default"
        >
          {verifyState === "polling" ? "Show QR →" : verifyState === "loading" ? "Verifying…" : "Verify →"}
        </button>
      )}

      <button
        className="btn btn-secondary text-sm py-2 px-3 sm:px-4 flex items-center gap-1.5"
        onClick={() => setOpen(v => !v)}
      >
        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: "var(--lemon-yellow)" }} />
        {shortAddr}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-gray-200 shadow-xl z-50 p-4" style={{ top: "100%" }}>

          {/* Balances */}
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Balances</p>
          <BalanceRow label="CELO" value={fmt(celoBalance?.value, celoBalance?.decimals ?? 18)} />
          {isMainnet ? (
            <BalanceRow label="cUSDC" value={fmt(cusdcBalance?.value, cusdcBalance?.decimals ?? 6)} />
          ) : (
            <p className="text-xs text-gray-400 italic mt-1">Token balances on mainnet only</p>
          )}

          <div className="border-t border-gray-200 my-3" />

          {/* Address */}
          {walletAddr && <CopyAddress address={walletAddr} />}

          {/* Human verification */}
          {isVerified ? (
            <div className="flex items-center gap-1.5 mb-2 py-1.5 px-2 rounded-lg bg-green-50 border border-green-100">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 shrink-0">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-xs font-semibold text-green-700">Human verified</span>
            </div>
          ) : (
            <button
              onClick={() => {
                if (verifyState === "polling") { setVerifyModalOpen(true); return; }
                startVerify();
              }}
              disabled={verifyState === "loading" || verifyState === "unavailable"}
              className="w-full mb-2 flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg border text-xs font-semibold transition-colors"
              style={{
                borderColor: verifyState === "failed" ? "#fca5a5" : verifyState === "unavailable" ? "#d1d5db" : "#D6820A40",
                color: verifyState === "failed" ? "#dc2626" : verifyState === "unavailable" ? "#9ca3af" : "#92400e",
                background: verifyState === "failed" ? "#fef2f2" : verifyState === "unavailable" ? "#f9fafb" : "#D6820A08",
                opacity: verifyState === "loading" || verifyState === "unavailable" ? 0.7 : 1,
                cursor: verifyState === "loading" || verifyState === "unavailable" ? "default" : "pointer",
              }}
            >
              <span>
                {verifyState === "loading"     ? "Starting…" :
                 verifyState === "polling"     ? "Show QR code" :
                 verifyState === "failed"      ? "Retry verify" :
                 verifyState === "unavailable" ? "Verification unavailable" :
                 "Verify as human"}
              </span>
              {verifyState === "loading" ? (
                <LemonPulseLoader className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              )}
            </button>
          )}

          {/* Settings link */}
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-1.5 w-full text-xs text-gray-500 hover:text-yellow-600 transition-colors mb-2 no-underline"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Agent settings
          </Link>

          <button
            className="w-full text-xs text-red-400 hover:text-red-300 transition-colors text-left"
            onClick={() => { setOpen(false); logout(); }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
    </>
  );
}
