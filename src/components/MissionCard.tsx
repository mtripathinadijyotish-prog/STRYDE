import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Clock, Edit3, ShieldCheck, Trash2 } from 'lucide-react';
import { DIFFICULTY_SKILL_XP, DIFFICULTY_XP } from '../lib/rpgEngine';
import { Mission, MissionDifficulty, MissionFrequency } from '../types/hud';
import { CyberCheckbox } from './CyberCheckbox';

interface MissionCardProps {
  mission: Mission;
  onToggleComplete: (missionId: string) => void;
  onToggleSubObjective: (missionId: string, subId: string) => void;
  onEdit: (mission: Mission) => void;
  onDelete: (mission: Mission) => void;
}

export const MissionCard: React.FC<MissionCardProps> = React.memo(({
  mission,
  onToggleComplete,
  onToggleSubObjective,
  onEdit,
  onDelete,
}) => {
  const [expanded, setExpanded] = useState(mission.subObjectives.length > 0 && !mission.completed);

  const borderStyle = mission.completed
    ? 'border-[#10B981]/35'
    : mission.difficulty === MissionDifficulty.Boss
      ? 'border-[#F59E0B]/50'
      : mission.frequency !== MissionFrequency.Custom
        ? 'border-[#8B5CF6]/45'
        : 'border-[#00F0FF]/35';

  const difficultyTextClass =
    mission.difficulty === MissionDifficulty.Boss
      ? 'text-[#FCD34D]'
      : mission.difficulty === MissionDifficulty.Hard
        ? 'text-[#D0BCFF]'
        : mission.difficulty === MissionDifficulty.Medium
          ? 'hud-accent-text'
          : 'text-[#B9CACB]';

  const xpReward = DIFFICULTY_XP[mission.difficulty];
  const skillXp = DIFFICULTY_SKILL_XP[mission.difficulty];
  const doneSubs = mission.subObjectives.filter((s) => s.completed).length;

  return (
    <div
      className={`hud-layer-2 rounded-md border p-4 transition-colors duration-150 ${borderStyle} ${
        mission.completed ? 'opacity-80' : 'hover:border-[var(--hud-accent-border)]'
      }`}
    >
      {/* Top Row: Clean Unboxed Typographic Metadata + XP Yield */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-[#B9CACB]">
          <span className={`font-semibold uppercase tracking-wider ${difficultyTextClass}`}>
            {mission.difficulty}
          </span>
          <span className="text-[#9BA9AC]" aria-hidden="true">·</span>
          <span>{mission.category}</span>
          <span className="text-[#9BA9AC]" aria-hidden="true">·</span>
          <span className="uppercase">{mission.frequency}</span>
          {mission.xpAwarded && (
            <>
              <span className="text-[#9BA9AC]" aria-hidden="true">·</span>
              <span
                className="inline-flex items-center gap-1 font-medium text-[#65F2B5]"
                title="XP already awarded for this cycle — duplicate rewards prevented"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                XP Claimed
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="flex items-center gap-1 text-[#9BA9AC]">
            <Clock className="h-3 w-3" />
            {mission.deadline}
          </span>
          <span className="font-semibold hud-accent-text">
            +{xpReward} XP
          </span>
        </div>
      </div>

      {/* Main Mission Row */}
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          <CyberCheckbox
            checked={mission.completed}
            onChange={() => onToggleComplete(mission.id)}
            ariaLabel={`Mark mission ${mission.title} as ${
              mission.completed ? 'incomplete' : 'complete'
            }`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3
              className={`font-display text-base font-semibold leading-snug transition-colors ${
                mission.completed
                  ? 'hud-tracer-strike inline-block text-[#9BA9AC]'
                  : 'text-[#E2E2EC]'
              }`}
            >
              {mission.title}
            </h3>

            <div className="flex shrink-0 items-center gap-1">
              {mission.subObjectives.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="inline-flex min-h-[36px] items-center rounded border border-white/10 bg-[#131622] px-2.5 py-1 font-mono text-[11px] text-[#B9CACB] transition-colors hover:border-[var(--hud-accent-border)] hover:text-[#E2E2EC]"
                  aria-label="Toggle sub-objectives"
                >
                  <span className="mr-1">
                    {doneSubs}/{mission.subObjectives.length}
                  </span>
                  {expanded ? (
                    <ChevronUp className="inline h-3 w-3" />
                  ) : (
                    <ChevronDown className="inline h-3 w-3" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => onEdit(mission)}
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded p-1.5 text-[#9BA9AC] transition-colors hover:bg-white/5 hover:text-[var(--hud-accent)]"
                aria-label={`Edit ${mission.title}`}
                title="Edit mission"
              >
                <Edit3 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(mission)}
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded p-1.5 text-[#9BA9AC] transition-colors hover:bg-[#93000A]/30 hover:text-[#FFB4AB]"
                aria-label={`Delete ${mission.title}`}
                title="Delete mission"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {mission.description && (
            <p className="mt-1 text-sm leading-relaxed text-[#B9CACB]">
              {mission.description}
            </p>
          )}

          <p className="mt-1.5 font-mono text-[11px] text-[#9BA9AC]">
            Skill Gain: +{skillXp} {mission.category} XP
          </p>

          {/* Sub-Objectives */}
          {expanded && mission.subObjectives.length > 0 && (
            <ul className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
              {mission.subObjectives.map((sub) => (
                <li key={sub.id} className="flex items-center gap-2.5">
                  <CyberCheckbox
                    checked={sub.completed}
                    accent="cyan"
                    onChange={() => onToggleSubObjective(mission.id, sub.id)}
                    ariaLabel={`Toggle step ${sub.label}`}
                  />
                  <span
                    className={`text-xs ${
                      sub.completed ? 'line-through text-[#9BA9AC]' : 'text-[#E2E2EC]'
                    }`}
                  >
                    {sub.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
});
