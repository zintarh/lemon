"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";

// ─── Data ─────────────────────────────────────────────────────────────────────

interface Profile {
  id: string;
  name: string;
  initial: string;
  age: number;
  tagline: string;
  traits: string[];
  dealBreakers: string[];
  star: string;
  from: string;
  to: string;
  envFrom: string;
  envTo: string;
}

const PROFILES: Profile[] = [
  {
    id: "1", name: "Sage", initial: "S", age: 26,
    tagline: "Sunrise hikes and good books",
    traits: ["Adventurous", "Creative", "Bookworm"],
    dealBreakers: ["Smoking"], star: "Scorpio ♏",
    from: "#34d399", to: "#0d9488",
    envFrom: "#fde9c4", envTo: "#f9c46b",
  },
  {
    id: "2", name: "River", initial: "R", age: 28,
    tagline: "Late nights, early ideas",
    traits: ["Intellectual", "Witty", "Reader"],
    dealBreakers: ["Flakey"], star: "Aquarius ♒",
    from: "#60a5fa", to: "#0891b2",
    envFrom: "#e8f4f8", envTo: "#bae6fd",
  },
  {
    id: "3", name: "Nova", initial: "N", age: 24,
    tagline: "Passport stamps collector",
    traits: ["Playful", "Optimistic", "Traveler"],
    dealBreakers: [], star: "Sagittarius ♐",
    from: "#fb923c", to: "#e11d48",
    envFrom: "#fff7ed", envTo: "#fed7aa",
  },
  {
    id: "4", name: "Elm", initial: "E", age: 30,
    tagline: "Art museums on rainy Sundays",
    traits: ["Calm", "Ambitious", "Artistic"],
    dealBreakers: ["Negativity"], star: "Virgo ♍",
    from: "#a78bfa", to: "#7c3aed",
    envFrom: "#f5f3ff", envTo: "#ddd6fe",
  },
];

// ─── Match Overlay ────────────────────────────────────────────────────────────

