import React from 'react';
import { Check } from 'lucide-react';

interface CyberCheckboxProps {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
  accent?: 'emerald' | 'cyan';
}

export const CyberCheckbox: React.FC<CyberCheckboxProps> = ({
  checked,
  onChange,
  ariaLabel,
  accent = 'emerald',
}) => {
  const activeStyle =
    accent === 'emerald'
      ? 'bg-[#10B981]/20 border-[#10B981] text-[#6FFBBF] shadow-[0_0_12px_rgba(16,185,129,0.45)]'
      : 'bg-[#00F0FF]/20 border-[#00F0FF] text-[#DBFCFF] shadow-[0_0_12px_rgba(0,240,255,0.45)]';

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onChange}
      className="group -m-2 flex h-10 w-10 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hud-accent)]"
    >
      <span
        className={`flex h-[22px] w-[22px] items-center justify-center border transition-all duration-150 hud-chamfer-sm ${
          checked
            ? activeStyle
            : 'border-[#4B5B5E] bg-[#0C0E15] text-transparent group-hover:border-[var(--hud-accent)] group-hover:bg-[#131622]'
        }`}
      >
        <Check
          className={`h-3.5 w-3.5 stroke-[3] transition-transform duration-150 ${
            checked ? 'scale-100' : 'scale-50 opacity-0'
          }`}
        />
      </span>
    </button>
  );
};
