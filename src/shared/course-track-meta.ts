import type { CourseTrack, PageId, ProgressState } from '../types/models';

export type IslamicStudyTrack = Exclude<CourseTrack, 'fusha' | 'quran'>;

export const FIQH_STUDY_TRACKS = ['fiqh_hanafi', 'fiqh_maliki', 'fiqh_shafii', 'fiqh_hanbali'] as const satisfies readonly IslamicStudyTrack[];

export const ISLAMIC_STUDY_TRACKS: readonly IslamicStudyTrack[] = [
  ...FIQH_STUDY_TRACKS, 'usul_fiqh', 'hadith', 'usul_hadith'
];

export const COURSE_TRACKS: readonly CourseTrack[] = ['fusha', 'quran', ...ISLAMIC_STUDY_TRACKS];

export function isCourseTrack(value: unknown): value is CourseTrack {
  return typeof value === 'string' && (COURSE_TRACKS as readonly string[]).includes(value);
}

export function isIslamicStudyTrack(track: CourseTrack): track is IslamicStudyTrack {
  return (ISLAMIC_STUDY_TRACKS as readonly CourseTrack[]).includes(track);
}

export const COURSE_TRACK_LABELS: Readonly<Record<CourseTrack, string>> = {
  fusha: 'Fusha',
  quran: 'Quran',
  fiqh_hanafi: 'Fiqh · Ḥanafī',
  fiqh_maliki: 'Fiqh · Mālikī',
  fiqh_shafii: 'Fiqh · Šāfiʿī',
  fiqh_hanbali: 'Fiqh · Ḥanbalī',
  usul_fiqh: 'Uṣūl al-Fiqh',
  hadith: 'Ḥadīṯ',
  usul_hadith: 'Uṣūl al-Ḥadīṯ'
};

export function courseTrackLabel(track: CourseTrack): string {
  return COURSE_TRACK_LABELS[track];
}

export function resetCoursePosition(progress: ProgressState, track: CourseTrack): void {
  progress.journeyStates[track] = {
    track,
    currentChapterId: null,
    currentModuleId: null,
    currentStepId: null,
    currentActivityId: null,
    updatedAt: new Date().toISOString()
  };
  progress.activeModuleExam = null;
  progress.activeExerciseSession = null;
}

export function courseRootPage(track: CourseTrack): PageId {
  if (track === 'quran') return 'quran';
  return isIslamicStudyTrack(track) ? 'islamicStudies' : 'learningPath';
}

export function courseRootLabel(track: CourseTrack): string {
  if (track === 'quran') return 'Quran';
  return isIslamicStudyTrack(track) ? 'Islamische Wissenschaften' : 'Arabisch-Lernpfad';
}


export type FiqhSchoolId = 'hanafi' | 'maliki' | 'shafii' | 'hanbali';

export function fiqhTrackForSchool(school: FiqhSchoolId): IslamicStudyTrack {
  return `fiqh_${school}` as IslamicStudyTrack;
}

export function enabledCourseTracks(tracks: CourseTrack[] = []): CourseTrack[] {
  const enabled = [...new Set(tracks.filter((track) => COURSE_TRACKS.includes(track)))];
  return enabled.length ? enabled : ['fusha'];
}

export function firstEnabledTrack(tracks: CourseTrack[], fallback: CourseTrack = 'fusha'): CourseTrack {
  return enabledCourseTracks(tracks)[0] ?? fallback;
}
