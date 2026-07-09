'use client';

interface MemeCMOLogoProps {
  height?: number;
  className?: string;
  showWordmark?: boolean;
}

/**
 * MemeCMO brand mark — purple gradient "M" badge.
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
    <div
      aria-label="MemeCMO.ai"
      className={`inline-flex items-center justify-center rounded-[22%] text-ink font-extrabold ${className}`}
      style={{
        width: height,
        height,
        fontSize: Math.round(height * 0.5),
        background: 'linear-gradient(135deg, #c850c0, #4158d0)',
        boxShadow: '0 4px 14px rgba(99, 102, 241, 0.18)',
        lineHeight: 1,
      }}
    >
      M
    </div>
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
