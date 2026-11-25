import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = true,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="hud-layer-3 w-full max-w-md rounded-md p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border ${
                destructive
                  ? 'border-[#FFB4AB]/40 bg-[#93000A]/40 text-[#FFB4AB]'
                  : 'border-[#00F0FF]/40 bg-[#00F0FF]/10 text-[#00F0FF]'
              }`}
            >
              <AlertTriangle className="h-4 w-4" />
            </div>
            <h2
              id="confirm-dialog-title"
              className="font-display text-lg font-semibold text-[#E2E2EC]"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded p-1.5 text-[#9BA9AC] transition-colors hover:bg-white/5 hover:text-[#E2E2EC]"
            aria-label="Close confirmation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-[#B9CACB]">{message}</p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[40px] rounded border border-white/15 bg-[#131622] px-4 py-2 font-display text-sm font-medium text-[#E2E2EC] transition-colors hover:border-[var(--hud-accent-border)] whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[40px] rounded px-4 py-2 font-display text-sm font-semibold transition-all whitespace-nowrap ${
              destructive
                ? 'bg-[#FFB4AB] text-[#690005] hover:bg-[#FFDAD6]'
                : 'hud-btn-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
