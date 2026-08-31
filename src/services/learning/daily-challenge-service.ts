import { createAdaptiveSessionPlan } from './adaptive-session-planner';
import { buildCoursePathStates, recommendedLearningUnit } from '../../shared/learning-path';
import { enabledCourseTracks, isIslamicStudyTrack } from '../../shared/course-track-meta';
import { journeyStateFor, mostRecentJourneyTrack } from '../../shared/study-journey';
import { isDue } from '../review/review-scheduler';
import type {
  AdaptivePlanBucket,
  AdaptivePlanItem,
  CourseTrack,
  DailyChallengeState,
  ExerciseResultEntry,
  ExerciseSequenceStep,
  LearningContent,
  ContentProgressEntry,
  ProgressState,
  ReviewItem
} from '../../types/models';

const BUCKET_PRIORITY: AdaptivePlanBucket[] = ['weakness', 'due', 'current', 'interleaving', 'transfer'];

const FOCUS_LABELS: Record<string, string> = {
  vocabulary: 'Wortschatz',
  alphabet: 'Alphabet',
  grammar: 'Grammatik',
  sentence: 'Wortstellung',
  reading: 'Lesen',
  writing: 'Schreiben',
  quran: 'Quran und Tajwid',
  knowledge: 'Fachwissen',
  speaking: 'Sprechen'
};

const BUCKET_LABELS: Record<AdaptivePlanBucket, string> = {
  weakness: 'Aktuelle Schw\u00e4che',
  due: 'F\u00e4llige Wiederholung',
  current: 'Aktuelles Modul',
  interleaving: 'Altwissen',
  transfer: 'Transfer'
};

