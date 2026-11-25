import React, { useEffect, useState } from 'react';
import {
  Award,
  Bot,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  ListChecks,
  Trophy,
  X,
} from 'lucide-react';

interface TutorialModalProps {
  open: boolean;
  onComplete: () => void;
}

const STEPS = [
  {
    icon: LayoutDashboard,
    title: 'Your Home Dashboard',
    body: 'See your level, XP progress bar, today’s missions, and your daily focus goal in one calm view. Use the Daily Briefing & Schedule panel whenever you want a realistic plan for today.',
  },
  {
    icon: ListChecks,
    title: 'Missions & Goal Roadmaps',
    body: 'Create daily, weekly, or one-time missions. For larger goals, use the Goal Roadmaps tab to break long-term plans into milestones you can check off one step at a time.',
  },
  {
    icon: Award,
    title: 'XP, Skills & Achievements',
    body: 'Every completed mission, milestone, and focus session earns XP and builds your five core skills. If you ever check off a mission by mistake, tap Undo right away.',
  },
  {
    icon: Trophy,
    title: 'Global Leaderboard',
    body: 'Once 10 unique members register, the global leaderboard unlocks automatically to show rank, level, total XP, and achievement counts. You control your visibility in Settings.',
  },
  {
    icon: Bot,
    title: 'Meet ATLAS, Your Assistant',
    body: 'ATLAS can coach you, plan goals, or accept optional voice input. ATLAS always asks for your approval before adding or changing anything in your list.',
  },
];

export const TutorialModal: React.FC<TutorialModalProps> = ({ open, onComplete }) => {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setStepIndex(0);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onComplete();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onComplete]);

  if (!open) return null;

  const step = STEPS[stepIndex];
  const Icon = step.icon;
  const isLast = stepIndex === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
    >
      <div className="hud-layer-3 w-full max-w-md rounded-md p-6">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs hud-accent-text">
            Quick Tour · {stepIndex + 1} of {STEPS.length}
          </span>
          <button
            type="button"
            onClick={onComplete}
            className="inline-flex min-h-[36px] items-center gap-1 rounded px-2.5 py-1.5 font-mono text-xs text-[#9BA9AC] transition-colors hover:bg-white/5 hover:text-[#E2E2EC]"
          >
            Skip
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-5 flex h-11 w-11 items-center justify-center rounded-md border border-[var(--hud-accent-border)] bg-[var(--hud-accent-soft)] hud-accent-text">
          <Icon className="h-5 w-5" />
        </div>

        <h2 id="tutorial-title" className="mt-4 font-display text-xl font-bold text-[#E2E2EC]">
          {step.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#B9CACB]">{step.body}</p>

        {/* Step progress indicators */}
        <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
          {STEPS.map((s, idx) => (
            <span
              key={s.title}
              className={`h-1.5 rounded-full transition-all duration-150 ${
                idx === stepIndex ? 'w-6 bg-[var(--hud-accent)]' : 'w-2 bg-white/15'
              }`}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
          <button
            type="button"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            className="inline-flex min-h-[40px] items-center gap-1 rounded border border-white/15 bg-[#0C0E15] px-3.5 py-2 font-display text-xs font-medium text-[#E2E2EC] transition-colors hover:border-white/30 disabled:opacity-35 whitespace-nowrap"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>

          {isLast ? (
            <button
              type="button"
              onClick={() => {
                setStepIndex(0);
                onComplete();
              }}
              className="hud-btn-primary inline-flex min-h-[40px] items-center rounded px-4 py-2 font-display text-xs font-semibold whitespace-nowrap"
            >
              Finish Tour
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
              className="hud-btn-primary inline-flex min-h-[40px] items-center gap-1 rounded px-4 py-2 font-display text-xs font-semibold whitespace-nowrap"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
