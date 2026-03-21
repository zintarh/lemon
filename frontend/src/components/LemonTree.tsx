export default function LemonTree({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 420 620"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ── Ground glow ─────────────────────────────────── */}
      <ellipse cx="210" cy="590" rx="120" ry="18" fill="#2d5a1e" opacity="0.5" />
      <ellipse cx="210" cy="590" rx="80"  ry="10" fill="#3d7a28" opacity="0.4" />

      {/* ── Roots ────────────────────────────────────────── */}
      <path d="M190 570 Q170 580 145 585" stroke="#3a1e08" strokeWidth="8" strokeLinecap="round"/>
      <path d="M210 572 Q215 582 225 588" stroke="#3a1e08" strokeWidth="6" strokeLinecap="round"/>
      <path d="M220 568 Q248 578 265 582" stroke="#3a1e08" strokeWidth="7" strokeLinecap="round"/>

      {/* ── Main trunk ───────────────────────────────────── */}
      <path d="M195 570 Q188 500 192 440 Q196 390 200 340" stroke="#5c3a1e" strokeWidth="28" strokeLinecap="round"/>
      <path d="M200 340 Q205 290 202 250 Q199 215 205 180" stroke="#5c3a1e" strokeWidth="22" strokeLinecap="round"/>
      {/* trunk highlight */}
      <path d="M198 560 Q193 490 196 430 Q200 380 203 330" stroke="#7a4e28" strokeWidth="10" strokeLinecap="round" opacity="0.5"/>

      {/* ── Branches ─────────────────────────────────────── */}
      {/* Left low */}
      <path d="M196 420 Q160 390 120 370 Q90 355 68 340" stroke="#5c3a1e" strokeWidth="14" strokeLinecap="round"/>
      <path d="M68 340 Q45 328 30 320" stroke="#5c3a1e" strokeWidth="9" strokeLinecap="round"/>
      <path d="M68 340 Q55 325 50 308" stroke="#5c3a1e" strokeWidth="7" strokeLinecap="round"/>
      {/* Right low */}
      <path d="M200 400 Q240 375 280 360 Q315 348 345 340" stroke="#5c3a1e" strokeWidth="13" strokeLinecap="round"/>
      <path d="M345 340 Q372 330 385 318" stroke="#5c3a1e" strokeWidth="8" strokeLinecap="round"/>
      {/* Left mid */}
      <path d="M202 320 Q165 295 132 270 Q108 252 88 238" stroke="#5c3a1e" strokeWidth="12" strokeLinecap="round"/>
      <path d="M88 238 Q70 225 55 215" stroke="#5c3a1e" strokeWidth="7" strokeLinecap="round"/>
      {/* Right mid */}
      <path d="M203 310 Q240 282 272 262 Q300 245 328 232" stroke="#5c3a1e" strokeWidth="11" strokeLinecap="round"/>
      <path d="M328 232 Q352 220 370 210" stroke="#5c3a1e" strokeWidth="7" strokeLinecap="round"/>
      {/* Upper left */}
      <path d="M203 240 Q175 210 150 190 Q130 175 110 162" stroke="#5c3a1e" strokeWidth="10" strokeLinecap="round"/>
      {/* Upper right */}
      <path d="M205 230 Q232 200 258 180 Q282 163 305 150" stroke="#5c3a1e" strokeWidth="9" strokeLinecap="round"/>
      {/* Top center */}
      <path d="M205 185 Q205 155 207 128 Q208 110 210 92" stroke="#5c3a1e" strokeWidth="8" strokeLinecap="round"/>

      {/* ── Foliage clusters (back layer) ────────────────── */}
      <ellipse cx="65"  cy="310" rx="55" ry="48" fill="#1e4012" opacity="0.9"/>
      <ellipse cx="350" cy="320" rx="52" ry="45" fill="#1e4012" opacity="0.9"/>
      <ellipse cx="82"  cy="222" rx="50" ry="44" fill="#213f14" opacity="0.9"/>
      <ellipse cx="335" cy="215" rx="48" ry="42" fill="#213f14" opacity="0.9"/>
      <ellipse cx="105" cy="155" rx="48" ry="42" fill="#244416" opacity="0.9"/>
      <ellipse cx="312" cy="142" rx="46" ry="40" fill="#244416" opacity="0.9"/>

      {/* ── Foliage clusters (mid layer) ─────────────────── */}
      <ellipse cx="52"  cy="298" rx="45" ry="40" fill="#2d5a1e" opacity="0.95"/>
      <ellipse cx="105" cy="285" rx="50" ry="44" fill="#2d5a1e" opacity="0.95"/>
      <ellipse cx="160" cy="272" rx="48" ry="42" fill="#2d5a1e" opacity="0.95"/>
      <ellipse cx="358" cy="308" rx="44" ry="38" fill="#2d5a1e" opacity="0.95"/>
      <ellipse cx="305" cy="295" rx="49" ry="42" fill="#2d5a1e" opacity="0.95"/>
      <ellipse cx="248" cy="278" rx="46" ry="40" fill="#2d5a1e" opacity="0.95"/>
      <ellipse cx="72"  cy="208" rx="44" ry="38" fill="#335f22" opacity="0.95"/>
      <ellipse cx="128" cy="198" rx="48" ry="42" fill="#335f22" opacity="0.95"/>
      <ellipse cx="182" cy="188" rx="45" ry="40" fill="#335f22" opacity="0.95"/>
      <ellipse cx="232" cy="185" rx="44" ry="38" fill="#335f22" opacity="0.95"/>
      <ellipse cx="285" cy="195" rx="46" ry="40" fill="#335f22" opacity="0.95"/>
      <ellipse cx="340" cy="200" rx="43" ry="37" fill="#335f22" opacity="0.95"/>
      <ellipse cx="100" cy="143" rx="46" ry="40" fill="#385e25" opacity="0.95"/>
      <ellipse cx="155" cy="132" rx="50" ry="44" fill="#385e25" opacity="0.95"/>
      <ellipse cx="210" cy="125" rx="52" ry="46" fill="#385e25" opacity="0.95"/>
      <ellipse cx="262" cy="130" rx="49" ry="43" fill="#385e25" opacity="0.95"/>
      <ellipse cx="315" cy="138" rx="46" ry="40" fill="#385e25" opacity="0.95"/>

      {/* ── Foliage (front bright layer) ─────────────────── */}
      <ellipse cx="75"  cy="286" rx="38" ry="34" fill="#3d7a28"/>
      <ellipse cx="135" cy="268" rx="42" ry="36" fill="#3d7a28"/>
      <ellipse cx="198" cy="258" rx="44" ry="38" fill="#3d7a28"/>
      <ellipse cx="255" cy="262" rx="42" ry="36" fill="#3d7a28"/>
      <ellipse cx="318" cy="275" rx="40" ry="34" fill="#3d7a28"/>
      <ellipse cx="88"  cy="195" rx="40" ry="34" fill="#4a8830"/>
      <ellipse cx="148" cy="178" rx="44" ry="38" fill="#4a8830"/>
      <ellipse cx="210" cy="170" rx="48" ry="42" fill="#4a8830"/>
      <ellipse cx="268" cy="175" rx="44" ry="38" fill="#4a8830"/>
      <ellipse cx="326" cy="188" rx="40" ry="34" fill="#4a8830"/>
      <ellipse cx="115" cy="130" rx="42" ry="36" fill="#4d8f32"/>
      <ellipse cx="172" cy="112" rx="48" ry="42" fill="#4d8f32"/>
      <ellipse cx="232" cy="108" rx="50" ry="44" fill="#4d8f32"/>
      <ellipse cx="288" cy="116" rx="46" ry="40" fill="#4d8f32"/>
      <ellipse cx="210" cy="78"  rx="52" ry="46" fill="#55962e"/>
      <ellipse cx="168" cy="68"  rx="44" ry="38" fill="#55962e"/>
      <ellipse cx="252" cy="72"  rx="44" ry="38" fill="#55962e"/>

      {/* ── Leaf veins / texture overlay ─────────────────── */}
      <ellipse cx="75"  cy="286" rx="38" ry="34" fill="url(#leafShine)" opacity="0.15"/>
      <ellipse cx="210" cy="170" rx="48" ry="42" fill="url(#leafShine)" opacity="0.15"/>
      <ellipse cx="210" cy="78"  rx="52" ry="46" fill="url(#leafShine)" opacity="0.15"/>

      {/* ── Lemons ───────────────────────────────────────── */}
      {/* left cluster */}
      <ellipse cx="50"  cy="298" rx="11" ry="9"  fill="#f5c842"/>
      <ellipse cx="38"  cy="285" rx="10" ry="8"  fill="#f5c842"/>
      <ellipse cx="62"  cy="278" rx="9"  ry="7.5" fill="#f5d060"/>
      <ellipse cx="108" cy="268" rx="11" ry="9"  fill="#f5c842"/>
      <ellipse cx="125" cy="256" rx="10" ry="8"  fill="#f5d060"/>
      {/* right cluster */}
      <ellipse cx="358" cy="280" rx="11" ry="9"  fill="#f5c842"/>
      <ellipse cx="372" cy="266" rx="10" ry="8"  fill="#f5d060"/>
      <ellipse cx="335" cy="260" rx="9"  ry="7.5" fill="#f5c842"/>
      {/* mid left */}
      <ellipse cx="78"  cy="190" rx="11" ry="9"  fill="#f5c842"/>
      <ellipse cx="92"  cy="178" rx="10" ry="8"  fill="#f5d060"/>
      <ellipse cx="148" cy="172" rx="11" ry="9"  fill="#f5c842"/>
      <ellipse cx="162" cy="160" rx="9"  ry="7.5" fill="#f5d060"/>
      {/* mid right */}
      <ellipse cx="322" cy="182" rx="11" ry="9"  fill="#f5c842"/>
      <ellipse cx="310" cy="168" rx="10" ry="8"  fill="#f5d060"/>
      <ellipse cx="268" cy="168" rx="9"  ry="7.5" fill="#f5c842"/>
      {/* upper */}
      <ellipse cx="115" cy="122" rx="11" ry="9"  fill="#f5c842"/>
      <ellipse cx="172" cy="105" rx="12" ry="10" fill="#f5c842"/>
      <ellipse cx="195" cy="115" rx="10" ry="8"  fill="#f5d060"/>
      <ellipse cx="235" cy="100" rx="11" ry="9"  fill="#f5c842"/>
      <ellipse cx="252" cy="112" rx="10" ry="8"  fill="#f5d060"/>
      <ellipse cx="290" cy="108" rx="11" ry="9"  fill="#f5c842"/>
      {/* top */}
      <ellipse cx="188" cy="68"  rx="11" ry="9"  fill="#f5c842"/>
      <ellipse cx="210" cy="58"  rx="13" ry="10" fill="#f5c842"/>
      <ellipse cx="232" cy="65"  rx="11" ry="9"  fill="#f5d060"/>
      <ellipse cx="168" cy="82"  rx="10" ry="8"  fill="#f5d060"/>
      <ellipse cx="252" cy="80"  rx="10" ry="8"  fill="#f5c842"/>

      {/* lemon highlights */}
      <ellipse cx="208" cy="56"  rx="5"  ry="4"  fill="#fff9c4" opacity="0.5"/>
      <ellipse cx="170" cy="103" rx="4"  ry="3"  fill="#fff9c4" opacity="0.5"/>
      <ellipse cx="49"  cy="296" rx="4"  ry="3"  fill="#fff9c4" opacity="0.5"/>
      <ellipse cx="357" cy="278" rx="4"  ry="3"  fill="#fff9c4" opacity="0.5"/>

      {/* ── Light rays through canopy ─────────────────────── */}
      <defs>
        <radialGradient id="leafShine" cx="30%" cy="30%">
          <stop offset="0%" stopColor="white" stopOpacity="0.6"/>
          <stop offset="100%" stopColor="white" stopOpacity="0"/>
        </radialGradient>
        <radialGradient id="sunRay" cx="50%" cy="0%">
          <stop offset="0%" stopColor="#f5c842" stopOpacity="0.12"/>
          <stop offset="100%" stopColor="#f5c842" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="210" cy="60" rx="180" ry="220" fill="url(#sunRay)"/>
    </svg>
  );
}