function MatchOverlay({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <motion.div
        initial={{ scale: 0.8, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 18 }}
        style={{
          background: "#fff", borderRadius: 28, overflow: "hidden",
          width: "100%", maxWidth: 360, boxShadow: "0 32px 80px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{
          height: 180,
          background: `linear-gradient(145deg, ${profile.from}, ${profile.to})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", overflow: "hidden",
        }}>
          <span style={{ fontSize: 140, fontWeight: 900, color: "rgba(255,255,255,0.18)", fontFamily: "Inter, sans-serif" }}>
            {profile.initial}
          </span>
          {["🍋", "✨", "💛", "🌟"].map((em, i) => (
            <motion.span key={i} style={{ position: "absolute", fontSize: 26 }}
              initial={{ y: 0, x: (i - 1.5) * 50, opacity: 1 }}
              animate={{ y: -80, x: (i - 1.5) * 80, opacity: 0, rotate: 360 }}
              transition={{ duration: 1.3, delay: i * 0.12, ease: "easeOut" }}
            >{em}</motion.span>
          ))}
        </div>
        <div style={{ padding: "24px 28px 28px", display: "flex", flexDirection: "column", gap: 16, alignItems: "center", textAlign: "center" }}>
          <div>
            <h2 style={{ fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: 26, color: "#2d1506", marginBottom: 8 }}>
              It&apos;s a Match!
            </h2>
            <p style={{ color: "#8c6040", fontSize: 14, lineHeight: 1.6 }}>
              Your agent and <strong style={{ color: "#3d1f08" }}>{profile.name}</strong> are about to have a conversation.
            </p>
          </div>
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
            <motion.button whileTap={{ scale: 0.97 }} onClick={onClose} style={{
              width: "100%", padding: 14, borderRadius: 14,
              background: "linear-gradient(135deg,#e8a820,#c8820a)",
              color: "#fff", fontWeight: 700, fontSize: 15, border: "none",
              cursor: "pointer", fontFamily: "Inter, sans-serif",
              boxShadow: "0 4px 16px rgba(200,146,10,0.35)",
            }}>Keep swiping</motion.button>
            <motion.button whileTap={{ scale: 0.97 }} onClick={onClose} style={{
              width: "100%", padding: 14, borderRadius: 14,
              background: "#f5f0e8", color: "#8c6040", fontWeight: 600,
              fontSize: 15, border: "1px solid rgba(200,146,10,0.2)", cursor: "pointer",
            }}>See dashboard</motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Swipe Card ───────────────────────────────────────────────────────────────

function SwipeCard({
  profile,
  index,
  isTop,
  onSwipe,
}: {
  profile: Profile;
  index: number;
  isTop: boolean;
  onSwipe: (dir: "left" | "right") => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-18, 0, 18]);
  const likeOpacity = useTransform(x, [20, 80], [0, 1]);
  const nopeOpacity = useTransform(x, [-80, -20], [1, 0]);

  const cardScale = 1 - index * 0.05;
  const cardY = index * 14;

  return (
    <motion.div
      style={{
        position: "absolute",
        width: 300,
        height: 450,
        zIndex: 10 - index,
        scale: cardScale,
        y: cardY,
        x: isTop ? x : 0,
        rotate: isTop ? rotate : 0,
        cursor: isTop ? "grab" : "default",
        touchAction: "none",
      }}
      drag={isTop ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.8}
      onDragEnd={(_, info) => {
        if (info.offset.x > 100 || info.velocity.x > 500) onSwipe("right");
        else if (info.offset.x < -100 || info.velocity.x < -500) onSwipe("left");
      }}
      whileTap={isTop ? { cursor: "grabbing" } : {}}
    >
      {/* Card body */}
      <div style={{
        width: "100%", height: "100%",
        borderRadius: 24, overflow: "hidden",
        boxShadow: isTop
          ? "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.1)"
          : "0 8px 24px rgba(0,0,0,0.1)",
        background: "#faf8f3",
      }}>
        {/* Avatar */}
        <div style={{
          height: 260,
          background: `linear-gradient(145deg, ${profile.from}, ${profile.to})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
        }}>
          <div style={{ position: "absolute", top: 16, left: 18, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)" }}>
            {profile.star}
          </div>
          <div style={{ position: "absolute", top: 16, right: 18, background: "rgba(255,255,255,0.25)", backdropFilter: "blur(4px)", borderRadius: 100, padding: "4px 12px", fontSize: 14, fontWeight: 700, color: "#fff" }}>
            {profile.age}
          </div>
          <span style={{ fontSize: 140, fontWeight: 900, color: "rgba(255,255,255,0.2)", fontFamily: "Inter, sans-serif", lineHeight: 1 }}>
            {profile.initial}
          </span>
        </div>

        {/* Info */}
        <div style={{ padding: "16px 18px" }}>
          <div style={{ fontWeight: 800, fontSize: 26, color: "#3d1f08", fontFamily: "Inter, sans-serif", marginBottom: 6 }}>
            {profile.name}
          </div>
          <div style={{ fontSize: 15, color: "#8c6040", fontStyle: "italic", marginBottom: 12 }}>
            {profile.tagline}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {profile.traits.map(t => (
              <span key={t} style={{ fontSize: 12, fontWeight: 700, padding: "4px 11px", borderRadius: 100, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>{t}</span>
            ))}
            {profile.dealBreakers.map(db => (
              <span key={db} style={{ fontSize: 12, fontWeight: 700, padding: "4px 11px", borderRadius: 100, background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca" }}>✕ {db}</span>
            ))}
          </div>
        </div>
      </div>

      {/* LIKE stamp */}
      {isTop && (
        <motion.div style={{
          position: "absolute", top: 28, left: 20, opacity: likeOpacity,
          padding: "6px 16px", border: "3px solid #22c55e", borderRadius: 10,
          color: "#22c55e", fontWeight: 900, fontSize: 22,
          letterSpacing: "0.1em", transform: "rotate(-14deg)",
          background: "rgba(255,255,255,0.85)", backdropFilter: "blur(4px)",
          fontFamily: "Inter, sans-serif",
        }}>LIKE</motion.div>
      )}
      {/* NOPE stamp */}
      {isTop && (
        <motion.div style={{
          position: "absolute", top: 28, right: 20, opacity: nopeOpacity,
          padding: "6px 16px", border: "3px solid #ef4444", borderRadius: 10,
          color: "#ef4444", fontWeight: 900, fontSize: 22,
          letterSpacing: "0.1em", transform: "rotate(14deg)",
          background: "rgba(255,255,255,0.85)", backdropFilter: "blur(4px)",
          fontFamily: "Inter, sans-serif",
        }}>NOPE</motion.div>
      )}
    </motion.div>
  );
}

// ─── Lemon Mascot (CSS) ───────────────────────────────────────────────────────

function LemonMascot({ message }: { message: string }) {
  return (
    <motion.div
      animate={{ y: [0, -8, 0], rotate: [0, 4, -4, 0] }}
      transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
      style={{ position: "absolute", bottom: 120, left: 24, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, zIndex: 30 }}
    >
      {/* Speech bubble */}
      <AnimatePresence mode="wait">
        {message && (
          <motion.div
            key={message}
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)",
              borderRadius: 14, padding: "8px 12px", maxWidth: 180,
              fontSize: 12, fontWeight: 600, color: "#7c4a1e",
              boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
              border: "1px solid rgba(240,200,80,0.4)",
              lineHeight: 1.45, position: "relative",
            }}
          >
            {message}
            <div style={{
              position: "absolute", bottom: -6, left: 16,
              width: 0, height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid rgba(255,255,255,0.92)",
            }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lemon emoji as mascot */}
      <div style={{ fontSize: 42, lineHeight: 1, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.15))" }}>
        🍋
      </div>
    </motion.div>
  );
}

// ─── Environment Background ───────────────────────────────────────────────────

function EnvBackground({ profile }: { profile: Profile | undefined }) {
  const from = profile?.envFrom ?? "#fde9c4";
  const to = profile?.envTo ?? "#f9c46b";

  return (
    <motion.div
      key={profile?.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      style={{
        position: "absolute", inset: 0, zIndex: 0,
        background: `linear-gradient(180deg, ${from} 0%, ${to} 60%, #c8824a 100%)`,
      }}
    >
      {/* Sun */}
      <div style={{
        position: "absolute", top: 60, right: 60,
        width: 80, height: 80, borderRadius: "50%",
        background: "rgba(255,210,60,0.4)",
        boxShadow: "0 0 0 20px rgba(255,210,60,0.15), 0 0 0 40px rgba(255,210,60,0.07)",
      }} />

      {/* Floor */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "30%",
        background: "rgba(180,100,60,0.25)",
        borderTop: "1px solid rgba(180,100,60,0.2)",
      }} />

      {/* Left plant */}
      <motion.div
        animate={{ rotate: [0, 2, -2, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        style={{ position: "absolute", bottom: "28%", left: 20, fontSize: 52, lineHeight: 1, transformOrigin: "bottom center", filter: "drop-shadow(2px 4px 6px rgba(0,0,0,0.15))" }}
      >
        🪴
      </motion.div>

      {/* Right plant */}
      <motion.div
        animate={{ rotate: [0, -2, 2, 0] }}
        transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut", delay: 0.5 }}
        style={{ position: "absolute", bottom: "28%", right: 20, fontSize: 44, lineHeight: 1, transformOrigin: "bottom center", filter: "drop-shadow(2px 4px 6px rgba(0,0,0,0.15))" }}
      >
        🌿
      </motion.div>

      {/* Back plants */}
      <div style={{ position: "absolute", bottom: "36%", left: 70, fontSize: 32, opacity: 0.6 }}>🪴</div>
      <div style={{ position: "absolute", bottom: "36%", right: 70, fontSize: 28, opacity: 0.6 }}>🌿</div>
    </motion.div>
  );
}

// ─── Main SwipeScene ──────────────────────────────────────────────────────────

export interface SwipeSceneProps {
  agentName?: string;
}

export default function SwipeScene({ agentName }: SwipeSceneProps) {
  const [profiles, setProfiles] = useState<Profile[]>(PROFILES);
  const [matchedProfile, setMatchedProfile] = useState<Profile | null>(null);
  const [showMatch, setShowMatch] = useState(false);
  const [msgIdx, setMsgIdx] = useState(0);

  const MESSAGES = [
    `${agentName ?? "Your agent"} is ready to meet someone ✨`,
    "Sage scored high on adventure compatibility!",
    "River's intellectual match is strong.",
    "Nova has been to 12 countries — bold.",
    "Elm shares your taste in art.",
  ];

  const handleSwipe = useCallback((id: string, dir: "left" | "right") => {
    const p = profiles.find(x => x.id === id);
    if (dir === "right" && p) {
      setMatchedProfile(p);
      setTimeout(() => setShowMatch(true), 300);
    }
    setProfiles(prev => prev.filter(x => x.id !== id));
    setMsgIdx(i => Math.min(i + 1, MESSAGES.length - 1));
  }, [profiles]);

  const top = profiles[0];

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>

      {/* Environment background */}
      <EnvBackground profile={top} />

      {/* Card stack — centered */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 10,
      }}>
        <div style={{ position: "relative", width: 300, height: 420 }}>
          {profiles.slice(0, 3).map((p, i) => (
            <SwipeCard
              key={p.id}
              profile={p}
              index={i}
              isTop={i === 0}
              onSwipe={(dir) => handleSwipe(p.id, dir)}
            />
          ))}
        </div>
      </div>

      {/* Lemon mascot + speech bubble */}
      <LemonMascot message={MESSAGES[msgIdx]} />

      {/* Action buttons */}
      <AnimatePresence>
        {profiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              position: "absolute", bottom: 36, left: 0, right: 0,
              display: "flex", justifyContent: "center", alignItems: "center",
              gap: 20, zIndex: 20,
            }}
          >
            <motion.button
              whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
              onClick={() => top && handleSwipe(top.id, "left")}
              style={{
                width: 64, height: 64, borderRadius: "50%", background: "#fff",
                border: "2px solid #fecaca", color: "#dc2626", fontSize: 24,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              }}
            >✕</motion.button>

            <motion.button
              whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
              onClick={() => top && handleSwipe(top.id, "right")}
              style={{
                width: 52, height: 52, borderRadius: "50%", background: "#fff",
                border: "2px solid #bfdbfe", color: "#3b82f6", fontSize: 20,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", boxShadow: "0 6px 18px rgba(0,0,0,0.1)",
              }}
            >★</motion.button>

            <motion.button
              whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
              onClick={() => top && handleSwipe(top.id, "right")}
              style={{
                width: 64, height: 64, borderRadius: "50%", background: "#fff",
                border: "2px solid #bbf7d0", color: "#16a34a", fontSize: 24,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              }}
            >♥</motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      <AnimatePresence>
        {profiles.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              position: "absolute", inset: 0, zIndex: 20,
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 16,
            }}
          >
            <motion.div animate={{ rotate: [0, 6, -6, 0] }} transition={{ repeat: Infinity, duration: 3 }}>
              <img src="/lemon-single.png" alt="Lemon" style={{ width: 64, height: 64, objectFit: "contain" }} />
            </motion.div>
            <p style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 18, color: "#7c4a1e", textAlign: "center", padding: "0 32px" }}>
              The right one takes a moment to arrive.
            </p>
            <motion.button
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
              onClick={() => { setProfiles(PROFILES); setMsgIdx(0); }}
              style={{
                padding: "12px 28px", borderRadius: 14,
                background: "linear-gradient(135deg,#e8a820,#c8820a)",
                color: "#fff", fontWeight: 700, fontSize: 15,
                border: "none", cursor: "pointer",
                boxShadow: "0 4px 16px rgba(200,146,10,0.35)",
                fontFamily: "Inter, sans-serif",
              }}
            >Refresh matches</motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Match overlay */}
      <AnimatePresence>
        {showMatch && matchedProfile && (
          <MatchOverlay profile={matchedProfile} onClose={() => setShowMatch(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
