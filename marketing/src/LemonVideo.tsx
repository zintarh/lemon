import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ease = (frame: number, from: number, to: number, start: number, end: number) =>
  interpolate(frame, [start, end], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  });

const spr = (frame: number, delay = 0, fps = 30, damping = 18, stiffness = 90) =>
  spring({ frame: frame - delay, fps, config: { damping, stiffness, mass: 0.8 } });

// ── Theme ─────────────────────────────────────────────────────────────────────

const C = {
  bg:      "#080808",
  bgCard:  "rgba(255,255,255,0.04)",
  border:  "rgba(255,255,255,0.08)",
  white:   "#FFFFFF",
  dim:     "rgba(255,255,255,0.42)",
  dimmer:  "rgba(255,255,255,0.22)",
  lemon:   "#F5E642",
  rose:    "#FF6B8A",
  grad:    "linear-gradient(135deg, #F5E642 0%, #FF6B8A 100%)",
  gradBg:  "linear-gradient(135deg, rgba(245,230,66,0.12) 0%, rgba(255,107,138,0.12) 100%)",
};

// ── Ambient background glow ───────────────────────────────────────────────────

const Glow: React.FC<{ x: string; y: string; color: string; size?: number; opacity?: number }> = ({
  x, y, color, size = 500, opacity = 0.18,
}) => (
  <div style={{
    position: "absolute", left: x, top: y,
    width: size, height: size,
    borderRadius: "50%",
    background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
    opacity,
    transform: "translate(-50%, -50%)",
    filter: "blur(2px)",
    pointerEvents: "none",
  }} />
);

// ── Gradient text ─────────────────────────────────────────────────────────────

const GText: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span style={{
    background: C.grad,
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    ...style,
  }}>
    {children}
  </span>
);

// ── Scene 1 · Problem (0–90f · 3s) ───────────────────────────────────────────

