import React from 'react';
import type { AvatarId } from '../types/hud';

export const AVATAR_OPTIONS: Array<{ id: AvatarId; label: string; color: string }> = [
  { id: 'cyan-hex', label: 'Cyan Core', color: '#00F0FF' },
  { id: 'violet-prism', label: 'Neural Prism', color: '#8B5CF6' },
  { id: 'emerald-shield', label: 'Emerald Shield', color: '#10B981' },
  { id: 'gold-crown', label: 'Solar Crest', color: '#F59E0B' },
  { id: 'cyber-visor', label: 'Horizon Visor', color: '#38BDF8' },
  { id: 'orbital-node', label: 'Orbital Node', color: '#A78BFA' },
];

interface AvatarBadgeProps {
  avatarId?: AvatarId;
  size?: 'sm' | 'md' | 'lg';
}

export const AvatarBadge: React.FC<AvatarBadgeProps> = ({
  avatarId = 'cyan-hex',
  size = 'md',
}) => {
  const dims =
    size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-14 w-14' : 'h-10 w-10';
  const opt = AVATAR_OPTIONS.find((a) => a.id === avatarId) ?? AVATAR_OPTIONS[0];

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-md border border-white/15 bg-[#0C0E15] ${dims}`}
      style={{ boxShadow: `inset 0 0 12px ${opt.color}22` }}
      aria-hidden="true"
    >
      <svg className="h-3/4 w-3/4" viewBox="0 0 32 32">
        {avatarId === 'violet-prism' ? (
          <>
            <polygon
              points="16,3 29,26 3,26"
              fill={`${opt.color}22`}
              stroke={opt.color}
              strokeWidth="2"
            />
            <circle cx="16" cy="19" r="3" fill={opt.color} />
          </>
        ) : avatarId === 'emerald-shield' ? (
          <>
            <path
              d="M16 3 L27 7 V16 C27 22 22 27 16 29 C10 27 5 22 5 16 V7 Z"
              fill={`${opt.color}20`}
              stroke={opt.color}
              strokeWidth="2"
            />
            <path d="M12 16 L15 19 L21 13" fill="none" stroke={opt.color} strokeWidth="2" />
          </>
        ) : avatarId === 'gold-crown' ? (
          <>
            <polygon
              points="4,24 6,10 12,16 16,7 20,16 26,10 28,24"
              fill={`${opt.color}25`}
              stroke={opt.color}
              strokeWidth="2"
            />
          </>
        ) : avatarId === 'cyber-visor' ? (
          <>
            <rect
              x="4"
              y="9"
              width="24"
              height="14"
              rx="3"
              fill={`${opt.color}18`}
              stroke={opt.color}
              strokeWidth="2"
            />
            <line x1="8" y1="16" x2="24" y2="16" stroke={opt.color} strokeWidth="2.5" />
          </>
        ) : avatarId === 'orbital-node' ? (
          <>
            <circle cx="16" cy="16" r="10" fill="none" stroke={opt.color} strokeWidth="1.5" />
            <circle cx="16" cy="16" r="4" fill={opt.color} />
            <circle cx="24" cy="9" r="2" fill="#E2E2EC" />
          </>
        ) : (
          <>
            <polygon
              points="16,3 28,9.5 28,22.5 16,29 4,22.5 4,9.5"
              fill={`${opt.color}22`}
              stroke={opt.color}
              strokeWidth="2"
            />
            <polygon points="16,10 22,13.5 22,18.5 16,22 10,18.5 10,13.5" fill={opt.color} />
          </>
        )}
      </svg>
    </div>
  );
};
