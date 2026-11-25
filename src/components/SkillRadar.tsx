import React from 'react';
import { ALL_SKILLS } from '../lib/rpgEngine';
import { SkillCategory, SkillProgress } from '../types/hud';

interface SkillRadarProps {
  skills: Record<SkillCategory, SkillProgress>;
}

const SHORT_LABELS: Record<SkillCategory, string> = {
  [SkillCategory.Intelligence]: 'INT',
  [SkillCategory.Discipline]: 'DIS',
  [SkillCategory.Leadership]: 'LDR',
  [SkillCategory.Creativity]: 'CRE',
  [SkillCategory.Fitness]: 'FIT',
};

export const SkillRadar: React.FC<SkillRadarProps> = ({ skills }) => {
  const size = 230;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 78;
  const maxSkillLevel = Math.max(
    6,
    ...ALL_SKILLS.map((cat) => skills[cat].level + 1)
  );

  const angleForIndex = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / ALL_SKILLS.length;

  const pointAt = (i: number, ratio: number) => {
    const angle = angleForIndex(i);
    return {
      x: cx + Math.cos(angle) * radius * ratio,
      y: cy + Math.sin(angle) * radius * ratio,
    };
  };

  const rings = [0.25, 0.5, 0.75, 1];

  const dataPoints = ALL_SKILLS.map((cat, idx) => {
    const s = skills[cat];
    const effectiveScore = s.level + s.currentLevelXp / Math.max(1, s.xpToNextLevel);
    const ratio = Math.max(0.18, Math.min(1, effectiveScore / maxSkillLevel));
    return pointAt(idx, ratio);
  });

  const polygonPath = dataPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-[210px] w-[210px] select-none overflow-visible"
        aria-label="5-Axis Skill Radar Chart"
      >
        <defs>
          <linearGradient id="radarFill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.28" />
          </linearGradient>
        </defs>

        {rings.map((r) => {
          const pts = ALL_SKILLS.map((_, i) => {
            const p = pointAt(i, r);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          }).join(' ');
          return (
            <polygon
              key={r}
              points={pts}
              fill="none"
              stroke="rgba(0, 240, 255, 0.14)"
              strokeWidth="1"
            />
          );
        })}

        {ALL_SKILLS.map((cat, i) => {
          const outer = pointAt(i, 1);
          const labelPos = pointAt(i, 1.24);
          return (
            <g key={cat}>
              <line
                x1={cx}
                y1={cy}
                x2={outer.x}
                y2={outer.y}
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth="1"
              />
              <text
                x={labelPos.x}
                y={labelPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-[#B9CACB] font-mono text-[10px] font-semibold tracking-wider"
              >
                {SHORT_LABELS[cat]} · L{skills[cat].level}
              </text>
            </g>
          );
        })}

        <polygon
          points={polygonPath}
          fill="url(#radarFill)"
          stroke="#00F0FF"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />

        {dataPoints.map((p, idx) => (
          <circle
            key={ALL_SKILLS[idx]}
            cx={p.x}
            cy={p.y}
            r="3.5"
            fill="#DBFCFF"
            stroke="#00F0FF"
            strokeWidth="1.5"
          />
        ))}
      </svg>
    </div>
  );
};
