import React from 'react';
import { RefreshCw, ShieldAlert, Wrench } from 'lucide-react';
import type { MaintenanceStatus } from '../types/hud';

interface MaintenanceScreenProps {
  maintenance: MaintenanceStatus;
  onRefreshStatus: () => void;
  onOpenOwnerPortal: () => void;
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({
  maintenance,
  onRefreshStatus,
  onOpenOwnerPortal,
}) => {
  return (
    <div className="hud-canvas-grid flex min-h-screen flex-col items-center justify-center px-4 py-10 text-[#E2E2EC]">
      <div className="hud-layer-2 w-full max-w-lg rounded-md border border-[#F59E0B]/40 p-7 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-[#F59E0B]/50 bg-[#F59E0B]/10 text-[#FCD34D]">
          <Wrench className="h-6 w-6" />
        </div>

        <h1 className="font-display text-2xl font-bold text-[#E2E2EC]">
          Scheduled Maintenance
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#B9CACB]">
          {maintenance.message ||
            'STRYDE is currently undergoing scheduled maintenance. Your missions and progress remain safely stored.'}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onRefreshStatus}
            className="hud-btn-primary inline-flex min-h-[40px] items-center gap-2 rounded px-4 py-2 font-display text-sm font-semibold"
          >
            <RefreshCw className="h-4 w-4" />
            Check Status
          </button>

          <button
            type="button"
            onClick={onOpenOwnerPortal}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded border border-white/15 bg-[#0C0E15] px-3.5 py-2 font-mono text-xs text-[#B9CACB] hover:border-[var(--hud-accent-border)] hover:text-[#DBFCFF]"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Owner Portal
          </button>
        </div>
      </div>
    </div>
  );
};
