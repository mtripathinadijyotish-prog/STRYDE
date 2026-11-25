import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Pause, Play, RotateCcw, Timer } from 'lucide-react';

interface FocusTimerProps {
  selectedDuration: number;
  onSelectDuration: (minutes: number) => void;
  onCompleteSession: (minutes: number) => void;
  totalMinutes: number;
  sessionsCompleted: number;
}

const PRESET_DURATIONS = [15, 25, 45, 60];

export const FocusTimer: React.FC<FocusTimerProps> = React.memo(
  ({
    selectedDuration,
    onSelectDuration,
    onCompleteSession,
    totalMinutes,
    sessionsCompleted,
  }) => {
    const [secondsLeft, setSecondsLeft] = useState(selectedDuration * 60);
    const [status, setStatus] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle');
    const [customMinutes, setCustomMinutes] = useState<string>(String(selectedDuration));
    const [inputError, setInputError] = useState<string>('');
    const endTimeRef = useRef<number | null>(null);
    const completedHandledRef = useRef(false);

    useEffect(() => {
      if (status === 'idle') {
        setSecondsLeft(selectedDuration * 60);
        setCustomMinutes(String(selectedDuration));
      }
    }, [selectedDuration, status]);

    // Timestamp-accurate countdown interval (resilient to background tab throttling)
    useEffect(() => {
      if (status !== 'running') {
        endTimeRef.current = null;
        return;
      }

      if (endTimeRef.current === null) {
        endTimeRef.current = Date.now() + secondsLeft * 1000;
      }

      const timer = window.setInterval(() => {
        if (endTimeRef.current === null) return;
        const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
        setSecondsLeft(remaining);
        if (remaining <= 0) {
          window.clearInterval(timer);
        }
      }, 250);

      return () => window.clearInterval(timer);
    }, [status]);

    useEffect(() => {
      if (secondsLeft === 0 && status === 'running' && !completedHandledRef.current) {
        completedHandledRef.current = true;
        endTimeRef.current = null;
        setStatus('completed');
        onCompleteSession(selectedDuration);
      }
    }, [secondsLeft, status, selectedDuration, onCompleteSession]);

    const handleStartOrResume = () => {
      setInputError('');
      const initialSeconds = secondsLeft === 0 ? selectedDuration * 60 : secondsLeft;
      if (secondsLeft === 0) {
        setSecondsLeft(initialSeconds);
      }
      completedHandledRef.current = false;
      endTimeRef.current = Date.now() + initialSeconds * 1000;
      setStatus('running');
    };

    const handlePause = () => {
      if (endTimeRef.current !== null) {
        const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
        setSecondsLeft(remaining);
      }
      endTimeRef.current = null;
      setStatus('paused');
    };

    const handleReset = () => {
      completedHandledRef.current = false;
      endTimeRef.current = null;
      setInputError('');
      setStatus('idle');
      setSecondsLeft(selectedDuration * 60);
    };

    const handlePresetClick = (mins: number) => {
      completedHandledRef.current = false;
      endTimeRef.current = null;
      setInputError('');
      setStatus('idle');
      onSelectDuration(mins);
      setSecondsLeft(mins * 60);
      setCustomMinutes(String(mins));
    };

    const handleCustomSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const parsed = Number(customMinutes);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 180) {
        setInputError('Enter a whole number between 1 and 180 minutes.');
        return;
      }
      setInputError('');
      handlePresetClick(parsed);
    };

    const totalSeconds = Math.max(1, selectedDuration * 60);
    const progress = 1 - secondsLeft / totalSeconds;
    const ringRadius = 54;
    const circumference = 2 * Math.PI * ringRadius;
    const strokeDashoffset = circumference * (1 - Math.max(0, Math.min(1, progress)));

    const mins = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const formattedTime = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    return (
      <div className="hud-layer-2 rounded-md border border-[var(--hud-accent-border)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer className="hud-accent-text h-4 w-4" />
            <h3 className="font-display text-base font-semibold text-[#E2E2EC]">Focus Sprint</h3>
          </div>
          <span className="font-mono text-xs text-[#B9CACB]">
            +{selectedDuration * 2} XP · Discipline
          </span>
        </div>

        {/* Preset Durations */}
        <div className="mb-4 grid grid-cols-4 gap-1.5">
          {PRESET_DURATIONS.map((dur) => {
            const active = selectedDuration === dur;
            return (
              <button
                key={dur}
                type="button"
                disabled={status === 'running'}
                aria-pressed={active}
                onClick={() => handlePresetClick(dur)}
                className={`min-h-[38px] rounded border px-2 py-1.5 font-mono text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-50 ${
                  active
                    ? 'hud-nav-active'
                    : 'border-white/10 bg-[#131622] text-[#B9CACB] hover:border-[var(--hud-accent-border)] hover:text-[#E2E2EC]'
                }`}
              >
                {dur}m
              </button>
            );
          })}
        </div>

        {/* Circular SVG Ring */}
        <div className="my-4 flex flex-col items-center justify-center">
          <div className="relative flex h-36 w-36 items-center justify-center">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 128 128" aria-hidden="true">
              <circle
                cx="64"
                cy="64"
                r={ringRadius}
                fill="none"
                stroke="rgba(255,255,255,0.07)"
                strokeWidth="6"
              />
              <circle
                cx="64"
                cy="64"
                r={ringRadius}
                fill="none"
                stroke={status === 'completed' ? '#10B981' : 'var(--hud-accent)'}
                strokeWidth="6"
                strokeLinecap="butt"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-[stroke-dashoffset] duration-200"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-2xl font-bold tracking-tight text-[#E2E2EC]">
                {formattedTime}
              </span>
              <span className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-[#B9CACB]">
                {status === 'idle'
                  ? 'Ready'
                  : status === 'running'
                    ? 'Focusing'
                    : status === 'paused'
                      ? 'Paused'
                      : 'Complete'}
              </span>
            </div>
          </div>
        </div>

        {status === 'completed' && (
          <div
            role="status"
            className="mb-3 flex items-center gap-2 rounded border border-[#10B981]/50 bg-[#10B981]/15 px-3 py-2 text-xs text-[#65F2B5]"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>
              Sprint complete! +{selectedDuration * 2} XP &amp; +{selectedDuration} Discipline XP awarded.
            </span>
          </div>
        )}

        {/* Controls: Start / Pause / Resume / Reset */}
        <div className="flex items-center gap-2">
          {status === 'running' ? (
            <button
              type="button"
              onClick={handlePause}
              className="flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded border border-[#8B5CF6] bg-[#131622] px-4 py-2 font-display text-sm font-semibold text-[#D0BCFF] transition-all hover:bg-[#8B5CF6]/15 hover:shadow-[0_0_16px_rgba(139,92,246,0.35)] whitespace-nowrap"
            >
              <Pause className="h-4 w-4" />
              Pause
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartOrResume}
              className="hud-btn-primary flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded px-4 py-2 font-display text-sm font-semibold whitespace-nowrap"
            >
              <Play className="h-4 w-4" />
              {status === 'paused' ? 'Resume' : status === 'completed' ? 'Start Again' : 'Start'}
            </button>
          )}

          <button
            type="button"
            onClick={handleReset}
            className="flex min-h-[40px] items-center justify-center gap-1.5 rounded border border-white/15 bg-[#131622] px-3 py-2 font-mono text-xs font-medium text-[#B9CACB] transition-colors hover:border-[var(--hud-accent-border)] hover:text-[#E2E2EC] whitespace-nowrap"
            title="Reset Timer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        {/* Custom Minutes Input */}
        <form onSubmit={handleCustomSubmit} className="mt-3 flex items-center gap-2">
          <label
            htmlFor="custom-focus-mins"
            className="font-mono text-[11px] uppercase tracking-wider text-[#9BA9AC] whitespace-nowrap"
          >
            Custom Min
          </label>
          <input
            id="custom-focus-mins"
            type="number"
            min={1}
            max={180}
            disabled={status === 'running'}
            value={customMinutes}
            onChange={(e) => {
              setCustomMinutes(e.target.value);
              if (inputError) setInputError('');
            }}
            className="min-h-[38px] w-16 rounded border border-white/15 bg-[#131622] px-2 py-1 font-mono text-xs text-[#E2E2EC] focus:border-[var(--hud-accent)] focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={status === 'running'}
            className="min-h-[38px] rounded border border-white/10 bg-[#131622] px-3 py-1 font-mono text-[11px] text-[#B9CACB] transition-colors hover:border-[var(--hud-accent-border)] hover:text-[#E2E2EC] disabled:opacity-50 whitespace-nowrap"
          >
            Apply
          </button>
          <span className="ml-auto font-mono text-[11px] text-[#9BA9AC]">
            {sessionsCompleted}s · {totalMinutes}m
          </span>
        </form>
        {inputError && (
          <p className="mt-1.5 text-xs text-[#FFB4AB]" role="alert">
            {inputError}
          </p>
        )}
      </div>
    );
  }
);
