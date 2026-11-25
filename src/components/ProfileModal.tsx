import React, { useEffect, useState } from 'react';
import { Save, X } from 'lucide-react';
import type { AvatarId } from '../types/hud';
import { AVATAR_OPTIONS, AvatarBadge } from './AvatarBadge';

interface ProfileModalProps {
  open: boolean;
  initialName: string;
  initialRole: string;
  initialAvatarId: AvatarId;
  initialLeaderboardOptIn: boolean;
  onSave: (
    name: string,
    roleTitle: string,
    avatarId: AvatarId,
    leaderboardOptIn: boolean
  ) => void;
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  open,
  initialName,
  initialRole,
  initialAvatarId,
  initialLeaderboardOptIn,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(initialName);
  const [roleTitle, setRoleTitle] = useState(initialRole);
  const [avatarId, setAvatarId] = useState<AvatarId>(initialAvatarId);
  const [leaderboardOptIn, setLeaderboardOptIn] = useState(initialLeaderboardOptIn);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setRoleTitle(initialRole);
    setAvatarId(initialAvatarId);
    setLeaderboardOptIn(initialLeaderboardOptIn);
    setError('');
  }, [open, initialName, initialRole, initialAvatarId, initialLeaderboardOptIn]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Display name is required.');
      return;
    }
    onSave(name.trim(), roleTitle.trim() || 'Explorer', avatarId, leaderboardOptIn);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div className="hud-layer-3 w-full max-w-md rounded-md p-6">
        <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
          <h2 id="profile-modal-title" className="font-display text-lg font-bold text-[#E2E2EC]">
            Edit Profile
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded p-1 text-[#9BA9AC] hover:bg-white/5 hover:text-[#E2E2EC]"
            aria-label="Close profile editor"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded border border-[#FFB4AB]/40 bg-[#93000A]/40 px-3 py-2 text-xs text-[#FFDAD6]">
              {error}
            </div>
          )}

          <div>
            <span className="mb-2 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]">
              Avatar
            </span>
            <div className="grid grid-cols-6 gap-2">
              {AVATAR_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-label={`Select ${opt.label} avatar`}
                  aria-pressed={avatarId === opt.id}
                  onClick={() => setAvatarId(opt.id)}
                  title={opt.label}
                  className={`flex min-h-[44px] items-center justify-center rounded border p-1.5 transition-colors ${
                    avatarId === opt.id
                      ? 'hud-nav-active'
                      : 'border-white/10 bg-[#0C0E15] hover:border-white/25'
                  }`}
                >
                  <AvatarBadge avatarId={opt.id} size="sm" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="modal-profile-name"
              className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
            >
              Display Name
            </label>
            <input
              id="modal-profile-name"
              type="text"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-white/15 bg-[#131622] px-3 py-2.5 text-sm text-[#E2E2EC] focus:border-[var(--hud-accent)] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="modal-profile-role"
              className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
            >
              Focus Title
            </label>
            <input
              id="modal-profile-role"
              type="text"
              maxLength={40}
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              className="w-full rounded border border-white/15 bg-[#131622] px-3 py-2.5 text-sm text-[#E2E2EC] focus:border-[var(--hud-accent)] focus:outline-none"
            />
          </div>

          <label className="flex min-h-[36px] cursor-pointer items-center gap-2.5 text-xs text-[#E2E2EC]">
            <input
              type="checkbox"
              checked={leaderboardOptIn}
              onChange={(e) => setLeaderboardOptIn(e.target.checked)}
              className="h-4 w-4 accent-[var(--hud-accent)]"
            />
            Show my progress on the global leaderboard
          </label>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] rounded border border-white/15 bg-[#131622] px-4 py-2 font-display text-sm font-medium text-[#E2E2EC] hover:border-[var(--hud-accent-border)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="hud-btn-primary flex min-h-[40px] items-center gap-2 rounded px-4 py-2 font-display text-sm font-semibold"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