export function dailyChallengeDayKey(reference = new Date()): string {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, '0');
  const day = String(reference.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function titleFor(bucket: AdaptivePlanBucket, focus: string): string {
  if (bucket === 'weakness') return `${focus}-Fokus`;
  if (bucket === 'due') return 'Wiederholungs-Sprint';
  if (bucket === 'interleaving') return 'Altwissen auffrischen';
  if (bucket === 'transfer') return 'Transfer-Challenge';
  return `${focus}-Mini-Challenge`;
}

function descriptionFor(type: AdaptivePlanItem['exerciseType'], count: number): string {
  if (type === 'vocabulary') return `Ordne ${Math.max(2, count)} bekannte W\u00f6rter ihren Bedeutungen zu.`;
  if (type === 'alphabet') return `Erkenne ${count} Buchstaben oder Buchstabenformen sicher.`;
  if (type === 'grammar') return `L\u00f6se ${count} kurze Grammatikfrage${count === 1 ? '' : 'n'} aus bereits eingef\u00fchrten Inhalten.`;
  if (type === 'sentence') return `Bringe ${count} bekannte Satzstruktur${count === 1 ? '' : 'en'} in die richtige Reihenfolge.`;
  if (type === 'reading') return `Lies ${count} kurze Einheit${count === 1 ? '' : 'en'} und erkenne Bedeutung oder Vokalisierung.`;
  if (type === 'writing') return `Schreibe ${count} bereits eingef\u00fchrte Form${count === 1 ? '' : 'en'} aktiv aus dem Ged\u00e4chtnis.`;
  return `Bearbeite ${count} kurze Quran-Leseaufgabe${count === 1 ? '' : 'n'} aus freigeschalteten Inhalten.`;
}

function chooseFocusItems(items: AdaptivePlanItem[]): { bucket: AdaptivePlanBucket; items: AdaptivePlanItem[] } | null {
  const bucket = BUCKET_PRIORITY.find((candidate) => items.some((item) => item.bucket === candidate));
  if (!bucket) return null;
  const first = items.find((item) => item.bucket === bucket);
  if (!first) return null;
  const sameFocus = items.filter((item) => item.module === first.module && item.exerciseType === first.exerciseType);
  const preferred = sameFocus.filter((item) => item.bucket === bucket);
  const combined = [...preferred, ...sameFocus.filter((item) => item.bucket !== bucket)];
  const seen = new Set<string>();
  const unique = combined.filter((item) => seen.has(item.contentId) ? false : (seen.add(item.contentId), true));
  const limit = first.exerciseType === 'vocabulary' ? 6 : 4;
  return { bucket, items: unique.slice(0, limit) };
}

function sequenceFor(items: AdaptivePlanItem[], title: string): ExerciseSequenceStep[] {
  if (!items.length) return [];
  const first = items[0]!;
  if (first.exerciseType === 'vocabulary') {
    return [{
      type: first.exerciseType,
      variant: first.exerciseVariant,
      contentIds: items.map((item) => item.contentId),
      activityId: `daily-${first.module}`,
      activityTitle: `Aufgabe des Tages \u00b7 ${title}`,
      minimumScore: 70
    }];
  }
  return items.map((item, index) => ({
    type: item.exerciseType,
    variant: item.exerciseVariant,
    contentIds: [item.contentId],
    activityId: `daily-${item.module}-${index + 1}`,
    activityTitle: `Aufgabe des Tages \u00b7 ${title}`,
    minimumScore: 70
  }));
}

function buildForTrack(
  profileId: string,
  track: CourseTrack,
  content: LearningContent,
  progress: ProgressState,
  contentProgress: ContentProgressEntry[],
  reviewItems: ReviewItem[],
  exerciseResults: ExerciseResultEntry[],
  reference: Date
): DailyChallengeState | null {
  const plan = createAdaptiveSessionPlan(content, progress, contentProgress, reviewItems, exerciseResults, 20, track, reference);
  const focus = chooseFocusItems(plan.items);
  if (!focus?.items.length) return null;
  const type = focus.items[0]!.exerciseType;
  const focusLabel = FOCUS_LABELS[type] ?? 'Lernfokus';
  const title = titleFor(focus.bucket, focusLabel);
  const sequence = sequenceFor(focus.items, title);
  if (!sequence.length) return null;
  const date = dailyChallengeDayKey(reference);
  return {
    id: `daily-${date}-${profileId.slice(0, 8)}-${track}-${type}`,
    date,
    track,
    title,
    description: descriptionFor(type, focus.items.length),
    focusLabel,
    reasonLabel: BUCKET_LABELS[focus.bucket],
    itemCount: focus.items.length,
    estimatedMinutes: Math.max(3, Math.min(6, Math.ceil(focus.items.length * 0.9))),
    sequence,
    status: 'available',
    score: null,
    completedAt: null
  };
}


function buildIslamicChallenge(
  profileId: string,
  track: CourseTrack,
  content: LearningContent,
  progress: ProgressState,
  contentProgress: ContentProgressEntry[],
  reviewItems: ReviewItem[],
  reference: Date
): DailyChallengeState | null {
  if (!isIslamicStudyTrack(track)) return null;
  const reviewSummary = {
    dueNow: reviewItems.filter((item) => isDue(item, reference)).length,
    dueToday: reviewItems.length, total: reviewItems.length, mastered: reviewItems.filter((item) => item.mastery >= 80).length
  };
  const states = buildCoursePathStates(content, progress, contentProgress, reviewSummary, track);
  const currentModuleId = journeyStateFor(progress, track)?.currentModuleId;
  const current = states.find((state) => state.unit.id === currentModuleId && state.status !== 'locked');
  const recommended = current ?? recommendedLearningUnit(states) ?? states.find((state) => state.status !== 'locked');
  if (!recommended?.unit.knowledgeQuestions?.length) return null;
  const questions = recommended.unit.knowledgeQuestions.slice(0, 4);
  const variant = (track === 'hadith' || track === 'usul_hadith') ? 'hadith_analysis' : track.startsWith('fiqh_') && ['S2','S3'].includes(recommended.chapter.studyLevel ?? '') ? 'fiqh_compare' : 'knowledge_quiz';
  const date = dailyChallengeDayKey(reference);
  return {
    id: `daily-${date}-${profileId.slice(0, 8)}-${track}-knowledge`, date, track,
    title: track.startsWith('fiqh_') ? 'Fiqh-Wissensfokus' : track === 'hadith' ? 'Ḥadīṯ-Labor des Tages' : track === 'usul_hadith' ? 'Uṣūl-al-Ḥadīṯ-Labor' : 'Uṣūl-al-Fiqh-Fokus',
    description: `Bearbeite ${questions.length} kurze Wissens- und Anwendungsfragen aus ${recommended.unit.title}.`,
    focusLabel: 'Fachwissen', reasonLabel: 'Aktiver Lernpfad', itemCount: questions.length, estimatedMinutes: Math.max(3, questions.length),
    sequence: questions.map((question, index) => ({ type: 'knowledge', variant, contentIds: [question.id], activityId: `daily-${track}-knowledge-${index + 1}`, activityTitle: `Aufgabe des Tages · ${recommended.unit.title}`, minimumScore: 70 })),
    status: 'available', score: null, completedAt: null
  };
}

export function createDailyChallenge(
  profileId: string,
  content: LearningContent,
  progress: ProgressState,
  contentProgress: ContentProgressEntry[],
  reviewItems: ReviewItem[] = [],
  exerciseResults: ExerciseResultEntry[] = [],
  reference = new Date()
): DailyChallengeState | null {
  const enabled = enabledCourseTracks(progress.preferences.enabledTracks);
  const recentTrack = mostRecentJourneyTrack(progress, enabled);
  const ordered = [recentTrack, ...enabled].filter((track, index, all): track is CourseTrack => Boolean(track) && enabled.includes(track as CourseTrack) && all.indexOf(track) === index);
  for (const track of ordered) {
    const challenge = isIslamicStudyTrack(track)
      ? buildIslamicChallenge(profileId, track, content, progress, contentProgress, reviewItems, reference)
      : buildForTrack(profileId, track, content, progress, contentProgress, reviewItems, exerciseResults, reference);
    if (challenge) return challenge;
  }
  return null;
}
