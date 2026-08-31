'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createDefaultProgress } from '../core/defaults';
import {
  hydrateLearningContentIslamic,
  hydrateLearningContentQuranReader,
  hydrateLearningContentSourceCatalog,
  hydrateLearningContentSources,
  hydrateLearningContentVocabularyDetails,
  loadLearningContentCore
} from '../services/content/content-service';
import { createStorageService } from '../services/storage/storage-factory';
import { summarizeReviewItems } from '../services/storage/storage-domain';
import { buildSkillProgressEntries, changedSkillProgressEntries, updateSkillProgressEntries } from '../services/learning/skill-progress-service';
import type { StorageService } from '../services/storage/storage-service';
import type {
  AppPreferences,
  BackupPackage,
  ImportBackupOptions,
  ContentProgressEntry,
  CreateProfileInput,
  ExerciseResultEntry,
  LearningHistoryEntry,
  LearningTransactionInput,
  LearningTransactionResult,
  LearningContent,
  Profile,
  ProfileSummary,
  ProgressState,
  ResetScope,
  ReviewItem,
  ReviewSummary,
  SessionSummary,
  SkillProgressEntry,
  UserAnnotation,
  UserAnnotationEntityType,
  UserAnnotationInput,
  UserAnnotationType,
  CourseTrack
} from '../types/models';
import { cloneProgressForUpdate, type ProgressBranch } from './progress-copy';

const EMPTY_REVIEW: ReviewSummary = { dueNow: 0, dueToday: 0, total: 0, mastered: 0 };
const EMPTY_SESSION: SessionSummary = { minutesToday: 0, currentStreak: 0, longestStreak: 0, activeDays: 0, lastActiveDate: null };

type CommitInput = Omit<LearningTransactionInput, 'progress' | 'sessionId'> & { progress?: ProgressState };

interface AppRuntimeContextValue {
  ready: boolean;
  hydrated: boolean;
  busy: boolean;
  error: string | null;
  storageMode: StorageService['mode'] | null;
  contentReady: boolean;
}

interface AppContentContextValue {
  content: LearningContent | null;
  ensureVocabularyDetails(): Promise<void>;
  ensureSourceCatalog(): Promise<void>;
  ensureSources(sourceId?: string): Promise<void>;
  ensureIslamicTrack(track?: Exclude<CourseTrack, 'fusha' | 'quran'>): Promise<void>;
  ensureQuranReader(surahs?: readonly number[]): Promise<void>;
}

interface AppProfileContextValue {
  profiles: ProfileSummary[];
  profile: Profile | null;
  createProfile(input: CreateProfileInput): Promise<void>;
  openProfile(profileId: string, pin?: string): Promise<void>;
  switchProfile(): void;
  exportBackup(pin?: string): Promise<BackupPackage | null>;
  importBackup(backup: BackupPackage, options?: ImportBackupOptions): Promise<void>;
  reset(scope: ResetScope): Promise<void>;
  deleteCurrentProfile(pin?: string): Promise<void>;
}

interface AppPreferencesContextValue {
  preferences: AppPreferences;
  patchPreferences(mutator: (draft: AppPreferences) => void): Promise<ProgressState>;
}

interface AppProgressActionsContextValue {
  saveProgress(next: ProgressState): Promise<void>;
  patchProgress(mutator: (draft: ProgressState) => void, branches?: readonly ProgressBranch[]): Promise<ProgressState>;
}

interface AppProgressContextValue {
  progress: ProgressState;
  saveProgress(next: ProgressState): Promise<void>;
  patchProgress(mutator: (draft: ProgressState) => void, branches?: readonly ProgressBranch[]): Promise<ProgressState>;
}

interface AppLearningSummaryContextValue {
  reviewSummary: ReviewSummary;
  sessionSummary: SessionSummary;
}

interface AppLearningContextValue {
  contentProgress: ContentProgressEntry[];
  reviewSummary: ReviewSummary;
  reviewItems: ReviewItem[];
  history: LearningHistoryEntry[];
  exerciseResults: ExerciseResultEntry[];
  skillProgress: SkillProgressEntry[];
  sessionSummary: SessionSummary;
  commit(input: CommitInput): Promise<LearningTransactionResult | null>;
  refresh(): Promise<void>;
}

