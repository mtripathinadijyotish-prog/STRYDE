import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import {
  Award,
  Bot,
  CheckCircle2,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  Settings,
  ShieldAlert,
  Trophy,
  Undo2,
  WifiOff,
  X,
} from 'lucide-react';
import { AuthWelcomeScreen } from './components/AuthWelcomeScreen';
import { AvatarBadge } from './components/AvatarBadge';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ErrorBoundary, SectionErrorBoundary } from './components/ErrorBoundary';
import {
  HomeDashboardScreen,
  StarterMissionPreset,
} from './components/HomeDashboardScreen';
import { LegalModal } from './components/LegalModal';
import { LevelUpModal } from './components/LevelUpModal';
import { MaintenanceScreen } from './components/MaintenanceScreen';
import { MissionDraftPayload, MissionModal } from './components/MissionModal';
import { OnboardingWizard } from './components/OnboardingWizard';
import { OwnerPortalModal } from './components/OwnerPortalModal';
import { ProfileModal } from './components/ProfileModal';
import { TutorialModal } from './components/TutorialModal';
import { ApiError, api, setUserToken } from './lib/apiClient';
import { getLocalDateKey } from './lib/rpgEngine';
import {
  AvatarId,
  GoalMilestone,
  GoalRoadmap,
  LeaderboardResponse,
  LifeRpgState,
  MaintenanceStatus,
  Mission,
  MissionDifficulty,
  MissionFrequency,
  NotificationBanner,
  ScreenId,
  SkillCategory,
  SuggestedMissionDraft,
  UserPreferences,
} from './types/hud';

// Lazy-load secondary screens for fast startup
const MissionsScreen = lazy(() =>
  import('./components/MissionsScreen').then((m) => ({ default: m.MissionsScreen }))
);
const ProgressionScreen = lazy(() =>
  import('./components/ProgressionScreen').then((m) => ({ default: m.ProgressionScreen }))
);
const LeaderboardScreen = lazy(() =>
  import('./components/LeaderboardScreen').then((m) => ({ default: m.LeaderboardScreen }))
);
const JarvisScreen = lazy(() =>
  import('./components/JarvisScreen').then((m) => ({ default: m.JarvisScreen }))
);
const DataVaultScreen = lazy(() =>
  import('./components/DataVaultScreen').then((m) => ({ default: m.DataVaultScreen }))
);

const PRIMARY_NAV: Array<{
  id: ScreenId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: ScreenId.Home, label: 'Home', icon: LayoutDashboard },
  { id: ScreenId.Missions, label: 'Missions', icon: ListChecks },
  { id: ScreenId.Progression, label: 'Skills', icon: Award },
  { id: ScreenId.Leaderboard, label: 'Leaderboard', icon: Trophy },
  { id: ScreenId.Jarvis, label: 'ATLAS', icon: Bot },
];

