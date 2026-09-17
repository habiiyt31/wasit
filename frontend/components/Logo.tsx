export function Logo({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="13" fill="#10312A" />
      <rect x="21" y="14" width="15" height="22" rx="3" fill="#D7263D" transform="rotate(-12 28 25)" />
      <rect x="29" y="17" width="15" height="22" rx="3" fill="#F2C230" transform="rotate(-4 36 28)" />
      <path d="M13 44 L27 39 L48 39 L48 52 L27 52 Z" fill="#F7F8F5" />
      <circle cx="16" cy="46" r="4" fill="none" stroke="#F7F8F5" strokeWidth="2.5" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-[0.01em] ${className}`}>
      Wasit
    </span>
  );
}
