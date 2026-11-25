import React from 'react';

interface StatBarProps {
  value: number;
  max: number;
  variant?: 'cyan' | 'violet' | 'emerald' | 'gold';
  heightClass?: string;
  showBeam?: boolean;
}

const VARIANT_STYLES: Record<
  NonNullable<StatBarProps['variant']>,
  { gradient: string; beam: string }
> = {
  cyan: {
    gradient: 'from-[#006970] via-[#00DBE9] to-[#00F0FF]',
    beam: 'bg-[#DBFCFF] shadow-[0_0_10px_2px_rgba(0,240,255,0.85)]',
  },
  violet: {
    gradient: 'from-[#5516BE] via-[#8B5CF6] to-[#D0BCFF]',
    beam: 'bg-[#E9DDFF] shadow-[0_0_10px_2px_rgba(139,92,246,0.85)]',
  },
  emerald: {
    gradient: 'from-[#005236] via-[#10B981] to-[#65F2B5]',
    beam: 'bg-[#D8FFE7] shadow-[0_0_10px_2px_rgba(16,185,129,0.85)]',
  },
  gold: {
    gradient: 'from-[#92400E] via-[#F59E0B] to-[#FCD34D]',
    beam: 'bg-[#FEF3C7] shadow-[0_0_10px_2px_rgba(245,158,11,0.85)]',
  },
};

export const StatBar: React.FC<StatBarProps> = ({
  value,
  max,
  variant = 'cyan',
  heightClass = 'h-2',
  showBeam = true,
}) => {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));
  const style = VARIANT_STYLES[variant];

  return (
    <div
      className={`relative w-full overflow-hidden rounded-sm border border-white/[0.06] bg-[#131622] ${heightClass}`}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
    >
      <div
        className={`hud-bar-sweep relative h-full bg-gradient-to-r transition-all duration-300 ease-out ${style.gradient}`}
        style={{ width: `${pct}%` }}
      >
        {showBeam && pct > 2 && (
          <span
            className={`absolute right-0 top-0 bottom-0 w-[2px] ${style.beam}`}
          />
        )}
      </div>
    </div>
  );
};