export default function App() {
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [state, setState] = useState<LifeRpgState | null>(null);
  const stateRef = useRef<LifeRpgState | null>(state);
  stateRef.current = state;

  const [maintenance, setMaintenance] = useState<MaintenanceStatus>({
    enabled: false,
    message: '',
    updatedAt: null,
  });
  const [registeredCount, setRegisteredCount] = useState(0);
  const [leaderboardThreshold, setLeaderboardThreshold] = useState(10);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardResponse | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  const [activeScreen, setActiveScreen] = useState<ScreenId>(ScreenId.Home);
  const [atlasInitialMode, setAtlasInitialMode] = useState<'chat' | 'planner'>('chat');
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isSaving, setIsSaving] = useState(false);

  // Modals & Overlays
  const [missionModalOpen, setMissionModalOpen] = useState(false);
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [levelUpCelebration, setLevelUpCelebration] = useState<number | null>(null);
  const [tutorialModalOpen, setTutorialModalOpen] = useState(false);
  const [legalModal, setLegalModal] = useState<{ open: boolean; tab: 'privacy' | 'terms' }>({
    open: false,
    tab: 'privacy',
  });
  const [ownerPortalOpen, setOwnerPortalOpen] = useState(false);

  const [confirmConfig, setConfirmConfig] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    onConfirm: () => {},
  });

  // Notifications / Undo Toasts
  const [notifications, setNotifications] = useState<NotificationBanner[]>([]);
  const timersRef = useRef<number[]>([]);

  const pushNotification = useCallback(
    (
      title: string,
      detail: string,
      tone: NotificationBanner['tone'] = 'cyan',
      options?: { celebration?: boolean; undoLabel?: string; onUndo?: () => void }
    ) => {
      const pref = stateRef.current?.preferences.notifications ?? 'all';
      if (pref === 'muted' && tone !== 'error') return;
      if (pref === 'important' && tone === 'cyan' && !options?.undoLabel) return;

      const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setNotifications((prev) =>
        [
          {
            id,
            title,
            detail,
            tone,
            celebration: options?.celebration,
            undoLabel: options?.undoLabel,
            onUndo: options?.onUndo,
          },
          ...prev,
        ].slice(0, 4)
      );
      const timerId = window.setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, options?.onUndo ? 7500 : 4800);
      timersRef.current.push(timerId);
    },
    []
  );

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  // Online / Offline listeners
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    if (!stateRef.current) return;
    setLeaderboardLoading(true);
    try {
      const res = await api.getLeaderboard();
      setLeaderboardData(res);
      setRegisteredCount(res.registeredCount);
      setLeaderboardThreshold(res.threshold);
    } catch {
      // Keep previous snapshot cleanly
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  // Boot check: maintenance status + cookie session restoration
  const bootstrapSession = useCallback(async () => {
    setBooting(true);
    setBootError(null);
    try {
      const status = await api.getStatus();
      setMaintenance(status.maintenance);
      setRegisteredCount(status.registeredCount);
      setLeaderboardThreshold(status.threshold);

      if (status.maintenance.enabled) {
        setState(null);
        return;
      }

      try {
        const me = await api.getMe();
        if (me.token) setUserToken(me.token);
        setState(me.state);
        if (me.resetCount > 0) {
          pushNotification(
            'New Cycle Ready',
            `${me.resetCount} recurring mission${me.resetCount > 1 ? 's' : ''} refreshed for today.`,
            'cyan'
          );
        }
      } catch (err) {
        if (err instanceof ApiError && err.maintenance) {
          setMaintenance((m) => ({ ...m, enabled: true }));
        }
        setUserToken(null);
        setState(null);
      }
    } catch (err) {
      setBootError(
        err instanceof Error
          ? err.message
          : 'Unable to connect to STRYDE right now.'
      );
      setState(null);
    } finally {
      setBooting(false);
    }
  }, [pushNotification]);

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  // Show welcome tutorial once after onboarding if not yet completed
  useEffect(() => {
    if (state && state.profile.onboardingCompleted && !state.profile.tutorialCompleted) {
      setTutorialModalOpen(true);
    }
  }, [state]);

  // Real-time SSE listener for leaderboard count, live unlock at 10, & maintenance changes
  useEffect(() => {
    const es = new EventSource('/api/leaderboard/stream');
    const onLeaderboardEvent = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as {
          registeredCount: number;
          unlocked: boolean;
          threshold: number;
        };
        setRegisteredCount(payload.registeredCount);
        setLeaderboardThreshold(payload.threshold);
        if (stateRef.current) {
          void fetchLeaderboard();
        }
      } catch {
        // Ignore malformed SSE event
      }
    };
    es.addEventListener('leaderboard', onLeaderboardEvent as EventListener);
    return () => {
      es.removeEventListener('leaderboard', onLeaderboardEvent as EventListener);
      es.close();
    };
  }, [fetchLeaderboard]);

  // Load leaderboard whenever authenticated user enters Leaderboard screen
  useEffect(() => {
    if (state && activeScreen === ScreenId.Leaderboard) {
      void fetchLeaderboard();
    }
  }, [state, activeScreen, fetchLeaderboard]);

  // Periodic recurring-reset & cloud sync check on focus / every 60s
  useEffect(() => {
    if (!state) return;
    const syncState = async () => {
      try {
        const me = await api.getMe();
        if (me.token) setUserToken(me.token);
        setState(me.state);
        if (me.resetCount > 0) {
          pushNotification(
            'New Cycle Ready',
            `${me.resetCount} recurring mission${me.resetCount > 1 ? 's' : ''} reset for ${getLocalDateKey()}.`,
            'cyan'
          );
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setUserToken(null);
          setState(null);
          pushNotification('Session Expired', 'Please sign in again to continue.', 'gold');
        } else if (err instanceof ApiError && err.maintenance) {
          setMaintenance((m) => ({ ...m, enabled: true }));
          setState(null);
        }
      }
    };

    const interval = window.setInterval(() => void syncState(), 60_000);
    const onFocus = () => void syncState();
    const onReconnect = () => void syncState();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onReconnect);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onReconnect);
    };
  }, [state !== null, pushNotification]);

  // Escape closes dialogs
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirmConfig.open) {
        setConfirmConfig((c) => ({ ...c, open: false }));
      } else if (missionModalOpen) {
        setMissionModalOpen(false);
        setEditingMission(null);
      } else if (profileModalOpen) {
        setProfileModalOpen(false);
      } else if (levelUpCelebration !== null) {
        setLevelUpCelebration(null);
      } else if (legalModal.open) {
        setLegalModal((l) => ({ ...l, open: false }));
      } else if (ownerPortalOpen) {
        setOwnerPortalOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    confirmConfig.open,
    missionModalOpen,
    profileModalOpen,
    levelUpCelebration,
    legalModal.open,
    ownerPortalOpen,
  ]);

  const handleApiError = useCallback(
    (err: unknown, fallbackMessage: string) => {
      if (err instanceof ApiError) {
        if (err.maintenance) {
          setMaintenance((m) => ({ ...m, enabled: true }));
          setState(null);
          return;
        }
        if (err.status === 401) {
          setUserToken(null);
          setState(null);
          return;
        }
        pushNotification('Action Failed', err.message, 'error');
        return;
      }
      pushNotification('Connection Issue', fallbackMessage, 'error');
    },
    [pushNotification]
  );

  // ============================================================================
  // MISSION ACTIONS (SERVER-AUTHORITATIVE WITH UNDO)
  // ============================================================================
  const handleToggleMission = useCallback(
    async (missionId: string) => {
      setIsSaving(true);
      try {
        const res = await api.toggleMission(missionId);
        setState(res.state);

        const { outcome } = res;
        if (outcome.duplicatePrevented) {
          pushNotification(
            'Mission Checked',
            'XP for this cycle was already earned.',
            'cyan'
          );
        } else if (outcome.xpGained > 0) {
          const target = res.state.missions.find((m) => m.id === missionId);
          pushNotification(
            `Mission Completed (+${outcome.xpGained} XP)`,
            `${target?.category ?? 'Skill'} +${outcome.skillGained} XP${
              outcome.streakIncremented
                ? ` · Streak: ${res.state.streak.current} days`
                : ''
            }`,
            'emerald',
            outcome.historyId
              ? {
                  undoLabel: 'Undo',
                  onUndo: () => {
                    void (async () => {
                      try {
                        const undoRes = await api.undoMissionCompletion(
                          missionId,
                          outcome.historyId!
                        );
                        setState(undoRes.state);
                        pushNotification('Undone', 'Completion and XP rolled back.', 'cyan');
                      } catch (err) {
                        handleApiError(err, 'Could not undo completion.');
                      }
                    })();
                  },
                }
              : undefined
          );

          if (
            outcome.leveledUp &&
            (stateRef.current?.preferences.celebrationsEnabled ?? true)
          ) {
            setLevelUpCelebration(outcome.newLevel);
          }

          outcome.newlyUnlocked.forEach((ach) => {
            pushNotification(`Achievement Unlocked: ${ach.title}`, ach.description, 'gold', {
              celebration: true,
            });
          });
        }
      } catch (err) {
        handleApiError(err, 'Could not update mission right now.');
      } finally {
        setIsSaving(false);
      }
    },
    [pushNotification, handleApiError]
  );

  const handleToggleSubObjective = useCallback(
    async (missionId: string, subId: string) => {
      setIsSaving(true);
      try {
        const res = await api.toggleSubObjective(missionId, subId);
        setState(res.state);
      } catch (err) {
        handleApiError(err, 'Could not update checklist item.');
      } finally {
        setIsSaving(false);
      }
    },
    [handleApiError]
  );

  const handleSaveMission = useCallback(
    async (payload: MissionDraftPayload) => {
      setIsSaving(true);
      try {
        if (editingMission) {
          const res = await api.editMission(editingMission.id, payload);
          setState(res.state);
          pushNotification('Mission Updated', `Saved "${payload.title}".`, 'cyan');
        } else {
          const res = await api.createMission(payload);
          setState(res.state);
          pushNotification('Mission Added', `"${payload.title}" added to your list.`, 'cyan');
        }
        setMissionModalOpen(false);
        setEditingMission(null);
      } catch (err) {
        handleApiError(err, 'Could not save mission.');
      } finally {
        setIsSaving(false);
      }
    },
    [editingMission, pushNotification, handleApiError]
  );

  const handleRequestDeleteMission = useCallback(
    (mission: Mission) => {
      setConfirmConfig({
        open: true,
        title: 'Delete Mission?',
        message: `Remove "${mission.title}" from your mission list? Your earned XP and history remain saved.`,
        confirmLabel: 'Delete',
        onConfirm: () => {
          setConfirmConfig((c) => ({ ...c, open: false }));
          void (async () => {
            setIsSaving(true);
            try {
              const res = await api.deleteMission(mission.id);
              setState(res.state);
              pushNotification('Mission Deleted', `Removed "${mission.title}".`, 'gold', {
                undoLabel: 'Undo',
                onUndo: () => {
                  void (async () => {
                    try {
                      const restoreRes = await api.restoreMission(res.deleted);
                      setState(restoreRes.state);
                      pushNotification('Restored', `"${mission.title}" is back.`, 'cyan');
                    } catch (err) {
                      handleApiError(err, 'Could not restore mission.');
                    }
                  })();
                },
              });
            } catch (err) {
              handleApiError(err, 'Could not delete mission.');
            } finally {
              setIsSaving(false);
            }
          })();
        },
      });
    },
    [pushNotification, handleApiError]
  );

  // ============================================================================
  // FOCUS, SCHEDULE & BRIEFING
  // ============================================================================
  const handleSelectFocusDuration = useCallback(
    async (minutes: number) => {
      try {
        const res = await api.updateProfile({ selectedFocusMinutes: minutes });
        setState(res.state);
      } catch (err) {
        handleApiError(err, 'Could not save focus duration.');
      }
    },
    [handleApiError]
  );

  const handleCompleteFocusSession = useCallback(
    async (minutes: number) => {
      setIsSaving(true);
      try {
        const res = await api.completeFocus(minutes);
        setState(res.state);
        pushNotification(
          `Focus Complete (+${res.outcome.xpGained} XP)`,
          `${minutes} minutes focused · Discipline +${minutes} XP`,
          'emerald'
        );
        if (
          res.outcome.leveledUp &&
          (stateRef.current?.preferences.celebrationsEnabled ?? true)
        ) {
          setLevelUpCelebration(res.outcome.newLevel);
        }
        res.outcome.newlyUnlocked.forEach((ach) => {
          pushNotification(`Achievement Unlocked: ${ach.title}`, ach.description, 'gold');
        });
      } catch (err) {
        handleApiError(err, 'Could not log focus session.');
      } finally {
        setIsSaving(false);
      }
    },
    [pushNotification, handleApiError]
  );

  const handleUpdateAvailableMinutes = useCallback(
    async (minutes: number) => {
      try {
        const res = await api.updateProfile({ preferences: { availableMinutesToday: minutes } });
        setState(res.state);
      } catch (err) {
        handleApiError(err, 'Could not save available time.');
      }
    },
    [handleApiError]
  );

  const handleApproveBriefing = useCallback(
    async (focusMinutes: number, headline: string) => {
      try {
        const res = await api.updateProfile({ selectedFocusMinutes: focusMinutes });
        setState(res.state);
        pushNotification(
          'Daily Plan Applied',
          `Focus timer set to ${focusMinutes}m · ${headline}`,
          'emerald'
        );
      } catch (err) {
        handleApiError(err, 'Could not apply daily briefing.');
      }
    },
    [pushNotification, handleApiError]
  );

  const handleApproveSchedule = useCallback(
    async (
      blocks: Array<{ missionId: string; startLabel: string; endLabel: string }>,
      focusMinutes: number
    ) => {
      setIsSaving(true);
      try {
        const res = await api.approveSchedule(blocks, focusMinutes);
        setState(res.state);
        pushNotification(
          'Schedule Applied',
          `Updated ${blocks.length} mission slot(s) and set focus timer to ${focusMinutes}m.`,
          'emerald'
        );
      } catch (err) {
        handleApiError(err, 'Could not apply schedule.');
      } finally {
        setIsSaving(false);
      }
    },
    [pushNotification, handleApiError]
  );

  // ============================================================================
  // GOAL ROADMAPS & ACHIEVEMENT JOURNAL
  // ============================================================================
  const handleCreateRoadmap = useCallback(
    async (payload: {
      title: string;
      description: string;
      category: SkillCategory;
      targetDate: string;
      milestones: Array<{ title: string; targetDate?: string }>;
    }) => {
      setIsSaving(true);
      try {
        const res = await api.createRoadmap(payload);
        setState(res.state);
        pushNotification('Goal Roadmap Created', `Saved "${payload.title}".`, 'emerald');
      } catch (err) {
        handleApiError(err, 'Could not create goal roadmap.');
      } finally {
        setIsSaving(false);
      }
    },
    [pushNotification, handleApiError]
  );

  const handleAddMilestone = useCallback(
    async (roadmapId: string, title: string, targetDate?: string) => {
      setIsSaving(true);
      try {
        const res = await api.addMilestone(roadmapId, { title, targetDate });
        setState(res.state);
      } catch (err) {
        handleApiError(err, 'Could not add milestone.');
      } finally {
        setIsSaving(false);
      }
    },
    [handleApiError]
  );

  const handleToggleMilestone = useCallback(
    async (roadmapId: string, milestoneId: string) => {
      setIsSaving(true);
      try {
        const res = await api.toggleMilestone(roadmapId, milestoneId);
        setState(res.state);
        if (res.outcome.xpGained > 0) {
          pushNotification(
            `Milestone Completed (+${res.outcome.xpGained} XP)`,
            res.outcome.milestoneTitle,
            'emerald'
          );
          if (
            res.outcome.leveledUp &&
            (stateRef.current?.preferences.celebrationsEnabled ?? true)
          ) {
            setLevelUpCelebration(res.outcome.newLevel);
          }
          res.outcome.newlyUnlocked.forEach((ach) => {
            pushNotification(`Achievement Unlocked: ${ach.title}`, ach.description, 'gold');
          });
        }
      } catch (err) {
        handleApiError(err, 'Could not update milestone.');
      } finally {
        setIsSaving(false);
      }
    },
    [pushNotification, handleApiError]
  );

  const handleDeleteRoadmap = useCallback(
    (roadmap: GoalRoadmap) => {
      setConfirmConfig({
        open: true,
        title: 'Delete Goal Roadmap?',
        message: `Delete "${roadmap.title}" and its milestones? Previously earned XP stays saved.`,
        confirmLabel: 'Delete Roadmap',
        onConfirm: () => {
          setConfirmConfig((c) => ({ ...c, open: false }));
          void (async () => {
            setIsSaving(true);
            try {
              const res = await api.deleteRoadmap(roadmap.id);
              setState(res.state);
              pushNotification('Roadmap Deleted', `Removed "${roadmap.title}".`, 'gold');
            } catch (err) {
              handleApiError(err, 'Could not delete roadmap.');
            } finally {
              setIsSaving(false);
            }
          })();
        },
      });
    },
    [pushNotification, handleApiError]
  );

  const handlePromoteMilestoneToMission = useCallback(
    async (roadmap: GoalRoadmap, milestone: GoalMilestone) => {
      setIsSaving(true);
      try {
        const res = await api.createMission({
          title: milestone.title,
          description: `Milestone for goal: ${roadmap.title}`,
          category: roadmap.category,
          difficulty: MissionDifficulty.Medium,
          frequency: MissionFrequency.Custom,
          deadline: milestone.targetDate || roadmap.targetDate,
          subObjectives: [],
        });
        setState(res.state);
        pushNotification(
          'Added to Missions',
          `"${milestone.title}" is now an active mission.`,
          'emerald'
        );
      } catch (err) {
        handleApiError(err, 'Could not add milestone as mission.');
      } finally {
        setIsSaving(false);
      }
    },
    [pushNotification, handleApiError]
  );

  const handleUpdateJournalNote = useCallback(
    async (entryId: string, note: string) => {
      try {
        const res = await api.updateJournalNote(entryId, note);
        setState(res.state);
        pushNotification('Note Saved', 'Updated your achievement journal.', 'cyan');
      } catch (err) {
        handleApiError(err, 'Could not save journal note.');
      }
    },
    [pushNotification, handleApiError]
  );

  const handleQuickAddMission = useCallback(
    async (preset: StarterMissionPreset) => {
      setIsSaving(true);
      try {
        const res = await api.createMission({
          title: preset.title,
          description: preset.description,
          category: preset.category,
          difficulty: preset.difficulty,
          frequency: preset.frequency,
          deadline: 'Today · 20:00',
          subObjectives: [],
        });
        setState(res.state);
        pushNotification('Mission Added', `"${preset.title}" added to your list.`, 'emerald');
      } catch (err) {
        handleApiError(err, 'Could not add starter mission.');
      } finally {
        setIsSaving(false);
      }
    },
    [pushNotification, handleApiError]
  );

  // ============================================================================
  // ATLAS AI ACTIONS
  // ============================================================================
  const handleConfirmAddAtlasMission = useCallback(
    async (messageId: string, draft: SuggestedMissionDraft) => {
      setIsSaving(true);
      try {
        const res = await api.batchCreateMissions([draft], messageId);
        setState(res.state);
        if (res.addedCount === 0) {
          pushNotification(
            'Already in Missions',
            `"${draft.title}" is already in your active mission list.`,
            'cyan'
          );
        } else {
          pushNotification(
            'Mission Added',
            `"${draft.title}" was added to your mission list.`,
            'emerald'
          );
        }
      } catch (err) {
        handleApiError(err, 'Could not add suggested mission.');
      } finally {
        setIsSaving(false);
      }
    },
    [pushNotification, handleApiError]
  );

  const handleApprovePlannedMissions = useCallback(
    async (drafts: SuggestedMissionDraft[]) => {
      setIsSaving(true);
      try {
        const res = await api.batchCreateMissions(drafts);
        setState(res.state);
        pushNotification(
          'Plan Approved',
          `Added ${res.addedCount} mission${res.addedCount === 1 ? '' : 's'} to your queue.`,
          'emerald'
        );
      } catch (err) {
        handleApiError(err, 'Could not add planned missions.');
      } finally {
        setIsSaving(false);
      }
    },
    [pushNotification, handleApiError]
  );

  const handleSavePlannedRoadmap = useCallback(
    async (goalTitle: string, summary: string, drafts: SuggestedMissionDraft[]) => {
      setIsSaving(true);
      try {
        const res = await api.createRoadmap({
          title: goalTitle,
          description: summary,
          category: drafts[0]?.category ?? SkillCategory.Discipline,
          targetDate: drafts[0]?.deadline ?? 'This month',
          milestones: drafts.map((d) => ({ title: d.title, targetDate: d.deadline })),
        });
        setState(res.state);
        pushNotification(
          'Roadmap Saved',
          `Saved "${goalTitle}" with ${drafts.length} milestones.`,
          'emerald'
        );
      } catch (err) {
        handleApiError(err, 'Could not save planned roadmap.');
      } finally {
        setIsSaving(false);
      }
    },
    [pushNotification, handleApiError]
  );

  const handleRequestClearAtlas = useCallback(() => {
    setConfirmConfig({
      open: true,
      title: 'Clear ATLAS Chat?',
      message:
        'Start a fresh conversation with ATLAS? Your missions, XP, and achievements stay untouched.',
      confirmLabel: 'Clear Chat',
      onConfirm: () => {
        setConfirmConfig((c) => ({ ...c, open: false }));
        void (async () => {
          try {
            const res = await api.clearAtlasHistory();
            setState(res.state);
            pushNotification('Chat Cleared', 'Started a fresh ATLAS conversation.', 'cyan');
          } catch (err) {
            handleApiError(err, 'Could not clear ATLAS history.');
          }
        })();
      },
    });
  }, [pushNotification, handleApiError]);

  const handleToggleVoiceReplies = useCallback(
    async (enabled: boolean) => {
      try {
        const res = await api.updateProfile({ preferences: { voiceRepliesEnabled: enabled } });
        setState(res.state);
      } catch (err) {
        handleApiError(err, 'Could not update voice setting.');
      }
    },
    [handleApiError]
  );

  // ============================================================================
  // PROFILE, PREFERENCES, LOGOUT & TUTORIAL
  // ============================================================================
  const handleUpdateProfile = useCallback(
    async (
      name: string,
      roleTitle: string,
      avatarId: AvatarId,
      leaderboardOptIn: boolean
    ) => {
      setIsSaving(true);
      try {
        const res = await api.updateProfile({ name, roleTitle, avatarId, leaderboardOptIn });
        setState(res.state);
        pushNotification('Profile Saved', 'Your profile details were updated.', 'emerald');
      } catch (err) {
        handleApiError(err, 'Could not save profile.');
      } finally {
        setIsSaving(false);
      }
    },
    [pushNotification, handleApiError]
  );

  const handleUpdatePreferences = useCallback(
    async (prefs: UserPreferences) => {
      setIsSaving(true);
      try {
        const res = await api.updateProfile({ preferences: prefs });
        setState(res.state);
      } catch (err) {
        handleApiError(err, 'Could not save preferences.');
      } finally {
        setIsSaving(false);
      }
    },
    [handleApiError]
  );

  const handleImportState = useCallback(
    async (imported: LifeRpgState) => {
      setIsSaving(true);
      try {
        const res = await api.migrateLocalMissions(imported.missions);
        setState(res.state);
        pushNotification(
          'Missions Imported',
          `Added ${res.importedCount} mission(s) safely to your account.`,
          'emerald'
        );
      } catch (err) {
        handleApiError(err, 'Could not import backup missions.');
      } finally {
        setIsSaving(false);
      }
    },
    [pushNotification, handleApiError]
  );

  const handleLogout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Ignore network error on logout
    }
    setUserToken(null);
    setState(null);
    setLeaderboardData(null);
    setActiveScreen(ScreenId.Home);
  }, []);

  const handleAccountDeleted = useCallback(() => {
    setUserToken(null);
    setState(null);
    setLeaderboardData(null);
    setActiveScreen(ScreenId.Home);
  }, []);

  const handleCompleteTutorial = useCallback(async () => {
    setTutorialModalOpen(false);
    if (stateRef.current && !stateRef.current.profile.tutorialCompleted) {
      try {
        const res = await api.updateProfile({ tutorialCompleted: true });
        setState(res.state);
      } catch {
        // Ignore non-critical error
      }
    }
  }, []);

  // ============================================================================
  // RENDER GATES
  // ============================================================================
  const globalModals = (
    <>
      <LegalModal
        open={legalModal.open}
        initialTab={legalModal.tab}
        onClose={() => setLegalModal((l) => ({ ...l, open: false }))}
      />
      <OwnerPortalModal
        open={ownerPortalOpen}
        onClose={() => setOwnerPortalOpen(false)}
        onMaintenanceUpdated={(m) => {
          setMaintenance(m);
          if (!m.enabled) {
            void bootstrapSession();
          }
        }}
      />
    </>
  );

  if (booting) {
    return (
      <div className="hud-canvas-grid flex min-h-screen items-center justify-center text-[#E2E2EC]">
        <div className="flex items-center gap-3 font-mono text-sm text-[#B9CACB]">
          <Loader2 className="hud-accent-text h-5 w-5 animate-spin" />
          Loading STRYDE...
        </div>
      </div>
    );
  }

  if (bootError) {
    return (
      <ErrorBoundary>
        <div className="hud-canvas-grid flex min-h-screen items-center justify-center px-4 py-10 text-[#E2E2EC]">
          <div className="hud-layer-2 w-full max-w-md rounded-md border border-[#FFB4AB]/35 p-6 text-center">
            <WifiOff className="mx-auto h-9 w-9 text-[#FFB4AB]" />
            <h1 className="mt-3 font-display text-xl font-bold text-[#E2E2EC]">
              Connection Unavailable
            </h1>
            <p className="mt-2 text-sm text-[#B9CACB]">
              STRYDE could not reach the server. Check your connection and try again.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => void bootstrapSession()}
                className="hud-btn-primary inline-flex min-h-[40px] items-center gap-2 rounded px-4 py-2 font-display text-sm font-semibold"
              >
                <RefreshCw className="h-4 w-4" />
                Retry Connection
              </button>
              <button
                type="button"
                onClick={() => setOwnerPortalOpen(true)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded border border-white/15 bg-[#0C0E15] px-3.5 py-2 font-mono text-xs text-[#B9CACB] hover:border-[var(--hud-accent-border)] hover:text-[#E2E2EC]"
              >
                <ShieldAlert className="h-3.5 w-3.5" />
                Owner Portal
              </button>
            </div>
          </div>
        </div>
        {globalModals}
      </ErrorBoundary>
    );
  }

  if (maintenance.enabled) {
    return (
      <ErrorBoundary>
        <MaintenanceScreen
          maintenance={maintenance}
          onRefreshStatus={() => void bootstrapSession()}
          onOpenOwnerPortal={() => setOwnerPortalOpen(true)}
        />
        {globalModals}
      </ErrorBoundary>
    );
  }

  if (!state) {
    return (
      <ErrorBoundary>
        <AuthWelcomeScreen
          registeredCount={registeredCount}
          leaderboardThreshold={leaderboardThreshold}
          onAuthenticated={(nextState) => setState(nextState)}
          onOpenLegal={(tab) => setLegalModal({ open: true, tab })}
          onOpenOwnerPortal={() => setOwnerPortalOpen(true)}
        />
        {globalModals}
      </ErrorBoundary>
    );
  }

  if (!state.profile.onboardingCompleted) {
    return (
      <ErrorBoundary>
        <OnboardingWizard state={state} onComplete={(nextState) => setState(nextState)} />
        {globalModals}
      </ErrorBoundary>
    );
  }

  const accentColor =
    state.preferences.themeAccent === 'violet'
      ? '#8B5CF6'
      : state.preferences.themeAccent === 'emerald'
        ? '#10B981'
        : '#00F0FF';

  return (
    <ErrorBoundary>
      <div
        className="hud-canvas-grid min-h-screen text-[#E2E2EC]"
        data-accent={state.preferences.themeAccent}
      >
        <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col lg:flex-row">
          {/* Desktop Sidebar (240px) — 5 primary links + compact Settings footer */}
          <aside className="hud-layer-1 hidden w-[240px] shrink-0 flex-col justify-between border-y-0 border-l-0 border-r border-white/[0.07] p-5 lg:sticky lg:top-0 lg:flex lg:h-screen">
            <div>
              <div className="flex items-center gap-2.5 border-b border-white/[0.07] pb-4">
                <svg className="h-7 w-7 shrink-0" viewBox="0 0 32 32" aria-hidden="true">
                  <polygon
                    points="16,2 29,9.5 29,22.5 16,30 3,22.5 3,9.5"
                    fill="#0C0E15"
                    stroke={accentColor}
                    strokeWidth="2"
                  />
                  <polygon
                    points="16,8 23,12 23,20 16,24 9,20 9,12"
                    fill={accentColor}
                    fillOpacity="0.25"
                  />
                </svg>
                <span className="font-display text-lg font-bold tracking-tight text-[#E2E2EC] whitespace-nowrap">
                  STRYDE
                </span>
              </div>

              <nav className="mt-5 space-y-1.5" aria-label="Main navigation">
                {PRIMARY_NAV.map((item) => {
                  const Icon = item.icon;
                  const active = activeScreen === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.id === ScreenId.Jarvis) setAtlasInitialMode('chat');
                        setActiveScreen(item.id);
                      }}
                      aria-current={active ? 'page' : undefined}
                      className={`flex min-h-[40px] w-full items-center justify-between gap-2 rounded px-3 py-2 text-left font-display text-sm font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'hud-nav-active border'
                          : 'border border-transparent text-[#B9CACB] hover:bg-white/[0.04] hover:text-[#E2E2EC]'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            active ? 'hud-accent-text' : 'text-[#9BA9AC]'
                          }`}
                        />
                        <span>{item.label}</span>
                      </span>
                      {item.id === ScreenId.Leaderboard &&
                        registeredCount < leaderboardThreshold && (
                          <span className="font-mono text-[10px] text-[#9BA9AC]">
                            {registeredCount}/{leaderboardThreshold}
                          </span>
                        )}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setActiveScreen(ScreenId.DataVault)}
                aria-current={activeScreen === ScreenId.DataVault ? 'page' : undefined}
                className={`flex min-h-[40px] w-full items-center gap-3 rounded border px-3 py-2 text-left font-display text-sm font-medium transition-colors ${
                  activeScreen === ScreenId.DataVault
                    ? 'hud-nav-active'
                    : 'border-white/[0.07] bg-[#0C0E15] text-[#B9CACB] hover:text-[#E2E2EC]'
                }`}
              >
                <Settings
                  className={`h-4 w-4 ${
                    activeScreen === ScreenId.DataVault ? 'hud-accent-text' : 'text-[#9BA9AC]'
                  }`}
                />
                Settings
              </button>

              <div className="flex items-center gap-2.5 rounded border border-white/[0.07] bg-[#0C0E15] p-3">
                <AvatarBadge avatarId={state.profile.avatarId} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-xs font-semibold text-[#E2E2EC] truncate">
                    {state.profile.name}
                  </p>
                  <p className="font-mono text-[11px] text-[#9BA9AC]">
                    Lv.{state.profile.level} ·{' '}
                    <span className="text-[#FCD34D]">{state.streak.current}d</span>
                  </p>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Viewport */}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="hud-layer-1 sticky top-0 z-30 flex items-center justify-between gap-4 border-x-0 border-t-0 border-b border-white/[0.07] px-4 py-2.5 sm:px-6 lg:px-8">
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-display text-base font-bold text-[#E2E2EC] whitespace-nowrap lg:hidden">
                  STRYDE
                </span>
                <span className="hidden font-mono text-xs text-[#B9CACB] lg:inline whitespace-nowrap">
                  {activeScreen === ScreenId.DataVault
                    ? 'Settings'
                    : PRIMARY_NAV.find((i) => i.id === activeScreen)?.label}
                  <span className="mx-2 text-[#9BA9AC]">·</span>
                  {getLocalDateKey()}
                </span>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                <span className="hidden font-mono text-[11px] text-[#9BA9AC] sm:inline">
                  {isSaving ? 'Saving...' : 'Saved'}
                </span>

                <button
                  type="button"
                  onClick={() => setActiveScreen(ScreenId.DataVault)}
                  className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded border border-white/12 bg-[#0C0E15] p-2 text-[#B9CACB] hover:text-[#E2E2EC] lg:hidden"
                  aria-label="Open Settings"
                >
                  <Settings className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditingMission(null);
                    setMissionModalOpen(true);
                  }}
                  className="hud-btn-primary flex min-h-[38px] items-center gap-1.5 rounded px-3.5 py-2 font-display text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Mission
                </button>
              </div>
            </header>

            {/* Mobile Primary Navigation */}
            <nav
              className="flex items-center gap-1 overflow-x-auto border-b border-white/[0.07] bg-[#0C0E15]/95 px-3 py-1.5 lg:hidden"
              aria-label="Mobile navigation"
            >
              {PRIMARY_NAV.map((item) => {
                const Icon = item.icon;
                const active = activeScreen === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => {
                      if (item.id === ScreenId.Jarvis) setAtlasInitialMode('chat');
                      setActiveScreen(item.id);
                    }}
                    className={`flex min-h-[38px] items-center gap-1.5 rounded px-3 py-1.5 font-display text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'hud-nav-active border'
                        : 'text-[#B9CACB] hover:text-[#E2E2EC]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <main className="flex-1 p-4 sm:p-6 lg:p-8">
              {!isOnline && (
                <div
                  role="status"
                  className="mb-4 flex items-center gap-2 rounded border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-4 py-2.5 text-xs text-[#FCD34D]"
                >
                  <WifiOff className="h-4 w-4 shrink-0" />
                  <span>
                    You appear to be offline. Changes will resume syncing automatically when your connection returns.
                  </span>
                </div>
              )}

              <SectionErrorBoundary resetKey={activeScreen}>
                <Suspense
                  fallback={
                    <div className="hud-layer-1 rounded-md p-8 text-center font-mono text-xs text-[#B9CACB]">
                      Loading...
                    </div>
                  }
                >
                  {activeScreen === ScreenId.Home && (
                    <HomeDashboardScreen
                      state={state}
                      isOnline={isOnline}
                      onToggleMission={(id) => void handleToggleMission(id)}
                      onToggleSubObjective={(mid, sid) => void handleToggleSubObjective(mid, sid)}
                      onOpenNewMission={() => {
                        setEditingMission(null);
                        setMissionModalOpen(true);
                      }}
                      onQuickAddMission={(preset) => void handleQuickAddMission(preset)}
                      onEditMission={(mission) => {
                        setEditingMission(mission);
                        setMissionModalOpen(true);
                      }}
                      onDeleteMission={handleRequestDeleteMission}
                      onSelectFocusDuration={(mins) => void handleSelectFocusDuration(mins)}
                      onCompleteFocusSession={(mins) => void handleCompleteFocusSession(mins)}
                      onUpdateAvailableMinutes={(mins) => void handleUpdateAvailableMinutes(mins)}
                      onApproveBriefing={(mins, headline) =>
                        void handleApproveBriefing(mins, headline)
                      }
                      onApproveSchedule={(blocks, mins) => void handleApproveSchedule(blocks, mins)}
                      onNavigateJarvis={() => {
                        setAtlasInitialMode('chat');
                        setActiveScreen(ScreenId.Jarvis);
                      }}
                      onEditProfile={() => setProfileModalOpen(true)}
                    />
                  )}

                  {activeScreen === ScreenId.Missions && (
                    <MissionsScreen
                      state={state}
                      onToggleMission={(id) => void handleToggleMission(id)}
                      onToggleSubObjective={(mid, sid) => void handleToggleSubObjective(mid, sid)}
                      onOpenNewMission={() => {
                        setEditingMission(null);
                        setMissionModalOpen(true);
                      }}
                      onQuickAddMission={(preset) => void handleQuickAddMission(preset)}
                      onEditMission={(mission) => {
                        setEditingMission(mission);
                        setMissionModalOpen(true);
                      }}
                      onDeleteMission={handleRequestDeleteMission}
                      onCreateRoadmap={(p) => void handleCreateRoadmap(p)}
                      onAddMilestone={(rid, title, td) => void handleAddMilestone(rid, title, td)}
                      onToggleMilestone={(rid, msid) => void handleToggleMilestone(rid, msid)}
                      onDeleteRoadmap={handleDeleteRoadmap}
                      onPromoteMilestoneToMission={(r, ms) =>
                        void handlePromoteMilestoneToMission(r, ms)
                      }
                      onNavigateAtlasPlanner={() => {
                        setAtlasInitialMode('planner');
                        setActiveScreen(ScreenId.Jarvis);
                      }}
                    />
                  )}

                  {activeScreen === ScreenId.Progression && (
                    <ProgressionScreen
                      state={state}
                      onUpdateJournalNote={(id, note) => void handleUpdateJournalNote(id, note)}
                    />
                  )}

                  {activeScreen === ScreenId.Leaderboard && (
                    <LeaderboardScreen
                      data={leaderboardData}
                      loading={leaderboardLoading}
                      onRefresh={() => void fetchLeaderboard()}
                      onOpenSettings={() => setActiveScreen(ScreenId.DataVault)}
                    />
                  )}

                  {activeScreen === ScreenId.Jarvis && (
                    <JarvisScreen
                      state={state}
                      isOnline={isOnline}
                      initialMode={atlasInitialMode}
                      onSyncStateFromAtlas={(nextState) => {
                        if (nextState && nextState.profile) {
                          setState(nextState);
                        }
                      }}
                      onConfirmAddMission={(mid, draft) =>
                        void handleConfirmAddAtlasMission(mid, draft)
                      }
                      onApprovePlannedMissions={(drafts) =>
                        void handleApprovePlannedMissions(drafts)
                      }
                      onSavePlannedRoadmap={(title, summary, drafts) =>
                        void handleSavePlannedRoadmap(title, summary, drafts)
                      }
                      onRequestClearHistory={handleRequestClearAtlas}
                      onToggleVoiceReplies={(en) => void handleToggleVoiceReplies(en)}
                    />
                  )}

                  {activeScreen === ScreenId.DataVault && (
                    <DataVaultScreen
                      state={state}
                      onUpdateProfile={(name, role, avatar, optIn) =>
                        void handleUpdateProfile(name, role, avatar, optIn)
                      }
                      onUpdatePreferences={(prefs) => void handleUpdatePreferences(prefs)}
                      onImportState={(imported) => void handleImportState(imported)}
                      onLogout={() => void handleLogout()}
                      onAccountDeleted={handleAccountDeleted}
                      onLaunchTutorial={() => setTutorialModalOpen(true)}
                      onOpenLegal={(tab) => setLegalModal({ open: true, tab })}
                      onOpenOwnerPortal={() => setOwnerPortalOpen(true)}
                    />
                  )}
                </Suspense>
              </SectionErrorBoundary>
            </main>
          </div>
        </div>

        {/* Notifications & Undo Toasts */}
        {notifications.length > 0 && (
          <div
            className="fixed bottom-4 right-4 z-40 flex w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0"
            aria-live="polite"
          >
            {notifications.map((n) => {
              const toneBorder =
                n.tone === 'emerald'
                  ? 'border-[#10B981]'
                  : n.tone === 'gold'
                    ? 'border-[#F59E0B]'
                    : n.tone === 'error'
                      ? 'border-[#FFB4AB]'
                      : 'border-[#00F0FF]';
              return (
                <div
                  key={n.id}
                  className={`hud-layer-3 flex items-start justify-between gap-3 rounded-md border p-3.5 ${toneBorder}`}
                >
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        n.tone === 'emerald'
                          ? 'text-[#65F2B5]'
                          : n.tone === 'gold'
                            ? 'text-[#FCD34D]'
                            : n.tone === 'error'
                              ? 'text-[#FFB4AB]'
                              : 'text-[#00F0FF]'
                      }`}
                    />
                    <div>
                      <p className="font-display text-sm font-semibold text-[#E2E2EC]">
                        {n.title}
                      </p>
                      <p className="mt-0.5 text-xs text-[#B9CACB]">{n.detail}</p>
                      {n.onUndo && (
                        <button
                          type="button"
                          onClick={() => {
                            const fn = n.onUndo;
                            setNotifications((prev) => prev.filter((item) => item.id !== n.id));
                            fn?.();
                          }}
                          className="mt-1.5 inline-flex items-center gap-1 rounded border border-white/20 bg-[#0C0E15] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#00F0FF] hover:border-[#00F0FF]"
                        >
                          <Undo2 className="h-3 w-3" />
                          {n.undoLabel || 'Undo'}
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setNotifications((prev) => prev.filter((item) => item.id !== n.id))
                    }
                    className="flex min-h-[28px] min-w-[28px] items-center justify-center rounded p-0.5 text-[#9BA9AC] hover:text-[#E2E2EC]"
                    aria-label="Dismiss notification"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Core Modals */}
        <MissionModal
          open={missionModalOpen}
          editingMission={editingMission}
          onSave={(payload) => void handleSaveMission(payload)}
          onClose={() => {
            setMissionModalOpen(false);
            setEditingMission(null);
          }}
        />

        <ProfileModal
          open={profileModalOpen}
          initialName={state.profile.name}
          initialRole={state.profile.roleTitle}
          initialAvatarId={state.profile.avatarId}
          initialLeaderboardOptIn={state.profile.leaderboardOptIn}
          onSave={(name, role, avatar, optIn) =>
            void handleUpdateProfile(name, role, avatar, optIn)
          }
          onClose={() => setProfileModalOpen(false)}
        />

        <LevelUpModal
          level={levelUpCelebration}
          celebrationsEnabled={state.preferences.celebrationsEnabled}
          onClose={() => setLevelUpCelebration(null)}
        />

        <TutorialModal
          open={tutorialModalOpen}
          onComplete={() => void handleCompleteTutorial()}
        />

        <ConfirmDialog
          open={confirmConfig.open}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmLabel={confirmConfig.confirmLabel}
          onConfirm={confirmConfig.onConfirm}
          onCancel={() => setConfirmConfig((c) => ({ ...c, open: false }))}
        />

        {globalModals}
      </div>
    </ErrorBoundary>
  );
}
