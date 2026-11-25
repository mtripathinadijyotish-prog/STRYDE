import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  ListPlus,
  Loader2,
  Map,
  Mic,
  MicOff,
  PlusCircle,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { ApiError, api } from '../lib/apiClient';
import {
  ALL_SKILLS,
  DIFFICULTY_XP,
  isDuplicateMissionTitle,
} from '../lib/rpgEngine';
import {
  LifeRpgState,
  MissionDifficulty,
  MissionFrequency,
  SkillCategory,
  SuggestedMissionDraft,
} from '../types/hud';

interface JarvisScreenProps {
  state: LifeRpgState;
  isOnline: boolean;
  initialMode?: 'chat' | 'planner';
  onSyncStateFromAtlas: (nextState: LifeRpgState) => void;
  onConfirmAddMission: (messageId: string, draft: SuggestedMissionDraft) => void;
  onApprovePlannedMissions: (drafts: SuggestedMissionDraft[]) => void;
  onSavePlannedRoadmap: (
    goalTitle: string,
    summary: string,
    drafts: SuggestedMissionDraft[]
  ) => void;
  onRequestClearHistory: () => void;
  onToggleVoiceReplies: (enabled: boolean) => void;
}

interface EditablePlanItem extends SuggestedMissionDraft {
  selected: boolean;
  isDuplicate: boolean;
}

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}

const QUICK_PROMPTS = [
  'Summarize my progress so far.',
  'Suggest 3 small missions to help me get started.',
  'Break down a big goal into steps.',
  'What should I focus on next?',
];

function getSpeechRecognitionConstructor(): (new () => BrowserSpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as Record<string, unknown>;
  const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
  return typeof Ctor === 'function' ? (Ctor as new () => BrowserSpeechRecognition) : null;
}

