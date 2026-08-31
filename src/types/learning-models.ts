import type {
  ContentProgressEntry,
  CourseTrack,
  ExerciseResultEntry,
  ExerciseResultInput,
  ExerciseVariant,
  LearningHistoryEntry,
  LearningHistoryInput,
  LearningSession,
  NavigationContext,
  PageId,
  Profile,
  ProgressState,
  ReviewItem,
  ReviewResultInput,
  ReviewSummary,
  SessionSummary,
  SkillProgressEntry,
  UserAnnotation,
} from './app-models';
import type { LearningContent } from './content-models';
import type { ExerciseType } from './exercise-types';

export type MasteryDimension = 'recognition' | 'recall' | 'listening' | 'spelling' | 'production';
export type LearningErrorType = 'vocabulary' | 'grammar' | 'orthography' | 'listening' | 'word_order' | 'morphology' | 'pronunciation' | 'unknown';
export type AdaptivePlanBucket = 'due' | 'current' | 'weakness' | 'interleaving' | 'transfer';

export interface LearningItemMastery {
  key: string;
  module: PageId;
  contentId: string;
  dimensions: Record<MasteryDimension, number>;
  overall: number;
  stability: number;
  difficulty: number;
  evidenceCount: number;
  lastPracticedAt: string | null;
  dominantError: LearningErrorType | null;
  confidence: number;
  errorRate: number;
  responseTimeMs: number | null;
  forgettingRisk: number;
}

export interface AdaptivePlanItem {
  key: string;
  bucket: AdaptivePlanBucket;
  module: PageId;
  contentId: string;
  exerciseType: ExerciseType;
  exerciseVariant: ExerciseVariant;
  mastery: number;
  reason: string;
}

export interface AdaptiveSessionPlan {
  track: CourseTrack;
  generatedAt: string;
  totalItems: number;
  estimatedMinutes: number;
  allocations: Record<AdaptivePlanBucket, number>;
  items: AdaptivePlanItem[];
}

export interface ContentProgressUpdate {
  module: PageId;
  contentId: string;
  action?: 'attempt' | 'verify' | 'complete' | 'reopen' | 'practice';
  correct?: boolean;
  score?: number;
}

export interface LearningTransactionInput {
  progress: ProgressState;
  history?: LearningHistoryInput;
  reviews?: ReviewResultInput[];
  contentUpdates?: ContentProgressUpdate[];
  exerciseResults?: ExerciseResultInput[];
  sessionId?: string | null;
}

export interface LearningTransactionResult {
  contentProgress: ContentProgressEntry[];
  reviewSummary: ReviewSummary;
  sessionSummary: SessionSummary;
  historyEntry?: LearningHistoryEntry;
  reviewItems?: ReviewItem[];
  exerciseResults?: ExerciseResultEntry[];
}

export type ResetScope = 'markings' | 'learning' | 'all';

export interface BackupPackage {
  schemaVersion: 4;
  appVersion: string;
  exportedAt: string;
  profile: Profile;
  progress: ProgressState;
  contentProgress: ContentProgressEntry[];
  reviewItems: ReviewItem[];
  learningHistory: LearningHistoryEntry[];
  exerciseResults: ExerciseResultEntry[];
  learningSessions: LearningSession[];
  /** Optional for backward compatibility with v0.13 backups created before P2. */
  userAnnotations?: UserAnnotation[];
}

export interface ImportBackupOptions {
  pin?: string;
  name?: string;
}

export interface AppSnapshot {
  activePage: PageId;
  navigationContext: NavigationContext;
  profile: Profile | null;
  progress: ProgressState;
  content: LearningContent;
  contentProgress: ContentProgressEntry[];
  reviewSummary: ReviewSummary;
  reviewItems: ReviewItem[];
  exerciseResults: ExerciseResultEntry[];
  sessionSummary: SessionSummary;
  history: LearningHistoryEntry[];
  skillProgress: SkillProgressEntry[];
  userAnnotations: UserAnnotation[];
}
