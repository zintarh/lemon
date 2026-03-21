/** Wordmark + geometric mark — no emoji */
export function LogoMark({ size = "md" }: { size?: "sm" | "md" }) {
  const s = size === "sm" ? "w-7 h-7" : "w-9 h-9";
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={`${s} rounded-2xl flex-shrink-0 shadow-sm`}
        style={{
          background: "linear-gradient(145deg, var(--gold-bright) 0%, var(--gold) 55%, #A67408 100%)",
          boxShadow: "0 2px 8px rgba(200,146,10,0.25)",
        }}
        aria-hidden
      />
      <span
        className="font-display font-bold tracking-tight"
        style={{
          color: "var(--text)",
          fontSize: size === "sm" ? "1.125rem" : "1.35rem",
          letterSpacing: "-0.03em",
        }}
      >
        Lemon
      </span>
    </span>
  );
}