export const JarvisScreen: React.FC<JarvisScreenProps> = ({
  state,
  isOnline,
  initialMode = 'chat',
  onSyncStateFromAtlas,
  onConfirmAddMission,
  onApprovePlannedMissions,
  onSavePlannedRoadmap,
  onRequestClearHistory,
  onToggleVoiceReplies,
}) => {
  const [mode, setMode] = useState<'chat' | 'planner'>(initialMode);

  // Chat state
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  // Voice Mode state (strictly optional, explicit click only, clean unmount release)
  const [isListening, setIsListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  // Smart Planner state
  const [goalInput, setGoalInput] = useState('');
  const [timeframeInput, setTimeframeInput] = useState('This week');
  const [dailyMinsInput, setDailyMinsInput] = useState(60);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planSummary, setPlanSummary] = useState<string | null>(null);
  const [planItems, setPlanItems] = useState<EditablePlanItem[]>([]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.jarvisHistory.length, isLoading]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
        recognitionRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speechSupported = useMemo(() => Boolean(getSpeechRecognitionConstructor()), []);
  const ttsSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

  const speakReply = (text: string) => {
    if (!ttsSupported || !state.preferences.voiceRepliesEnabled) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.slice(0, 500));
      utterance.rate = 1;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } catch {
      setIsSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    if (ttsSupported) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  const toggleVoiceInput = () => {
    setVoiceNotice(null);
    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
      setIsListening(false);
      return;
    }

    const Ctor = getSpeechRecognitionConstructor();
    if (!Ctor) {
      setVoiceNotice('Voice input is not supported in this browser. Type your message instead.');
      return;
    }

    try {
      const recognition = new Ctor();
      recognition.lang = 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        const transcript = event.results?.[0]?.[0]?.transcript?.trim();
        if (transcript) {
          setInput((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
        }
      };

      recognition.onerror = (event) => {
        const errCode = event?.error || 'error';
        if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
          setVoiceNotice('Microphone permission was denied. Enable mic access in browser settings or type below.');
        } else if (errCode !== 'aborted') {
          setVoiceNotice('Could not capture voice cleanly. Please try again or type your message.');
        }
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      setIsListening(true);
      recognition.start();
    } catch {
      setIsListening(false);
      recognitionRef.current = null;
      setVoiceNotice('Unable to start microphone input in this browser.');
    }
  };

  const sendMessage = async (textOverride?: string) => {
    const trimmed = (textOverride ?? input).trim();
    if (!trimmed || isLoading || inFlightRef.current) return;
    if (!isOnline) {
      setErrorMsg('You are offline. Reconnect to chat with ATLAS.');
      setLastFailedPrompt(trimmed);
      return;
    }

    inFlightRef.current = true;
    setErrorMsg(null);
    setLastFailedPrompt(null);
    if (!textOverride) setInput('');
    setIsLoading(true);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), 25_000);

    try {
      const data = await api.atlasChat(trimmed, controller.signal);
      if (data?.state && data.state.profile) {
        onSyncStateFromAtlas(data.state);
      }
      if (data.reply) {
        speakReply(data.reply);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setErrorMsg('ATLAS took too long to respond. Please try again.');
      } else if (err instanceof ApiError) {
        setErrorMsg(
          err.status === 401
            ? 'Your session token could not be verified. Your message is saved below—please try again or refresh if needed.'
            : err.message
        );
      } else {
        setErrorMsg('Could not reach ATLAS right now. Please check your connection.');
      }
      setLastFailedPrompt(trimmed);
      if (!textOverride) setInput(trimmed);
    } finally {
      window.clearTimeout(timeoutId);
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

  const handleGeneratePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalInput.trim()) {
      setPlanError('Describe the goal you want ATLAS to break down.');
      return;
    }
    if (!isOnline) {
      setPlanError('Smart Planner requires an internet connection.');
      return;
    }

    setPlanLoading(true);
    setPlanError(null);
    setPlanSummary(null);
    setPlanItems([]);

    try {
      const data = await api.atlasPlan({
        goal: goalInput.trim(),
        timeframe: timeframeInput,
        dailyMinutes: dailyMinsInput,
      });

      const rawMissions = Array.isArray(data.missions) ? data.missions : [];
      const seen = new Set<string>();
      const mapped: EditablePlanItem[] = [];

      rawMissions.forEach((m, idx) => {
        if (!m || typeof m.title !== 'string') return;
        const norm = m.title.trim().toLowerCase();
        if (seen.has(norm)) return;
        seen.add(norm);
        const dup = isDuplicateMissionTitle(m.title, state.missions);
        mapped.push({
          ...m,
          id: `plan-${Date.now()}-${idx}`,
          subObjectives: Array.isArray(m.subObjectives) ? m.subObjectives : [],
          selected: !dup,
          isDuplicate: dup,
        });
      });

      setPlanSummary(typeof data.summary === 'string' ? data.summary : null);
      setPlanItems(mapped);
    } catch (err) {
      setPlanError(
        err instanceof ApiError ? err.message : 'Unable to generate a mission plan right now.'
      );
    } finally {
      setPlanLoading(false);
    }
  };

  const handleApprovePlanAsMissions = () => {
    const chosen = planItems.filter((item) => item.selected && !item.isDuplicate);
    if (chosen.length === 0) return;
    onApprovePlannedMissions(chosen);
    setPlanItems([]);
    setPlanSummary(null);
    setGoalInput('');
  };

  const handleSavePlanAsRoadmap = () => {
    const chosen = planItems.filter((item) => item.selected);
    if (chosen.length === 0 || !goalInput.trim()) return;
    onSavePlannedRoadmap(goalInput.trim(), planSummary || '', chosen);
    setPlanItems([]);
    setPlanSummary(null);
    setGoalInput('');
  };

  const weakestSkill = useMemo(
    () => [...ALL_SKILLS].sort((a, b) => state.skills[a].xp - state.skills[b].xp)[0],
    [state.skills]
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <section className="hud-layer-1 flex h-[560px] flex-col rounded-md lg:col-span-8 lg:h-[calc(100vh-11rem)] lg:min-h-[540px]">
        {/* Clean Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded border border-[var(--hud-accent-border)] bg-[var(--hud-accent-soft)] hud-accent-text">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-[#E2E2EC]">ATLAS</h1>
              <p className="font-mono text-[11px] text-[#B9CACB]">
                Adaptive Thinking &amp; Life Assistance System
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded border border-white/10 bg-[#0C0E15] p-1">
              <button
                type="button"
                onClick={() => setMode('chat')}
                className={`min-h-[34px] rounded-sm px-2.5 py-1 font-mono text-xs transition-colors whitespace-nowrap ${
                  mode === 'chat'
                    ? 'hud-nav-active border border-[var(--hud-accent-border)]'
                    : 'text-[#9BA9AC] hover:text-[#E2E2EC]'
                }`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setMode('planner')}
                className={`flex min-h-[34px] items-center gap-1 rounded-sm px-2.5 py-1 font-mono text-xs transition-colors whitespace-nowrap ${
                  mode === 'planner'
                    ? 'hud-nav-active border border-[var(--hud-accent-border)]'
                    : 'text-[#9BA9AC] hover:text-[#E2E2EC]'
                }`}
              >
                <ListPlus className="h-3.5 w-3.5" />
                Smart Planner
              </button>
            </div>

            {mode === 'chat' && ttsSupported && (
              <button
                type="button"
                onClick={() => {
                  if (isSpeaking) stopSpeaking();
                  onToggleVoiceReplies(!state.preferences.voiceRepliesEnabled);
                }}
                title={
                  state.preferences.voiceRepliesEnabled
                    ? 'Voice replies enabled'
                    : 'Voice replies muted'
                }
                className={`inline-flex min-h-[36px] items-center gap-1 rounded border px-2.5 py-1.5 font-mono text-xs whitespace-nowrap ${
                  state.preferences.voiceRepliesEnabled
                    ? 'hud-nav-active'
                    : 'border-white/15 bg-[#0C0E15] text-[#9BA9AC] hover:text-[#E2E2EC]'
                }`}
              >
                {state.preferences.voiceRepliesEnabled ? (
                  <Volume2 className="h-3.5 w-3.5" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">
                  {isSpeaking ? 'Speaking' : state.preferences.voiceRepliesEnabled ? 'Voice On' : 'Voice Off'}
                </span>
              </button>
            )}

            {mode === 'chat' && (
              <button
                type="button"
                onClick={onRequestClearHistory}
                disabled={state.jarvisHistory.length <= 1}
                className="flex min-h-[36px] items-center gap-1.5 rounded border border-white/15 bg-[#0C0E15] px-2.5 py-1.5 font-mono text-xs text-[#B9CACB] hover:border-[#FFB4AB]/50 hover:text-[#FFB4AB] disabled:opacity-40 whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>

        {mode === 'planner' ? (
          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <div>
              <h2 className="font-display text-base font-semibold text-[#E2E2EC]">
                Smart Mission Planner
              </h2>
              <p className="mt-1 text-xs text-[#B9CACB]">
                Turn a big goal into smaller steps. Review and edit before saving as missions or a goal roadmap.
              </p>
            </div>

            <form
              onSubmit={handleGeneratePlan}
              className="space-y-3 rounded border border-white/10 bg-[#0C0E15] p-4"
            >
              {planError && (
                <div className="rounded border border-[#FFB4AB]/40 bg-[#93000A]/40 px-3 py-2 text-xs text-[#FFDAD6]">
                  {planError}
                </div>
              )}

              <div>
                <label
                  htmlFor="planner-goal"
                  className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                >
                  Goal
                </label>
                <input
                  id="planner-goal"
                  type="text"
                  maxLength={400}
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  placeholder="e.g., Run my first 5K or build a portfolio website"
                  className="w-full rounded border border-white/15 bg-[#131622] px-3 py-2 text-sm text-[#E2E2EC] placeholder:text-[#849495] focus:border-[#00F0FF] focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="planner-timeframe"
                    className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                  >
                    Timeframe
                  </label>
                  <select
                    id="planner-timeframe"
                    value={timeframeInput}
                    onChange={(e) => setTimeframeInput(e.target.value)}
                    className="w-full rounded border border-white/15 bg-[#131622] px-3 py-2 text-sm text-[#E2E2EC]"
                  >
                    <option value="Today">Today</option>
                    <option value="This week">This week</option>
                    <option value="Next 2 weeks">Next 2 weeks</option>
                    <option value="This month">This month</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="planner-minutes"
                    className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-[#B9CACB]"
                  >
                    Time Budget
                  </label>
                  <select
                    id="planner-minutes"
                    value={dailyMinsInput}
                    onChange={(e) => setDailyMinsInput(Number(e.target.value))}
                    className="w-full rounded border border-white/15 bg-[#131622] px-3 py-2 text-sm text-[#E2E2EC]"
                  >
                    <option value={30}>30 minutes / day</option>
                    <option value={60}>60 minutes / day</option>
                    <option value={90}>90 minutes / day</option>
                    <option value={120}>120 minutes / day</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={planLoading || !isOnline}
                className="inline-flex items-center gap-2 rounded bg-[#00F0FF] px-4 py-2 font-display text-sm font-semibold text-[#08090C] disabled:opacity-45"
              >
                {planLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Create Plan
              </button>
            </form>

            {planSummary && (
              <p className="rounded border border-[#00F0FF]/30 bg-[#00F0FF]/10 p-3 text-xs text-[#DBFCFF]">
                {planSummary}
              </p>
            )}

            {planItems.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs text-[#B9CACB]">
                    Review before saving ({planItems.filter((i) => i.selected && !i.isDuplicate).length} selected)
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSavePlanAsRoadmap}
                      disabled={planItems.filter((i) => i.selected).length === 0}
                      className="inline-flex items-center gap-1.5 rounded border border-[#00F0FF]/50 bg-[#0C0E15] px-3 py-1.5 font-display text-xs font-semibold text-[#DBFCFF] disabled:opacity-45"
                    >
                      <Map className="h-3.5 w-3.5" />
                      Save as Goal Roadmap
                    </button>
                    <button
                      type="button"
                      onClick={handleApprovePlanAsMissions}
                      disabled={planItems.filter((i) => i.selected && !i.isDuplicate).length === 0}
                      className="inline-flex items-center gap-1.5 rounded bg-[#10B981] px-3.5 py-1.5 font-display text-xs font-semibold text-[#002113] disabled:opacity-45"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Approve &amp; Add Missions
                    </button>
                  </div>
                </div>

                {planItems.map((item) => (
                  <div
                    key={item.id}
                    className={`hud-layer-2 rounded-md border p-4 ${
                      item.isDuplicate
                        ? 'border-[#F59E0B]/40 opacity-60'
                        : item.selected
                          ? 'border-[#00F0FF]/45'
                          : 'border-white/10 opacity-75'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        disabled={item.isDuplicate}
                        onChange={(e) =>
                          setPlanItems((prev) =>
                            prev.map((p) =>
                              p.id === item.id ? { ...p, selected: e.target.checked } : p
                            )
                          )
                        }
                        className="mt-1 h-4 w-4 accent-[#00F0FF]"
                      />
                      <div className="flex-1 space-y-2">
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) =>
                            setPlanItems((prev) =>
                              prev.map((p) =>
                                p.id === item.id
                                  ? {
                                      ...p,
                                      title: e.target.value,
                                      isDuplicate: isDuplicateMissionTitle(
                                        e.target.value,
                                        state.missions
                                      ),
                                    }
                                  : p
                              )
                            )
                          }
                          className="w-full rounded border border-white/12 bg-[#0C0E15] px-2.5 py-1.5 font-display text-sm font-semibold text-[#E2E2EC]"
                        />
                        {item.isDuplicate && (
                          <p className="font-mono text-[11px] text-[#FCD34D]">
                            Already in your mission list.
                          </p>
                        )}
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <select
                            value={item.category}
                            onChange={(e) =>
                              setPlanItems((prev) =>
                                prev.map((p) =>
                                  p.id === item.id
                                    ? { ...p, category: e.target.value as SkillCategory }
                                    : p
                                )
                              )
                            }
                            className="rounded border border-white/12 bg-[#0C0E15] px-2 py-1 font-mono text-xs text-[#E2E2EC]"
                          >
                            {ALL_SKILLS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <select
                            value={item.difficulty}
                            onChange={(e) =>
                              setPlanItems((prev) =>
                                prev.map((p) =>
                                  p.id === item.id
                                    ? { ...p, difficulty: e.target.value as MissionDifficulty }
                                    : p
                                )
                              )
                            }
                            className="rounded border border-white/12 bg-[#0C0E15] px-2 py-1 font-mono text-xs text-[#E2E2EC]"
                          >
                            {Object.values(MissionDifficulty).map((d) => (
                              <option key={d} value={d}>
                                {d} (+{DIFFICULTY_XP[d]} XP)
                              </option>
                            ))}
                          </select>
                          <select
                            value={item.frequency}
                            onChange={(e) =>
                              setPlanItems((prev) =>
                                prev.map((p) =>
                                  p.id === item.id
                                    ? { ...p, frequency: e.target.value as MissionFrequency }
                                    : p
                                )
                              )
                            }
                            className="rounded border border-white/12 bg-[#0C0E15] px-2 py-1 font-mono text-xs text-[#E2E2EC]"
                          >
                            <option value={MissionFrequency.Daily}>Daily</option>
                            <option value={MissionFrequency.Weekly}>Weekly</option>
                            <option value={MissionFrequency.Custom}>One-Time</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {state.jarvisHistory.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {msg.role === 'assistant' && (
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#00F0FF]/40 bg-[#00F0FF]/10 text-[#00F0FF]">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}

                  <div
                    className={`max-w-[85%] space-y-3 rounded-md border p-4 ${
                      msg.role === 'user'
                        ? 'border-[#8B5CF6]/45 bg-[#571BC1]/20 text-[#E2E2EC]'
                        : 'hud-layer-2 border-[#00F0FF]/25 text-[#E2E2EC]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 font-mono text-[10px] uppercase tracking-wider text-[#849495]">
                      <span>{msg.role === 'user' ? state.profile.name : 'ATLAS'}</span>
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#E2E2EC]">
                      {msg.content}
                    </div>

                    {msg.suggestedMissions && msg.suggestedMissions.length > 0 && (
                      <div className="mt-3 space-y-2.5 border-t border-white/10 pt-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[11px] uppercase tracking-wider hud-accent-text">
                  Suggested Missions (Your Approval Required)
                </p>
              </div>
              {msg.suggestedMissions.map((draft) => {
                const alreadyInList =
                  Boolean(draft.added) || isDuplicateMissionTitle(draft.title, state.missions);
                return (
                  <div
                    key={draft.id}
                    className="rounded border border-white/12 bg-[#0C0E15] p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-display text-sm font-semibold text-[#E2E2EC]">
                          {draft.title}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-[#B9CACB]">
                          {draft.category} · {draft.difficulty} (+
                          {DIFFICULTY_XP[draft.difficulty] ?? 120} XP)
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={alreadyInList}
                        onClick={() => onConfirmAddMission(msg.id, draft)}
                        className={`flex min-h-[36px] items-center gap-1.5 rounded px-3 py-1.5 font-display text-xs font-semibold whitespace-nowrap ${
                          alreadyInList
                            ? 'border border-[#10B981]/40 bg-[#10B981]/15 text-[#65F2B5]'
                            : 'hud-btn-primary'
                        }`}
                      >
                        {alreadyInList ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Added
                          </>
                        ) : (
                          <>
                            <PlusCircle className="h-3.5 w-3.5" />
                            Approve &amp; Add
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {msg.role === 'user' && (
          <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[#8B5CF6]/45 bg-[#8B5CF6]/15 text-[#D0BCFF]">
            <User className="h-4 w-4" />
          </div>
        )}
      </div>
    ))}

    {isLoading && (
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded border border-[var(--hud-accent-border)] bg-[var(--hud-accent-soft)] hud-accent-text">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
        <div className="hud-layer-2 rounded-md border border-[var(--hud-accent-border)] px-4 py-3 font-mono text-xs text-[#B9CACB]">
          ATLAS is thinking...
        </div>
      </div>
    )}

    {errorMsg && (
      <div
        role="alert"
        className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-[#FFB4AB]/45 bg-[#93000A]/35 p-4 text-sm text-[#FFDAD6]"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#FFB4AB]" />
          <div>
            <p className="font-semibold">ATLAS Unavailable</p>
            <p className="mt-0.5 text-xs leading-relaxed">{errorMsg}</p>
          </div>
        </div>
        {lastFailedPrompt && (
          <button
            type="button"
            onClick={() => void sendMessage(lastFailedPrompt)}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded border border-white/20 bg-[#0C0E15] px-3 py-1 font-mono text-xs text-[#E2E2EC] hover:border-[var(--hud-accent-border)] whitespace-nowrap"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        )}
      </div>
    )}

    <div ref={messagesEndRef} />
  </div>

  {/* Composer */}
  <div className="border-t border-white/[0.07] bg-[#0C0E15]/80 p-4">
    {voiceNotice && (
      <p className="mb-2 rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-3 py-1.5 text-xs text-[#FCD34D]">
        {voiceNotice}
      </p>
    )}

    <div className="mb-3 flex flex-wrap gap-2">
      {QUICK_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          disabled={isLoading}
          onClick={() => void sendMessage(prompt)}
          className="min-h-[34px] rounded border border-white/10 bg-[#131622] px-2.5 py-1 text-left font-mono text-[11px] text-[#B9CACB] hover:border-[var(--hud-accent-border)] hover:text-[#E2E2EC] disabled:opacity-50"
        >
          {prompt}
        </button>
      ))}
    </div>

    <div className="flex items-end gap-2">
      {speechSupported && (
        <button
          type="button"
          onClick={toggleVoiceInput}
          disabled={isLoading}
          title={isListening ? 'Stop listening' : 'Speak to ATLAS (optional)'}
          aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
          className={`flex h-[46px] shrink-0 items-center justify-center rounded border px-3 transition-colors ${
            isListening
              ? 'border-[#10B981] bg-[#10B981]/20 text-[#65F2B5]'
              : 'border-white/15 bg-[#131622] text-[#B9CACB] hover:border-[var(--hud-accent-border)] hover:text-[#E2E2EC]'
          }`}
        >
          {isListening ? <Mic className="h-4 w-4 animate-pulse" /> : <MicOff className="h-4 w-4" />}
        </button>
      )}

      <textarea
        rows={2}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void sendMessage();
          }
        }}
        disabled={isLoading}
        placeholder={
          isListening
            ? 'Listening... speak clearly'
            : 'Ask ATLAS for mission ideas or focus advice...'
        }
        aria-label="Message ATLAS"
        className="flex-1 resize-none rounded border border-white/15 bg-[#131622] px-3 py-2 text-sm text-[#E2E2EC] placeholder:text-[#9BA9AC] focus:border-[var(--hud-accent)] focus:outline-none disabled:opacity-60"
      />

      <button
        type="button"
        onClick={() => void sendMessage()}
        disabled={isLoading || !input.trim()}
        className="hud-btn-primary flex h-[46px] shrink-0 items-center gap-2 rounded px-4 font-display text-sm font-semibold disabled:opacity-40 whitespace-nowrap"
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Send
      </button>
    </div>
  </div>