const Scene1: React.FC<{ f: number; fps: number }> = ({ f, fps }) => {
  const lines = [
    "You spend hours swiping.",
    "They sell your data.",
    "You stay single.",
    "They stay rich.",
  ];

  return (
    <AbsoluteFill style={{ background: C.bg, justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 0 }}>
      <Glow x="50%" y="40%" color="#F5E642" size={700} opacity={0.08} />
      <Glow x="80%" y="70%" color="#FF6B8A" size={400} opacity={0.1} />

      <div style={{
        padding: "0 88px",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 28,
      }}>
        {lines.map((line, i) => {
          const delay = i * 16;
          const s = spr(f, delay, fps, 20, 80);
          const opacity = ease(f, 0, 1, delay, delay + 14);
          return (
            <div key={line} style={{
              opacity,
              transform: `translateX(${interpolate(s, [0, 1], [-40, 0])}px)`,
              fontSize: i < 2 ? 54 : 54,
              fontWeight: 800,
              color: i % 2 === 0 ? C.white : C.dim,
              lineHeight: 1.15,
              letterSpacing: -1.5,
            }}>
              {line}
            </div>
          );
        })}

        <div style={{
          opacity: ease(f, 0, 1, 68, 82),
          transform: `translateY(${interpolate(spr(f, 68, fps), [0,1], [20, 0])}px)`,
          marginTop: 20,
          width: 80,
          height: 3,
          background: C.grad,
          borderRadius: 2,
        }} />

        <div style={{
          opacity: ease(f, 0, 1, 72, 86),
          transform: `translateY(${interpolate(spr(f, 72, fps), [0,1], [16, 0])}px)`,
          fontSize: 30,
          color: C.dim,
          letterSpacing: -0.5,
        }}>
          Dating apps are broken by design.
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 2 · Brand reveal (90–180f · 3s) ────────────────────────────────────

const Scene2: React.FC<{ f: number; fps: number }> = ({ f, fps }) => {
  const logoS = spr(f, 0, fps, 16, 100);
  const glowO = ease(f, 0, 1, 0, 40);

  return (
    <AbsoluteFill style={{ background: C.bg, justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 36 }}>
      {/* Radial glow behind logo */}
      <div style={{
        position: "absolute",
        width: 600, height: 600,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(245,230,66,0.15) 0%, rgba(255,107,138,0.08) 50%, transparent 70%)",
        opacity: glowO,
      }} />

      {/* Logo mark */}
      <div style={{
        transform: `scale(${logoS})`,
        width: 148, height: 148,
        borderRadius: 40,
        background: C.grad,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 72,
        boxShadow: "0 24px 80px rgba(245,230,66,0.3), 0 8px 24px rgba(255,107,138,0.2)",
      }}>
        🍋
      </div>

      {/* Wordmark */}
      <div style={{
        opacity: ease(f, 0, 1, 12, 28),
        transform: `translateY(${interpolate(spr(f, 12, fps), [0,1], [32, 0])}px)`,
        fontSize: 108,
        fontWeight: 900,
        color: C.white,
        letterSpacing: -5,
        lineHeight: 1,
      }}>
        Lemon
      </div>

      {/* Tagline */}
      <div style={{
        opacity: ease(f, 0, 1, 28, 46),
        transform: `translateY(${interpolate(spr(f, 28, fps), [0,1], [24, 0])}px)`,
        fontSize: 32,
        fontWeight: 500,
        color: C.dim,
        textAlign: "center",
        letterSpacing: -0.3,
        lineHeight: 1.5,
        padding: "0 100px",
      }}>
        Your AI agent matches,{"\n"}converses, and dates for you.
      </div>

      {/* Pill */}
      <div style={{
        opacity: ease(f, 0, 1, 48, 64),
        transform: `translateY(${interpolate(spr(f, 48, fps), [0,1], [16, 0])}px)`,
        padding: "12px 36px",
        borderRadius: 100,
        border: `1.5px solid rgba(245,230,66,0.35)`,
        fontSize: 24,
        fontWeight: 600,
        color: C.lemon,
        letterSpacing: 0.5,
      }}>
        Built on Celo
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 3 · How it works (180–360f · 6s) ───────────────────────────────────

const steps = [
  { n: "01", icon: "🧠", title: "Build your agent",     sub: "Personality · Preferences · Deal breakers" },
  { n: "02", icon: "💘", title: "AI matching",           sub: "Compatible agents paired on-chain" },
  { n: "03", icon: "💬", title: "Agents converse",       sub: "30-min autonomous AI conversation" },
  { n: "04", icon: "💸", title: "Date booked & paid",    sub: "cUSD settled via x402 on Celo" },
  { n: "05", icon: "🖼️", title: "Minted as NFT",         sub: "AI image · ERC-721 · IPFS" },
  { n: "06", icon: "🤝", title: "Verify & meet IRL",     sub: "Self Protocol → share contact info" },
];

const Scene3: React.FC<{ f: number; fps: number }> = ({ f, fps }) => {
  return (
    <AbsoluteFill style={{
      background: C.bg,
      flexDirection: "column",
      padding: "72px 72px 60px",
    }}>
      <Glow x="90%" y="10%" color="#F5E642" size={500} opacity={0.07} />
      <Glow x="10%" y="90%" color="#FF6B8A" size={400} opacity={0.07} />

      {/* Header */}
      <div style={{
        opacity: ease(f, 0, 1, 0, 16),
        transform: `translateY(${interpolate(spr(f, 0, fps), [0,1], [20, 0])}px)`,
        fontSize: 20,
        fontWeight: 700,
        color: C.dim,
        letterSpacing: 3,
        textTransform: "uppercase",
        marginBottom: 20,
      }}>
        How it works
      </div>

      {/* Steps grid */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
        {steps.map((s, i) => {
          const delay = 10 + i * 20;
          const opacity = ease(f, 0, 1, delay, delay + 16);
          const x = interpolate(spr(f, delay, fps), [0, 1], [-30, 0]);

          return (
            <div key={s.n} style={{
              opacity,
              transform: `translateX(${x}px)`,
              display: "flex",
              alignItems: "center",
              gap: 24,
              padding: "20px 28px",
              borderRadius: 20,
              background: C.bgCard,
              border: `1px solid ${C.border}`,
            }}>
              {/* Number */}
              <div style={{
                fontSize: 13,
                fontWeight: 800,
                color: C.dimmer,
                letterSpacing: 1,
                width: 28,
                flexShrink: 0,
              }}>
                {s.n}
              </div>

              {/* Icon */}
              <div style={{ fontSize: 36, flexShrink: 0 }}>{s.icon}</div>

              {/* Text */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: C.white, letterSpacing: -0.5 }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 20, color: C.dim, marginTop: 2 }}>
                  {s.sub}
                </div>
              </div>

              {/* Accent bar */}
              <div style={{
                width: 3,
                height: 36,
                borderRadius: 2,
                background: i % 2 === 0 ? C.lemon : C.rose,
                opacity: 0.6,
                flexShrink: 0,
              }} />
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 4 · Proof (360–450f · 3s) ──────────────────────────────────────────

const stats = [
  { value: "ERC-8004",    label: "On-chain agent identity & reputation" },
  { value: "x402",        label: "HTTP-native autonomous payments" },
  { value: "Self",        label: "Human verification — zero-knowledge" },
  { value: "ERC-721",     label: "Every date minted as an NFT on Celo" },
];

const Scene4: React.FC<{ f: number; fps: number }> = ({ f, fps }) => {
  return (
    <AbsoluteFill style={{
      background: C.bg,
      flexDirection: "column",
      padding: "80px 72px",
      gap: 40,
    }}>
      <Glow x="50%" y="50%" color="#FF6B8A" size={800} opacity={0.07} />

      <div style={{
        opacity: ease(f, 0, 1, 0, 18),
        transform: `translateY(${interpolate(spr(f, 0, fps), [0,1], [24, 0])}px)`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.dim, letterSpacing: 3, textTransform: "uppercase" }}>
          Tech stack
        </div>
        <div style={{ fontSize: 58, fontWeight: 900, color: C.white, letterSpacing: -2, lineHeight: 1.05 }}>
          Built with{" "}
          <GText>cutting-edge</GText>
          {"\n"}standards.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {stats.map((s, i) => {
          const delay = 22 + i * 16;
          const opacity = ease(f, 0, 1, delay, delay + 14);
          const x = interpolate(spr(f, delay, fps), [0, 1], [40, 0]);

          return (
            <div key={s.value} style={{
              opacity,
              transform: `translateX(${x}px)`,
              display: "flex",
              alignItems: "center",
              gap: 28,
              padding: "24px 32px",
              borderRadius: 20,
              background: C.bgCard,
              border: `1px solid ${C.border}`,
            }}>
              <div style={{
                fontSize: 34,
                fontWeight: 900,
                letterSpacing: -1,
                background: C.grad,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                minWidth: 120,
              }}>
                {s.value}
              </div>
              <div style={{
                width: 1,
                height: 36,
                background: C.border,
                flexShrink: 0,
              }} />
              <div style={{ fontSize: 24, color: C.dim, letterSpacing: -0.3 }}>
                {s.label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ── Scene 5 · CTA (450–540f · 3s) ────────────────────────────────────────────

const Scene5: React.FC<{ f: number; fps: number }> = ({ f, fps }) => {
  const logoS  = spr(f, 0, fps, 14, 110);
  const glowO  = ease(f, 0, 1, 0, 50);

  const pulse = 1 + Math.sin(f * 0.15) * 0.025;

  return (
    <AbsoluteFill style={{
      background: C.bg,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 0,
    }}>
      {/* Ambient */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(245,230,66,0.09) 0%, rgba(255,107,138,0.06) 50%, transparent 70%)",
        opacity: glowO,
      }} />

      {/* Logo */}
      <div style={{
        transform: `scale(${logoS * pulse})`,
        width: 120, height: 120,
        borderRadius: 32,
        background: C.grad,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 60,
        marginBottom: 40,
        boxShadow: "0 32px 80px rgba(245,230,66,0.25), 0 8px 32px rgba(255,107,138,0.15)",
      }}>
        🍋
      </div>

      {/* Headline */}
      <div style={{
        opacity: ease(f, 0, 1, 8, 26),
        transform: `translateY(${interpolate(spr(f, 8, fps), [0,1], [40, 0])}px)`,
        fontSize: 76,
        fontWeight: 900,
        color: C.white,
        letterSpacing: -3,
        textAlign: "center",
        lineHeight: 1.05,
        padding: "0 72px",
        marginBottom: 28,
      }}>
        The future of dating{"\n"}is a{" "}
        <GText>protocol.</GText>
      </div>

      {/* Sub */}
      <div style={{
        opacity: ease(f, 0, 1, 28, 44),
        transform: `translateY(${interpolate(spr(f, 28, fps), [0,1], [24, 0])}px)`,
        fontSize: 28,
        color: C.dim,
        textAlign: "center",
        lineHeight: 1.6,
        letterSpacing: -0.3,
        marginBottom: 52,
      }}>
        No algorithm to game.{"\n"}No data to sell.{"\n"}Just matches that matter.
      </div>

      {/* CTA button */}
      <div style={{
        opacity: ease(f, 0, 1, 44, 60),
        transform: `translateY(${interpolate(spr(f, 44, fps), [0,1], [20, 0])}px)`,
        padding: "20px 72px",
        borderRadius: 100,
        background: C.grad,
        fontSize: 34,
        fontWeight: 800,
        color: "#0a0a0a",
        letterSpacing: -0.5,
        boxShadow: "0 16px 48px rgba(245,230,66,0.25)",
      }}>
        lemon.dating
      </div>

      {/* Tagline */}
      <div style={{
        opacity: ease(f, 0, 1, 60, 76),
        marginTop: 28,
        fontSize: 22,
        color: C.dimmer,
        letterSpacing: 0.5,
      }}>
        Powered by Celo · ERC-8004 · x402 · Self Protocol
      </div>
    </AbsoluteFill>
  );
};

// ── Root ──────────────────────────────────────────────────────────────────────

export const LemonVideo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{
      fontFamily: "'Inter', 'Helvetica Neue', -apple-system, sans-serif",
      background: C.bg,
    }}>
      <Sequence from={0}   durationInFrames={90}>  <Scene1 f={frame}       fps={fps} /></Sequence>
      <Sequence from={90}  durationInFrames={90}>  <Scene2 f={frame - 90}  fps={fps} /></Sequence>
      <Sequence from={180} durationInFrames={180}> <Scene3 f={frame - 180} fps={fps} /></Sequence>
      <Sequence from={360} durationInFrames={90}>  <Scene4 f={frame - 360} fps={fps} /></Sequence>
      <Sequence from={450} durationInFrames={90}>  <Scene5 f={frame - 450} fps={fps} /></Sequence>
    </AbsoluteFill>
  );
};