interface AppAnnotationContextValue {
  userAnnotations: UserAnnotation[];
  upsertAnnotation(input: UserAnnotationInput): Promise<UserAnnotation | null>;
  deleteAnnotation(entityType: UserAnnotationEntityType, entityId: string, annotationType: UserAnnotationType): Promise<void>;
}

type AppContextValue = AppRuntimeContextValue & AppContentContextValue & AppProfileContextValue & AppProgressContextValue & AppLearningContextValue & AppAnnotationContextValue;

const AppRuntimeContext = createContext<AppRuntimeContextValue | null>(null);
const AppContentContext = createContext<AppContentContextValue | null>(null);
const AppProfileContext = createContext<AppProfileContextValue | null>(null);
const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);
const AppProgressActionsContext = createContext<AppProgressActionsContextValue | null>(null);
const AppProgressContext = createContext<AppProgressContextValue | null>(null);
const AppLearningSummaryContext = createContext<AppLearningSummaryContextValue | null>(null);
const AppLearningContext = createContext<AppLearningContextValue | null>(null);
const AppAnnotationContext = createContext<AppAnnotationContextValue | null>(null);

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? 'Unbekannter Fehler');
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<LearningContent | null>(null);
  const contentRef = useRef<LearningContent | null>(null);
  const contentHydrationQueue = useRef<Promise<void>>(Promise.resolve());
  const [storage, setStorage] = useState<StorageService | null>(null);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [progress, setProgress] = useState<ProgressState>(() => createDefaultProgress());
  const progressRef = useRef(progress);
  const [contentProgress, setContentProgress] = useState<ContentProgressEntry[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary>(EMPTY_REVIEW);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [history, setHistory] = useState<LearningHistoryEntry[]>([]);
  const [exerciseResults, setExerciseResults] = useState<ExerciseResultEntry[]>([]);
  const [skillProgress, setSkillProgress] = useState<SkillProgressEntry[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary>(EMPTY_SESSION);
  const [userAnnotations, setUserAnnotations] = useState<UserAnnotation[]>([]);
  const activeSessionId = useRef<string | null>(null);
  const profileRef = useRef<Profile | null>(null);
  const skillProgressRef = useRef<SkillProgressEntry[]>([]);

  const applyProgress = useCallback((next: ProgressState) => {
    progressRef.current = next;
    setProgress(next);
  }, []);

  const applyContent = useCallback((next: LearningContent) => {
    contentRef.current = next;
    setContent(next);
  }, []);

  const queueContentHydration = useCallback((hydrateLayer: (current: LearningContent) => Promise<LearningContent>): Promise<void> => {
    const execute = async () => {
      const current = contentRef.current;
      if (!current) return;
      try {
        const next = await hydrateLayer(current);
        if (next !== current) applyContent(next);
      } catch (cause) {
        setError(errorText(cause));
        throw cause;
      }
    };
    const pending = contentHydrationQueue.current.then(execute, execute);
    contentHydrationQueue.current = pending.catch(() => undefined);
    return pending;
  }, [applyContent]);

  const refreshProfiles = useCallback(async (service: StorageService) => {
    const list = await service.listProfiles();
    setProfiles([...list].sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt)));
    return list;
  }, []);

  const hydrate = useCallback(async (service: StorageService, activeProfile: Profile, learningContent?: LearningContent | null) => {
    setHydrated(false);
    try {
      const [entries, reviews, recentHistory, results, skills, sessions, annotations] = await Promise.all([
        service.listContentProgress(activeProfile.id),
        service.listAllReviews(activeProfile.id),
        service.listHistory(activeProfile.id, 80),
        service.listExerciseResults(activeProfile.id, 300),
        service.listSkillProgress(activeProfile.id),
        service.getSessionSummary(activeProfile.id),
        service.listUserAnnotations(activeProfile.id)
      ]);
      setContentProgress(entries);
      setReviewItems(reviews);
      setReviewSummary(summarizeReviewItems(reviews));
      setHistory(recentHistory);
      setExerciseResults(results);
      if (learningContent && skills.length === 0) {
        // One-time migration/repair path: rebuild from the complete retained event history,
        // never from the bounded runtime window.
        const allResults = await service.listExerciseResults(activeProfile.id, 0);
        const rebuilt = buildSkillProgressEntries(activeProfile.id, learningContent, allResults);
        if (rebuilt.length) await service.syncSkillProgress(activeProfile.id, rebuilt);
        skillProgressRef.current = rebuilt;
        setSkillProgress(rebuilt);
      } else {
        skillProgressRef.current = skills;
        setSkillProgress(skills);
      }
      setSessionSummary(sessions);
      setUserAnnotations(annotations);
    } finally {
      setHydrated(true);
    }
  }, []);

  const endSession = useCallback(async (service: StorageService | null, currentProfile: Profile | null) => {
    const sessionId = activeSessionId.current;
    if (!service || !currentProfile || !sessionId) return;
    activeSessionId.current = null;
    try { await service.endSession(currentProfile.id, sessionId); } catch { /* shutdown-safe */ }
  }, []);

  const openProfile = useCallback(async (profileId: string, pin = '') => {
    if (!storage) return;
    setBusy(true);
    setError(null);
    try {
      await endSession(storage, profileRef.current);
      const data = await storage.openProfile(profileId, pin);
      setProfile(data.profile);
      profileRef.current = data.profile;
      applyProgress(data.progress);
      await hydrate(storage, data.profile, content);
      const session = await storage.startSession(data.profile.id);
      activeSessionId.current = session.id;
      await refreshProfiles(storage);
    } catch (cause) {
      setError(errorText(cause));
      throw cause;
    } finally {
      setBusy(false);
    }
  }, [applyProgress, content, endSession, hydrate, refreshProfiles, storage]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setError(null);
      try {
        const contentPromise = loadLearningContentCore();
        const servicePromise = (async () => {
          const next = await createStorageService();
          await next.initialize();
          return next;
        })();

        const service = await servicePromise;
        const [learningContent, list] = await Promise.all([contentPromise, refreshProfiles(service)]);
        if (cancelled) return;
        setStorage(service);
        applyContent(learningContent);

        const automatic = [...list]
          .filter(candidate => !candidate.protected)
          .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0];

        if (!automatic) {
          setReady(true);
          return;
        }

        const data = await service.openProfile(automatic.id);
        if (cancelled) return;
        setProfile(data.profile);
        profileRef.current = data.profile;
        applyProgress(data.progress);

        // The visible shell and core learning page can render now. Heavy profile
        // summaries hydrate progressively instead of blocking first paint.
        setReady(true);
        void hydrate(service, data.profile, learningContent).catch((cause) => {
          if (!cancelled) setError(errorText(cause));
        });
        void service.startSession(data.profile.id).then((session) => {
          if (!cancelled) activeSessionId.current = session.id;
        }).catch((cause) => {
          if (!cancelled) setError(errorText(cause));
        });
      } catch (cause) {
        if (!cancelled) {
          setError(errorText(cause));
          setReady(true);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [applyContent, hydrate, refreshProfiles]);

  useEffect(() => {
    const onPageHide = () => { void endSession(storage, profileRef.current); };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [endSession, storage]);

  useEffect(() => {
    const root = document.documentElement;
    const preferences = progress.preferences;
    root.dataset.theme = preferences.colorScheme;
    root.dataset.mode = preferences.themeMode;
    root.dataset.contrast = preferences.highContrast ? 'high' : 'normal';
    root.dataset.motion = preferences.reducedMotion ? 'reduced' : 'normal';
    root.dataset.fontSize = preferences.fontSize;
    root.dataset.arabicSize = preferences.arabicFontSize;
    root.dataset.arabicFont = preferences.arabicFont;
    root.dataset.transliteration = preferences.transliteration ? 'show' : 'hide';
    root.dataset.harakat = preferences.harakat;
    root.dataset.learningHelp = preferences.learningHelp;
  }, [
    progress.preferences.arabicFont, progress.preferences.arabicFontSize, progress.preferences.colorScheme, progress.preferences.fontSize,
    progress.preferences.harakat, progress.preferences.highContrast, progress.preferences.learningHelp,
    progress.preferences.reducedMotion, progress.preferences.themeMode, progress.preferences.transliteration
  ]);

  const createProfile = useCallback(async (input: CreateProfileInput) => {
    if (!storage) return;
    setBusy(true);
    setError(null);
    try {
      await endSession(storage, profileRef.current);
      const data = await storage.createProfile(input);
      setProfile(data.profile);
      profileRef.current = data.profile;
      applyProgress(data.progress);
      await hydrate(storage, data.profile, content);
      const session = await storage.startSession(data.profile.id);
      activeSessionId.current = session.id;
      await refreshProfiles(storage);
    } catch (cause) {
      setError(errorText(cause));
      throw cause;
    } finally {
      setBusy(false);
    }
  }, [applyProgress, content, endSession, hydrate, refreshProfiles, storage]);

  const saveProgress = useCallback(async (next: ProgressState) => {
    if (!storage || !profile) return;
    const previousProgress = progressRef.current;
    applyProgress(next);
    await storage.saveProgress(profile.id, next, previousProgress);
  }, [applyProgress, profile, storage]);

  const patchProgress = useCallback(async (mutator: (draft: ProgressState) => void, branches: readonly ProgressBranch[] = ['all']) => {
    const next = cloneProgressForUpdate(progressRef.current, branches);
    mutator(next);
    await saveProgress(next);
    return next;
  }, [saveProgress]);

  const patchPreferences = useCallback((mutator: (draft: AppPreferences) => void) => (
    patchProgress((draft) => mutator(draft.preferences), ['preferences'])
  ), [patchProgress]);

  const commit = useCallback(async (input: CommitInput): Promise<LearningTransactionResult | null> => {
    if (!storage || !profile) return null;
    const previousProgress = progressRef.current;
    const nextProgress = input.progress ?? previousProgress;
    setError(null);
    try {
      const result = await storage.commitLearningAction(profile.id, {
        ...input,
        progress: nextProgress,
        sessionId: activeSessionId.current
      }, previousProgress);
      applyProgress(nextProgress);
      setContentProgress(result.contentProgress);
      setReviewSummary(result.reviewSummary);
      setSessionSummary(result.sessionSummary);
      if (result.historyEntry) setHistory(current => [result.historyEntry!, ...current].slice(0, 80));
      if (result.exerciseResults?.length) {
        setExerciseResults((current) => [...result.exerciseResults!, ...current].slice(0, 300));
        if (content) {
          const persisted = skillProgressRef.current;
          const nextSkills = updateSkillProgressEntries(profile.id, content, persisted, result.exerciseResults);
          const changed = changedSkillProgressEntries(persisted, nextSkills);
          skillProgressRef.current = nextSkills;
          if (changed.length) await storage.upsertSkillProgress(profile.id, changed);
          setSkillProgress(nextSkills);
        }
      }
      if (result.reviewItems?.length) {
        setReviewItems((current) => {
          const byId = new Map(current.map((item) => [item.id, item]));
          for (const item of result.reviewItems ?? []) byId.set(item.id, item);
          return [...byId.values()].sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt));
        });
      }
      return result;
    } catch (cause) {
      setError(errorText(cause));
      throw cause;
    }
  }, [applyProgress, content, profile, storage]);

  const refresh = useCallback(async () => {
    if (!storage || !profile) return;
    await hydrate(storage, profile, content);
    await refreshProfiles(storage);
  }, [content, hydrate, profile, refreshProfiles, storage]);

  const exportBackup = useCallback(async (pin = '') => {
    if (!storage || !profile) return null;
    return storage.exportBackup(profile.id, pin);
  }, [profile, storage]);

  const importBackup = useCallback(async (backup: BackupPackage, options: ImportBackupOptions = {}) => {
    if (!storage) return;
    setBusy(true); setError(null);
    try {
      await endSession(storage, profileRef.current);
      const data = await storage.importBackup(backup, options);
      setProfile(data.profile); profileRef.current = data.profile; applyProgress(data.progress);
      await hydrate(storage, data.profile, content);
      const session = await storage.startSession(data.profile.id); activeSessionId.current = session.id;
      await refreshProfiles(storage);
    } catch (cause) { setError(errorText(cause)); throw cause; } finally { setBusy(false); }
  }, [applyProgress, content, endSession, hydrate, refreshProfiles, storage]);

  const reset = useCallback(async (scope: ResetScope) => {
    if (!storage || !profile) return;
    const data = await storage.resetLearningData(profile.id, scope);
    applyProgress(data.progress);
    await hydrate(storage, data.profile, content);
  }, [applyProgress, content, hydrate, profile, storage]);

  const deleteCurrentProfile = useCallback(async (pin = '') => {
    if (!storage || !profile) return;
    await endSession(storage, profile);
    await storage.deleteProfile(profile.id, pin);
    setProfile(null);
    profileRef.current = null;
    applyProgress(createDefaultProgress());
    setContentProgress([]);
    setReviewItems([]);
    setReviewSummary(EMPTY_REVIEW);
    setHistory([]);
    setExerciseResults([]);
    skillProgressRef.current = [];
    setSkillProgress([]);
    setSessionSummary(EMPTY_SESSION);
    setUserAnnotations([]);
    await refreshProfiles(storage);
  }, [applyProgress, endSession, profile, refreshProfiles, storage]);

  const switchProfile = useCallback(() => {
    void endSession(storage, profileRef.current);
    setProfile(null);
    profileRef.current = null;
    setHydrated(false);
  }, [endSession, storage]);

  const ensureVocabularyDetails = useCallback(() => queueContentHydration(
    (current) => hydrateLearningContentVocabularyDetails(current)
  ), [queueContentHydration]);

  const ensureSourceCatalog = useCallback(() => queueContentHydration(
    (current) => hydrateLearningContentSourceCatalog(current)
  ), [queueContentHydration]);

  const ensureSources = useCallback((sourceId?: string) => queueContentHydration(
    (current) => hydrateLearningContentSources(current, {}, sourceId)
  ), [queueContentHydration]);

  const ensureIslamicTrack = useCallback((track?: Exclude<CourseTrack, 'fusha' | 'quran'>) => queueContentHydration(
    (current) => hydrateLearningContentIslamic(current, {}, track)
  ), [queueContentHydration]);

  const ensureQuranReader = useCallback((surahs: readonly number[] = []) => queueContentHydration(async (current) => {
    const changed = await hydrateLearningContentQuranReader(current, {}, surahs);
    return changed ? { ...current } : current;
  }), [queueContentHydration]);

  const upsertAnnotation = useCallback(async (input: UserAnnotationInput): Promise<UserAnnotation | null> => {
    if (!storage || !profile) return null;
    const entry = await storage.upsertUserAnnotation(profile.id, input);
    setUserAnnotations(current => [entry, ...current.filter(item => !(item.entityType === entry.entityType && item.entityId === entry.entityId && item.annotationType === entry.annotationType))]);
    return entry;
  }, [profile, storage]);

  const deleteAnnotation = useCallback(async (entityType: UserAnnotationEntityType, entityId: string, annotationType: UserAnnotationType) => {
    if (!storage || !profile) return;
    await storage.deleteUserAnnotation(profile.id, entityType, entityId, annotationType);
    setUserAnnotations(current => current.filter(item => !(item.entityType === entityType && item.entityId === entityId && item.annotationType === annotationType)));
  }, [profile, storage]);

  const contentReady = content !== null;
  const runtimeValue = useMemo<AppRuntimeContextValue>(() => ({
    ready, hydrated, busy, error, storageMode: storage?.mode ?? null, contentReady
  }), [ready, hydrated, busy, error, storage, contentReady]);
  const contentValue = useMemo<AppContentContextValue>(() => ({
    content, ensureVocabularyDetails, ensureSourceCatalog, ensureSources, ensureIslamicTrack, ensureQuranReader
  }), [content, ensureVocabularyDetails, ensureSourceCatalog, ensureSources, ensureIslamicTrack, ensureQuranReader]);
  const profileValue = useMemo<AppProfileContextValue>(() => ({
    profiles, profile, createProfile, openProfile, switchProfile, exportBackup, importBackup, reset, deleteCurrentProfile
  }), [profiles, profile, createProfile, openProfile, switchProfile, exportBackup, importBackup, reset, deleteCurrentProfile]);
  const preferencesValue = useMemo<AppPreferencesContextValue>(() => ({
    preferences: progress.preferences, patchPreferences
  }), [progress.preferences, patchPreferences]);
  const progressActionsValue = useMemo<AppProgressActionsContextValue>(() => ({
    saveProgress, patchProgress
  }), [saveProgress, patchProgress]);
  const progressValue = useMemo<AppProgressContextValue>(() => ({
    progress, saveProgress, patchProgress
  }), [progress, saveProgress, patchProgress]);
  const learningSummaryValue = useMemo<AppLearningSummaryContextValue>(() => ({
    reviewSummary, sessionSummary
  }), [reviewSummary, sessionSummary]);
  const learningValue = useMemo<AppLearningContextValue>(() => ({
    contentProgress, reviewSummary, reviewItems, history, exerciseResults, skillProgress, sessionSummary, commit, refresh
  }), [contentProgress, reviewSummary, reviewItems, history, exerciseResults, skillProgress, sessionSummary, commit, refresh]);
  const annotationValue = useMemo<AppAnnotationContextValue>(() => ({
    userAnnotations, upsertAnnotation, deleteAnnotation
  }), [userAnnotations, upsertAnnotation, deleteAnnotation]);

  return (
    <AppRuntimeContext.Provider value={runtimeValue}>
      <AppContentContext.Provider value={contentValue}>
        <AppProfileContext.Provider value={profileValue}>
          <AppPreferencesContext.Provider value={preferencesValue}>
            <AppProgressActionsContext.Provider value={progressActionsValue}>
              <AppProgressContext.Provider value={progressValue}>
                <AppLearningSummaryContext.Provider value={learningSummaryValue}>
                  <AppLearningContext.Provider value={learningValue}>
                    <AppAnnotationContext.Provider value={annotationValue}>{children}</AppAnnotationContext.Provider>
                  </AppLearningContext.Provider>
                </AppLearningSummaryContext.Provider>
              </AppProgressContext.Provider>
            </AppProgressActionsContext.Provider>
          </AppPreferencesContext.Provider>
        </AppProfileContext.Provider>
      </AppContentContext.Provider>
    </AppRuntimeContext.Provider>
  );
}