</>
)}
</section>

{/* Clean Right Sidebar */}
<aside className="space-y-4 lg:col-span-4">
  <div className="hud-layer-2 rounded-md border border-white/12 p-5">
    <h2 className="font-display text-base font-semibold text-[#E2E2EC]">
      Your Context
    </h2>
    <p className="mt-1 text-xs leading-relaxed text-[#B9CACB]">
      ATLAS uses your private progress below to give relevant, realistic advice.
    </p>

    <dl className="mt-4 space-y-2.5 border-t border-white/[0.06] pt-4 font-mono text-xs">
      <div className="flex justify-between">
        <dt className="text-[#9BA9AC]">Member</dt>
        <dd className="text-[#E2E2EC]">
          {state.profile.name} · Lv.{state.profile.level}
        </dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-[#9BA9AC]">Open Missions</dt>
        <dd className="text-[#E2E2EC]">
          {state.missions.filter((m) => !m.completed).length}
        </dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-[#9BA9AC]">Streak</dt>
        <dd className="text-[#FCD34D]">{state.streak.current} days</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-[#9BA9AC]">Focus Area</dt>
        <dd className="text-[#D0BCFF]">
          {weakestSkill} (Lv.{state.skills[weakestSkill].level})
        </dd>
      </div>
    </dl>
  </div>
</aside>
</div>
);
};
