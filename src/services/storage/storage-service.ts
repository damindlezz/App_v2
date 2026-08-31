import type {
  BackupPackage,
  ContentProgressEntry,
  CreateProfileInput,
  ExerciseResultEntry,
  ImportBackupOptions,
  LearningHistoryEntry,
  LearningHistoryInput,
  LearningSession,
  LearningTransactionInput,
  LearningTransactionResult,
  ProfileData,
  ProfileSummary,
  ProgressState,
  ResetScope,
  ReviewItem,
  ReviewSummary,
  SessionSummary,
  SkillProgressEntry,
  UserAnnotation,
  UserAnnotationInput,
  UserAnnotationEntityType,
  UserAnnotationType
} from '../../types/models';

export interface StorageService {
  readonly mode: 'tauri-sqlite' | 'browser-indexeddb';
  initialize(): Promise<void>;
  listProfiles(): Promise<ProfileSummary[]>;
  createProfile(input: CreateProfileInput): Promise<ProfileData>;
  openProfile(profileId: string, pin?: string): Promise<ProfileData>;
  saveProgress(profileId: string, progress: ProgressState, previousProgress?: ProgressState): Promise<void>;
  deleteProfile(profileId: string, pin?: string): Promise<void>;

  commitLearningAction(profileId: string, input: LearningTransactionInput, previousProgress?: ProgressState): Promise<LearningTransactionResult>;
  listContentProgress(profileId: string): Promise<ContentProgressEntry[]>;
  listSkillProgress(profileId: string): Promise<SkillProgressEntry[]>;
  syncSkillProgress(profileId: string, entries: SkillProgressEntry[]): Promise<void>;
  upsertSkillProgress(profileId: string, entries: SkillProgressEntry[]): Promise<void>;
  listUserAnnotations(profileId: string): Promise<UserAnnotation[]>;
  upsertUserAnnotation(profileId: string, input: UserAnnotationInput): Promise<UserAnnotation>;
  deleteUserAnnotation(profileId: string, entityType: UserAnnotationEntityType, entityId: string, annotationType: UserAnnotationType): Promise<void>;
  recordHistory(profileId: string, input: LearningHistoryInput): Promise<LearningHistoryEntry>;
  listHistory(profileId: string, limit?: number): Promise<LearningHistoryEntry[]>;
  listDueReviews(profileId: string, limit?: number): Promise<ReviewItem[]>;
  listAllReviews(profileId: string): Promise<ReviewItem[]>;
  getReviewSummary(profileId: string): Promise<ReviewSummary>;
  listExerciseResults(profileId: string, limit?: number): Promise<ExerciseResultEntry[]>;

  startSession(profileId: string): Promise<LearningSession>;
  touchSession(profileId: string, sessionId: string, activityDelta?: number): Promise<SessionSummary>;
  endSession(profileId: string, sessionId: string): Promise<SessionSummary>;
  getSessionSummary(profileId: string): Promise<SessionSummary>;
  listSessions(profileId: string): Promise<LearningSession[]>;

  exportBackup(profileId: string, pin?: string): Promise<BackupPackage>;
  importBackup(backup: BackupPackage, options?: ImportBackupOptions): Promise<ProfileData>;
  resetLearningData(profileId: string, scope: ResetScope): Promise<ProfileData>;
}