function useRequiredContext<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`${name} muss innerhalb AppProvider verwendet werden.`);
  return value;
}

export function useAppRuntime(): AppRuntimeContextValue {
  return useRequiredContext(useContext(AppRuntimeContext), 'useAppRuntime');
}
export function useAppContent(): AppContentContextValue {
  return useRequiredContext(useContext(AppContentContext), 'useAppContent');
}
export function useAppProfile(): AppProfileContextValue {
  return useRequiredContext(useContext(AppProfileContext), 'useAppProfile');
}
export function useAppPreferences(): AppPreferencesContextValue {
  return useRequiredContext(useContext(AppPreferencesContext), 'useAppPreferences');
}
export function useAppProgressActions(): AppProgressActionsContextValue {
  return useRequiredContext(useContext(AppProgressActionsContext), 'useAppProgressActions');
}
export function useAppProgress(): AppProgressContextValue {
  return useRequiredContext(useContext(AppProgressContext), 'useAppProgress');
}
export function useAppLearningSummary(): AppLearningSummaryContextValue {
  return useRequiredContext(useContext(AppLearningSummaryContext), 'useAppLearningSummary');
}
export function useAppLearning(): AppLearningContextValue {
  return useRequiredContext(useContext(AppLearningContext), 'useAppLearning');
}
export function useAppAnnotations(): AppAnnotationContextValue {
  return useRequiredContext(useContext(AppAnnotationContext), 'useAppAnnotations');
}

/** Compatibility adapter for external consumers; internal components use focused hooks. */
export function useApp(): AppContextValue {
  return {
    ...useAppRuntime(),
    ...useAppContent(),
    ...useAppProfile(),
    ...useAppProgress(),
    ...useAppLearning(),
    ...useAppAnnotations()
  };
}
