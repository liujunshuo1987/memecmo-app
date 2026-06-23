'use client';

interface CalligraphyLogoProps {
  height?: number;
  className?: string;
}

export default function CalligraphyLogo({ height = 40, className = '' }: CalligraphyLogoProps) {
  const aspectRatio = 640 / 160;
  const width = height * aspectRatio;

  return (
    <img
      src="/logo.svg"
      alt="观澜智库书法标志"
      width={width}
      height={height}
      draggable={false}
      loading="eager"
      className={className}
    />
  );
}
