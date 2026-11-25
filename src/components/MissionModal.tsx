import React, { useEffect, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { ALL_SKILLS, DIFFICULTY_XP } from '../lib/rpgEngine';
import {
  Mission,
  MissionDifficulty,
  MissionFrequency,
  SkillCategory,
  SubObjective,
} from '../types/hud';

export interface MissionDraftPayload {
  title: string;
  description: string;
  category: SkillCategory;
  difficulty: MissionDifficulty;
  frequency: MissionFrequency;
  deadline: string;
  subObjectives: SubObjective[];
}

interface MissionModalProps {
  open: boolean;
  editingMission: Mission | null;
  onSave: (payload: MissionDraftPayload) => void;
  onClose: () => void;
}

export const MissionModal: React.FC<MissionModalProps> = ({
  open,
  editingMission,
  onSave,
  onClose,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SkillCategory>(SkillCategory.Intelligence);
  const [difficulty, setDifficulty] = useState<MissionDifficulty>(MissionDifficulty.Medium);
  const [frequency, setFrequency] = useState<MissionFrequency>(MissionFrequency.Custom);
  const [deadline, setDeadline] = useState('Today · 18:00');
  const [subObjectives, setSubObjectives] = useState<SubObjective[]>([]);
  const [newSubLabel, setNewSubLabel] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setNewSubLabel('');
    if (editingMission) {
      setTitle(editingMission.title);
      setDescription(editingMission.description);
      setCategory(editingMission.category);
      setDifficulty(editingMission.difficulty);
      setFrequency(editingMission.frequency);
      setDeadline(editingMission.deadline);
      setSubObjectives(editingMission.subObjectives.map((s) => ({ ...s })));
    } else {
      setTitle('');
      setDescription('');
      setCategory(SkillCategory.Intelligence);
      setDifficulty(MissionDifficulty.Medium);
      setFrequency(MissionFrequency.Daily);
      setDeadline('Today · 18:00');
      setSubObjectives([]);
    }
  }, [open, editingMission]);

  if (!open) return null;

  const handleAddSub = () => {
    const trimmed = newSubLabel.trim();
    if (!trimmed) return;
    setSubObjectives((prev) => [
      ...prev,
      { id: `sub-${Date.now()}-${prev.length}`, label: trimmed, completed: false },
    ]);
    setNewSubLabel('');
  };

  const handleRemoveSub = (id: string) => {
    setSubObjectives((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Mission title is required.');
      return;
    }
    onSave({
      title: title.trim(),
      description: description.trim(),
      category,
      difficulty,
      frequency,
      deadline: deadline.trim() || 'No deadline',
      subObjectives,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mission-modal-title"
    >
      <div className="hud-layer-3 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-md p-6">
        <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
          <div>
            <h2
              id="mission-modal-title"
              className="font-display text-xl font-bold text-[#E2E2EC]"
            >
              {editingMission ? 'Edit Mission' : 'Create Mission'}
            </h2>
            <p className="hud-accent-text mt-0.5 font-mono text-xs">
              Reward: +{DIFFICULTY_XP[difficulty]} XP · {category}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded p-1.5 text-[#9BA9AC] transition-colors hover:bg-white/5 hover:text-[#E2E2EC]"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded border border-[#FFB4AB]/40 bg-[#93000A]/40 px-3 py-2 text-xs text-[#FFDAD6]">
              {error}
            </div>
          )}

          <div>
            <label
              htmlFor="mission-title"
              className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
            >
              Mission Title
            </label>
            <input
              id="mission-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Draft API security review checklist"
              maxLength={120}
              className="w-full rounded border border-white/15 bg-[#131622] px-3 py-2.5 text-sm text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[var(--hud-accent)] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="mission-description"
              className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
            >
              Description
            </label>
            <textarea
              id="mission-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Outline key deliverables or criteria..."
              maxLength={500}
              className="w-full rounded border border-white/15 bg-[#131622] px-3 py-2 text-sm text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[var(--hud-accent)] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="mission-category"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
              >
                Skill Category
              </label>
              <select
                id="mission-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as SkillCategory)}
                className="w-full rounded border border-white/15 bg-[#131622] px-3 py-2.5 text-sm text-[#E2E2EC] focus:border-[var(--hud-accent)] focus:outline-none"
              >
                {ALL_SKILLS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="mission-difficulty"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
              >
                Difficulty Tier
              </label>
              <select
                id="mission-difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as MissionDifficulty)}
                className="w-full rounded border border-white/15 bg-[#131622] px-3 py-2.5 text-sm text-[#E2E2EC] focus:border-[var(--hud-accent)] focus:outline-none"
              >
                <option value={MissionDifficulty.Easy}>Easy (+50 XP)</option>
                <option value={MissionDifficulty.Medium}>Medium (+120 XP)</option>
                <option value={MissionDifficulty.Hard}>Hard (+240 XP)</option>
                <option value={MissionDifficulty.Boss}>Boss (+450 XP)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="mission-frequency"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
              >
                Cadence
              </label>
              <select
                id="mission-frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as MissionFrequency)}
                className="w-full rounded border border-white/15 bg-[#131622] px-3 py-2.5 text-sm text-[#E2E2EC] focus:border-[var(--hud-accent)] focus:outline-none"
              >
                <option value={MissionFrequency.Daily}>Daily (Resets each day)</option>
                <option value={MissionFrequency.Weekly}>Weekly (Resets each week)</option>
                <option value={MissionFrequency.Custom}>Custom (One-time)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="mission-deadline"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
              >
                Deadline
              </label>
              <input
                id="mission-deadline"
                type="text"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                placeholder="e.g., Today · 17:00 or 2026-11-30"
                maxLength={40}
                className="w-full rounded border border-white/15 bg-[#131622] px-3 py-2.5 text-sm text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[var(--hud-accent)] focus:outline-none"
              />
            </div>
          </div>

          {/* Sub-objectives */}
          <div>
            <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]">
              Sub-Objectives (Optional)
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={newSubLabel}
                onChange={(e) => setNewSubLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSub();
                  }
                }}
                placeholder="Add step..."
                className="flex-1 rounded border border-white/15 bg-[#131622] px-3 py-2 text-sm text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[var(--hud-accent)] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddSub}
                className="hud-nav-active flex min-h-[40px] items-center gap-1 rounded border px-3 py-1.5 font-mono text-xs whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Step
              </button>
            </div>
            {subObjectives.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {subObjectives.map((sub) => (
                  <li
                    key={sub.id}
                    className="flex items-center justify-between rounded border border-white/10 bg-[#131622] px-3 py-1.5 text-xs text-[#E2E2EC]"
                  >
                    <span className="truncate">{sub.label}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSub(sub.id)}
                      className="ml-2 flex min-h-[32px] min-w-[32px] items-center justify-center rounded text-[#9BA9AC] hover:text-[#FFB4AB]"
                      aria-label="Remove sub-objective"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] rounded border border-white/15 bg-[#131622] px-4 py-2 font-display text-sm font-medium text-[#E2E2EC] hover:border-[var(--hud-accent-border)] whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="hud-btn-primary min-h-[40px] rounded px-5 py-2 font-display text-sm font-semibold whitespace-nowrap"
            >
              {editingMission ? 'Save Changes' : 'Create Mission'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
