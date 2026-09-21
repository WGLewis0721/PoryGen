import "./BitCritter.css";

export type BitCritterState =
  | "idle"
  | "ingesting"
  | "healthy"
  | "review"
  | "blocking"
  | "integrity_warning";

export interface BitCritterProps {
  state?: BitCritterState;
  size?: number;
  className?: string;
  /** Accessible label; the critter is a status indicator, not decoration. */
  label?: string;
}

const STATE_LABEL: Record<BitCritterState, string> = {
  idle: "Bit-Critter: idle",
  ingesting: "Bit-Critter: ingesting repository",
  healthy: "Bit-Critter: healthy, no blocking findings",
  review: "Bit-Critter: review required",
  blocking: "Bit-Critter: blocking findings detected",
  integrity_warning: "Bit-Critter: provenance chain integrity warning",
};

// <!-- OPUS_TASK: Critter gaze kinematics
// Current behavior: the sensor lens (`.pg-critter-lens` / `.pg-critter-lens-glint`)
// is static aside from its autonomic blink. Desired improvement: implement
// pointer-following sensor/gaze movement and subtle head attitude so the
// critter appears to track the cursor.
// Implementation constraints: use requestAnimationFrame and spring
// interpolation (not a raw pointermove -> transform binding); clamp apparent
// head rotation to approximately +/-5 degrees; read pointer position via a
// window-level listener scoped to this component's lifecycle and clean it up
// on unmount.
// Reduced-motion requirement: disable gaze/head motion entirely under
// `prefers-reduced-motion: reduce` (check via matchMedia, not CSS alone,
// since this is a JS-driven transform).
// Completion criteria: keyboard and touch users see no regression (gaze is a
// pointer-only enhancement); the component renders and functions identically
// with this task incomplete, since gaze tracking is additive polish only. -->
export function BitCritter({ state = "idle", size = 200, className, label }: BitCritterProps) {
  return (
    <svg
      className={`pg-bitcritter${className ? ` ${className}` : ""}`}
      data-state={state}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label={label ?? STATE_LABEL[state]}
    >
      <defs>
        <clipPath id="pg-critter-clip">
          <polygon points="100,45 135,60 152,95 145,130 115,155 85,158 55,138 45,100 65,62" />
        </clipPath>
      </defs>

      <ellipse className="pg-critter-shadow" cx="100" cy="182" rx="42" ry="6" fill="rgba(0,0,0,0.35)" />

      <g className="pg-critter-body">
        {/* stabilizer struts */}
        <polygon points="80,150 92,150 87,180 71,178" fill="#1a1d24" />
        <polygon points="108,151 122,148 130,176 113,178" fill="#14161b" />

        {/* faceted low-poly chassis (fan triangulation from center) */}
        <g className="pg-critter-facet" fill="#1c2029">
          <polygon points="100,105 100,45 135,60" fill="#242a34" />
          <polygon points="100,105 135,60 152,95" fill="#1b1f27" />
          <polygon points="100,105 152,95 145,130" fill="#161a20" />
          <polygon points="100,105 145,130 115,155" fill="#12151a" />
          <polygon points="100,105 115,155 85,158" fill="#171b21" />
          <polygon points="100,105 85,158 55,138" fill="#1d222a" />
          <polygon points="100,105 55,138 45,100" fill="#262c36" />
          <polygon points="100,105 45,100 65,62" fill="#2c3340" />
          <polygon points="100,105 65,62 100,45" fill="#222732" />
        </g>

        {/* antenna */}
        <line x1="100" y1="45" x2="100" y2="24" stroke="#3a4150" strokeWidth="2" />
        <polygon points="100,17 107,24 100,31 93,24" fill="var(--pg-structure-dim)" />

        {/* sensor housing + lens */}
        <polygon points="82,63 118,63 122,76 78,76" fill="#0d0f12" stroke="#3a4150" strokeWidth="1" />
        <rect className="pg-critter-lens" x="86" y="66" width="28" height="7" />
        <rect className="pg-critter-lens-glint" x="90" y="67.5" width="8" height="4" />

        {/* fracture overlay (integrity_warning only) */}
        <polyline
          className="pg-critter-fracture"
          points="58,92 84,102 72,122 104,126 92,148"
          fill="none"
          strokeWidth="2"
        />
      </g>

      {/* vital indicator: the one chartreuse "heartbeat" element */}
      <circle className="pg-critter-vital" cx="100" cy="106" r="6" />

      {/* ingestion scanline, clipped to the chassis silhouette */}
      <g clipPath="url(#pg-critter-clip)">
        <rect className="pg-critter-scanline" x="40" y="45" width="120" height="16" fill="var(--pg-accent)" opacity="0.28" />
      </g>
    </svg>
  );
}
