import React, { useEffect, useState } from 'react';
import { FileText, ShieldCheck, X } from 'lucide-react';

interface LegalModalProps {
  open: boolean;
  initialTab?: 'privacy' | 'terms';
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({
  open,
  initialTab = 'privacy',
  onClose,
}) => {
  const [tab, setTab] = useState<'privacy' | 'terms'>(initialTab);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
    }
  }, [open, initialTab]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
    >
      <div className="hud-layer-3 relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-md">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            {tab === 'privacy' ? (
              <ShieldCheck className="h-5 w-5 hud-accent-text" />
            ) : (
              <FileText className="h-5 w-5 hud-accent-text" />
            )}
            <h2 id="legal-modal-title" className="font-display text-lg font-semibold text-[#E2E2EC]">
              {tab === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded p-1.5 text-[#9BA9AC] transition-colors hover:bg-white/5 hover:text-[#E2E2EC]"
            aria-label="Close legal dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-2.5">
          <button
            type="button"
            onClick={() => setTab('privacy')}
            className={`min-h-[36px] rounded px-3 py-1.5 font-mono text-xs transition-colors ${
              tab === 'privacy'
                ? 'hud-nav-active border'
                : 'text-[#9BA9AC] hover:text-[#E2E2EC]'
            }`}
          >
            Privacy Policy
          </button>
          <button
            type="button"
            onClick={() => setTab('terms')}
            className={`min-h-[36px] rounded px-3 py-1.5 font-mono text-xs transition-colors ${
              tab === 'terms'
                ? 'hud-nav-active border'
                : 'text-[#9BA9AC] hover:text-[#E2E2EC]'
            }`}
          >
            Terms of Service
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-sm leading-relaxed text-[#B9CACB]">
          {tab === 'privacy' ? (
            <>
              <p className="text-xs font-mono text-[#9BA9AC]">
                Effective Date: November 2026 · STRYDE Productivity Platform
              </p>
              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-semibold text-[#E2E2EC]">
                  1. Information We Collect
                </h3>
                <p>
                  When you register, we collect your email address for account authentication and
                  recovery, plus your chosen public display name, avatar selection, missions, skill
                  progress, focus session totals, goal roadmaps, and optional feedback submissions.
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-semibold text-[#E2E2EC]">
                  2. How Your Data Is Stored &amp; Protected
                </h3>
                <p>
                  Passwords and personal recovery keys are cryptographically hashed on our server
                  using scrypt with unique per-user salts and are never stored in plain text. Your
                  private missions, conversations with ATLAS, and progress belong exclusively to your
                  account and are never visible to other users.
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-semibold text-[#E2E2EC]">
                  3. Leaderboard &amp; Public Visibility
                </h3>
                <p>
                  Your email address is never shown publicly. Once 10 or more accounts register,
                  the global leaderboard displays only your chosen display name, avatar, level, total
                  XP, and achievement count. You may opt out of public leaderboard ranking at any time
                  from Settings.
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-semibold text-[#E2E2EC]">
                  4. AI Assistant &amp; Voice Mode
                </h3>
                <p>
                  Prompts sent to ATLAS are processed securely through our server using Google Gemini
                  only using your own account context. Optional voice input runs through your
                  browser&apos;s speech API only when you press the microphone button; no audio
                  recordings are uploaded or stored by STRYDE.
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-semibold text-[#E2E2EC]">
                  5. Export &amp; Account Deletion Rights
                </h3>
                <p>
                  You can export a complete JSON copy of your data or permanently delete your account
                  and all associated records at any time from Settings.
                </p>
              </section>
            </>
          ) : (
            <>
              <p className="text-xs font-mono text-[#9BA9AC]">
                Effective Date: November 2026 · STRYDE Productivity Platform
              </p>
              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-semibold text-[#E2E2EC]">
                  1. Account Responsibility
                </h3>
                <p>
                  You are responsible for safeguarding your account password and your personal
                  recovery key. One account per individual is expected to keep the global leaderboard
                  fair.
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-semibold text-[#E2E2EC]">
                  2. Fair Use &amp; Integrity
                </h3>
                <p>
                  XP, levels, and leaderboard standings are computed and validated on the server.
                  Automated scripting, duplicate-account farming, or attempts to manipulate XP
                  endpoints or unauthorized administrative routes are prohibited.
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-semibold text-[#E2E2EC]">
                  3. Service Availability
                </h3>
                <p>
                  We strive for high reliability, automatic saving, and safe backups. Scheduled
                  maintenance windows may temporarily limit sign-in while preserving your stored
                  progress.
                </p>
              </section>
              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-semibold text-[#E2E2EC]">
                  4. Termination
                </h3>
                <p>
                  You may stop using STRYDE and delete your account at any time in Settings.
                </p>
              </section>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-[#00F0FF] px-4 py-2 font-display text-xs font-semibold text-[#08090C]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
