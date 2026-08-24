'use client';

interface MemeCMOLogoProps {
  height?: number;
  className?: string;
  showWordmark?: boolean;
}

/**
 * MemeCMO brand mark — the rose bubble-M (matches favicon + marketing site).
 * Matches the static marketing site (memecmo.ai) so the cross-domain hand-off
 * (memecmo.ai → app.memecmo.ai) feels continuous.
 *
 * Pair with the wordmark "MEMECMO.AI" when more context is needed.
 */
export default function MemeCMOLogo({
  height = 32,
  className = '',
  showWordmark = false,
}: MemeCMOLogoProps) {
  const badge = (
    <svg
      aria-label="MemeCMO.ai"
      className={className}
      width={height}
      height={height}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M14 12 h36 a6 6 0 0 1 6 6 v20 a6 6 0 0 1 -6 6 h-24 l-10 9 v-9 h-2 a6 6 0 0 1 -6 -6 v-20 a6 6 0 0 1 6 -6 z" fill="#C76B7A" />
      <path d="M22 38 V20 l10 11 10-11 v18" fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  if (!showWordmark) return badge;

  return (
    <div className="inline-flex items-center gap-3">
      {badge}
      <span
        className="font-semibold tracking-[0.25em] text-ink/85"
        style={{ fontSize: Math.round(height * 0.42) }}
      >
        MEMECMO.AI
      </span>
    </div>
  );
}
