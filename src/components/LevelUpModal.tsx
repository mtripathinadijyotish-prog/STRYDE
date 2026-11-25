import React from 'react';
import { Award, X } from 'lucide-react';
import { motion } from 'motion/react';

interface LevelUpModalProps {
  level: number | null;
  celebrationsEnabled?: boolean;
  onClose: () => void;
}

export const LevelUpModal: React.FC<LevelUpModalProps> = ({
  level,
  celebrationsEnabled = true,
  onClose,
}) => {
  if (level === null) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="levelup-title"
    >
      <motion.div
        initial={celebrationsEnabled ? { opacity: 0, scale: 0.94, y: 8 } : false}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="hud-layer-3 relative w-full max-w-md rounded-md p-7 text-center"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex min-h-[36px] min-w-[36px] items-center justify-center rounded p-1.5 text-[#9BA9AC] transition-colors hover:bg-white/5 hover:text-[#E2E2EC]"
          aria-label="Close level up banner"
        >
          <X className="h-4 w-4" />
        </button>

        <motion.div
          animate={
            celebrationsEnabled
              ? { scale: [1, 1.07, 1], rotate: [0, 3, -3, 0] }
              : undefined
          }
          transition={{ duration: 0.5 }}
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#F59E0B] bg-[#F59E0B]/15 text-[#FCD34D] shadow-[0_0_24px_rgba(245,158,11,0.45)]"
        >
          <Award className="h-8 w-8" />
        </motion.div>

        <p className="font-mono text-xs font-semibold uppercase tracking-[0.12em] hud-accent-text">
          Milestone Reached
        </p>
        <h2
          id="levelup-title"
          className="mt-1 font-display text-3xl font-bold text-[#E2E2EC]"
        >
          Level {level} Achieved
        </h2>
        <p className="mt-2 text-sm text-[#B9CACB]">
          Consistent progress unlocked your next rank. Keep moving forward at a steady, sustainable pace.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="hud-btn-primary mt-6 min-h-[42px] w-full rounded px-5 py-2.5 font-display text-sm font-semibold"
        >
          Continue
        </button>
      </motion.div>
    </div>
  );
};
