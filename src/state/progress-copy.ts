import type { ProgressState } from '../types/app-models';

export type ProgressBranch =
  | 'completedLessons'
  | 'sessions'
  | 'journeyStates'
  | 'quranReaderState'
  | 'hifzStudyState'
  | 'quranHifzEntries'
  | 'quranHifzWordEntries'
  | 'library'
  | 'impulses'
  | 'dailyChallenge'
  | 'moduleProgress'
  | 'preferences'
  | 'all';

function cloneAll(current: ProgressState): ProgressState {
  return structuredClone(current);
}

export function cloneProgressForUpdate(
  current: ProgressState,
  branches: readonly ProgressBranch[] = ['all']
): ProgressState {
  if (branches.includes('all')) return cloneAll(current);

  const next: ProgressState = { ...current };
  const requested = new Set(branches);

  if (requested.has('completedLessons')) next.completedLessons = [...current.completedLessons];
  if (requested.has('sessions')) {
    next.activeExerciseSession = current.activeExerciseSession ? structuredClone(current.activeExerciseSession) : null;
    next.activeModuleExam = current.activeModuleExam ? structuredClone(current.activeModuleExam) : null;
  }
  if (requested.has('journeyStates')) {
    next.journeyStates = Object.fromEntries(
      Object.entries(current.journeyStates).map(([key, value]) => [key, value ? { ...value } : value])
    ) as ProgressState['journeyStates'];
  }
  if (requested.has('quranReaderState')) next.quranReaderState = { ...current.quranReaderState };
  if (requested.has('hifzStudyState')) next.hifzStudyState = { ...current.hifzStudyState, selection: [...current.hifzStudyState.selection] };
  if (requested.has('quranHifzEntries')) next.quranHifzEntries = current.quranHifzEntries.map((entry) => ({ ...entry }));
  if (requested.has('quranHifzWordEntries')) next.quranHifzWordEntries = current.quranHifzWordEntries.map((entry) => ({ ...entry }));
  if (requested.has('library')) {
    next.libraryFavorites = [...current.libraryFavorites];
    next.libraryRecent = [...current.libraryRecent];
  }
  if (requested.has('impulses')) {
    next.impulseRecentIds = [...current.impulseRecentIds];
    next.impulseFavoriteIds = [...current.impulseFavoriteIds];
  }
  if (requested.has('dailyChallenge')) next.dailyChallenge = current.dailyChallenge ? structuredClone(current.dailyChallenge) : null;
  if (requested.has('moduleProgress')) next.moduleProgress = { ...current.moduleProgress };
  if (requested.has('preferences')) {
    next.preferences = {
      ...current.preferences,
      enabledTracks: [...current.preferences.enabledTracks],
      moduleHarakat: { ...current.preferences.moduleHarakat }
    };
  }
  return next;
}
