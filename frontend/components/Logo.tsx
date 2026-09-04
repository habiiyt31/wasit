export function Logo({ size = 40 }: { size?: number }) {
  const scale = size / 90;
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 90 70" xmlns="http://www.w3.org/2000/svg">
      <g transform={`translate(48,38) scale(${scale})`}>
        <rect x="18" y="-72" width="27" height="39" rx="6" fill="#E11D2E" transform="rotate(-11 31.5 -52.5)" />
        <rect x="28" y="-66" width="27" height="39" rx="6" fill="#FFC700" transform="rotate(-3 41.5 -46.5)" />
        <polygon points="-42,-5 -10,-17 38,-17 38,17 -10,17 -42,5" fill="#17181C" />
        <circle cx="-36" cy="-2" r="7" fill="none" stroke="#17181C" strokeWidth="4" />
        <rect x="4" y="-14" width="4" height="9" rx="2" fill="#FAF9F6" />
        <rect x="14" y="-14" width="4" height="9" rx="2" fill="#FAF9F6" />
        <rect x="24" y="-14" width="4" height="9" rx="2" fill="#FAF9F6" />
      </g>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-bold tracking-wide text-wasit-ink ${className}`}>
      WASIT
    </span>
  );
}
