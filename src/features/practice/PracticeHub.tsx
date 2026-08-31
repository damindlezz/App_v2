'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ExerciseType, ExerciseVariant } from '../../types/models';
import { findCourseChapter, findCourseModule } from '../../shared/course-module';
import { buildCoursePathModel } from '../../shared/learning-path';
import {
  EXERCISE_DEFINITIONS,
  EXERCISE_TYPE_LABELS,
  isRegisteredExerciseType,
} from '../../shared/exercise-registry';
import { useAppContent, useAppLearning, useAppProgress } from '../../state/AppProvider';
import { Icon, type IconName } from '../../components/ui/Icon';
import { ROUTES, href } from '../../components/shell/routes';
import {
  buildActivityTasks,
  buildAyahTasks,
  buildChapterExamTasks,
  buildTasks,
  defaultVariant,
  findActivity,
  interactionLabel,
  isVariant,
  variantLabel,
} from './tasks';
import { courseHomeHref } from '../learn/course-route';
import { ExerciseRunner } from './ExerciseRunner';

interface Query {
  moduleId?: string;
  chapterId?: string;
  activityId?: string;
  type?: string;
  variant?: string;
  challengeId?: string;
  reference?: string;
  mode?: string;
  interaction?: string;
}

type AyahInteraction = 'listening' | 'cloze' | 'order' | 'matching' | 'dictation';

export function PracticeHub() {
  const {
    content,
    ensureVocabularyDetails,
    ensureIslamicTrack,
    ensureQuranReader,
  } = useAppContent();
  const { progress } = useAppProgress();
  const { contentProgress, reviewSummary } = useAppLearning();
  const router = useRouter();
  const [query, setQuery] = useState<Query>({});

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setQuery({
      moduleId: params.get('module') ?? undefined,
      chapterId: params.get('chapter') ?? undefined,
      activityId: params.get('activity') ?? undefined,
      type: params.get('type') ?? undefined,
      variant: params.get('variant') ?? undefined,
      challengeId: params.get('challenge') ?? undefined,
      reference: params.get('ref') ?? undefined,
      mode: params.get('mode') ?? undefined,
      interaction: params.get('interaction') ?? undefined,
    });
  }, []);

  const type = query.type && isRegisteredExerciseType(query.type) ? query.type : null;
  const variant = isVariant(query.variant) ? query.variant : null;
  const challenge =
    query.challengeId && progress.dailyChallenge?.id === query.challengeId
      ? progress.dailyChallenge
      : null;
  const record = content && query.moduleId ? findCourseModule(content, query.moduleId) : null;
  const chapter = content && query.chapterId ? findCourseChapter(content, query.chapterId) : null;
  const activityContext = useMemo(
    () => (record && query.activityId ? findActivity(record.unit, query.activityId) : null),
    [record, query.activityId],
  );

  useEffect(() => {
    if (query.mode !== 'ayah' || !query.reference) return;
    const surah = Number(query.reference.split(':')[0]);
    if (Number.isFinite(surah)) void ensureQuranReader([surah]).catch(() => undefined);
  }, [ensureQuranReader, query.mode, query.reference]);

  useEffect(() => {
    if ((query.moduleId && !record) || (query.chapterId && !chapter)) {
      void ensureIslamicTrack().catch(() => undefined);
    }
  }, [chapter, ensureIslamicTrack, query.chapterId, query.moduleId, record]);

  useEffect(() => {
    const track = challenge?.track;
    if (type === 'knowledge' && !track) {
      void ensureIslamicTrack().catch(() => undefined);
    } else if (track && track !== 'fusha' && track !== 'quran') {
      void ensureIslamicTrack(track).catch(() => undefined);
    }
  }, [challenge?.track, ensureIslamicTrack, type]);

  useEffect(() => {
    if (variant === 'morphology_root' || variant === 'register_shift') {
      void ensureVocabularyDetails().catch(() => undefined);
    }
  }, [ensureVocabularyDetails, variant]);

  if (!content) return null;

  if (query.mode === 'ayah' && query.reference) {
    const interaction = validAyahInteraction(query.interaction) ? query.interaction : 'order';
    const ayahTasks = buildAyahTasks(content, query.reference, interaction);
    if (!ayahTasks.length) {
      return (
        <Empty
          title="Quran-Daten werden geladen"
          text="Die Ayah wird fuer die interaktive Uebung vorbereitet."
        />
      );
    }
    return (
      <ExerciseRunner
        key={`ayah:${query.reference}:${interaction}`}
        title={`${query.reference} - ${interactionLabelForAyah(interaction)}`}
        tasks={ayahTasks}
      />
    );
  }

  if (query.challengeId && !challenge) {
    return (
      <Empty
        title="Tagesaufgabe nicht verfuegbar"
        text="Die gespeicherte Challenge gehoert nicht mehr zum aktuellen Tag."
        onClick={() => router.push(ROUTES.today)}
      />
    );
  }

  if (query.chapterId && !chapter) {
    return (
      <Empty
        title="Kapitelpruefung wird geladen"
        text="Der benoetigte Lernpfad wird nachgeladen."
      />
    );
  }

  if (chapter) {
    const model = buildCoursePathModel(
      content,
      progress,
      contentProgress,
      reviewSummary,
      chapter.track,
    );
    const state = model.chapters.find(item => item.chapter.id === chapter.id);
    if (!state?.examReady && !state?.examPassed) {
      return (
        <Empty
          title="Kapitelpruefung noch gesperrt"
          text="Schliesse zuerst alle Modulpruefungen dieses Kapitels ab."
          onClick={() => router.push(courseHomeHref(chapter.track))}
        />
      );
    }

    return (
      <ExerciseRunner
        key={`chapter:${chapter.id}`}
        title={chapter.exam.title}
        tasks={buildChapterExamTasks(content, chapter)}
        chapterId={chapter.id}
        chapterPassScore={chapter.exam.passScore}
        returnHref={courseHomeHref(chapter.track)}
      />
    );
  }

  if (query.moduleId && (!record || !activityContext)) {
    return <Empty title="Uebung wird geladen" text="Der benoetigte Lernpfad wird nachgeladen." />;
  }

  if (!query.moduleId && !type && !challenge) return <PracticePicker />;
  if (!query.moduleId && type && !variant && !challenge) return <VariantPicker type={type} />;

  const exerciseType: ExerciseType =
    activityContext?.activity.exerciseType ?? challenge?.sequence[0]?.type ?? type ?? 'knowledge';
  const exerciseVariant =
    activityContext?.activity.exerciseVariant ??
    challenge?.sequence[0]?.variant ??
    variant ??
    defaultVariant(exerciseType);
  const tasks = challenge
    ? challenge.sequence.flatMap(step =>
        buildTasks(
          content,
          step.type,
          step.variant,
          new Set(step.contentIds),
          Math.max(1, step.contentIds.length),
          progress.preferences.currentLevel,
        ),
      )
    : query.moduleId && record && activityContext
      ? buildActivityTasks(
          content,
          record.unit,
          activityContext.activity,
          activityContext.phaseType,
          exerciseVariant,
        )
      : buildTasks(
          content,
          exerciseType,
          exerciseVariant,
          undefined,
          10,
          progress.preferences.currentLevel,
        );
  const title =
    challenge?.title ??
    activityContext?.activity.title ??
    `${EXERCISE_TYPE_LABELS[exerciseType]} · ${variantLabel(exerciseVariant)}`;

  return (
    <ExerciseRunner
      key={`${challenge?.id ?? query.moduleId ?? exerciseType}:${query.activityId ?? exerciseVariant}`}
      title={title}
      tasks={tasks}
      moduleId={query.moduleId}
      activity={activityContext?.activity}
      phaseType={activityContext?.phaseType}
      phaseId={activityContext?.phaseId}
      challengeId={challenge?.id}
    />
  );
}

function PracticePicker() {
  const { reviewSummary } = useAppLearning();
  const router = useRouter();
  const types = [
    ...new Set(
      EXERCISE_DEFINITIONS.filter(item => !item.contentDomains.includes('courseModule')).map(
        item => item.type,
      ),
    ),
  ];
  const featured: Array<{
    variant: ExerciseVariant;
    icon: IconName;
    label: string;
  }> = [
    { variant: 'vocabulary_listening', icon: 'headphones', label: 'Hörtraining' },
    { variant: 'grammar_cloze', icon: 'gap', label: 'Lückentext' },
    { variant: 'sentence_builder', icon: 'drag', label: 'Satzbau' },
    { variant: 'vocabulary_matching', icon: 'matching', label: 'Zuordnen' },
    { variant: 'speaking_shadowing', icon: 'microphone', label: 'Shadowing' },
    { variant: 'writing_trace', icon: 'pen', label: 'Nachspuren' },
    { variant: 'quran_tajweed', icon: 'book', label: 'Taǧwīd' },
    { variant: 'reading_harakat', icon: 'sparkles', label: 'Ḥarakāt' },
  ];

  return (
    <div className="study-tool-workspace">
      <main className="study-tool-main">
        <div className="standard-page practice-hub">
          <div className="page-title">
            <span>Practice Hub</span>
            <h1>Interaktiv üben</h1>
            <p>Alle Übungsengines bleiben erhalten: Hören, Sprechen, Schreiben, Zuordnen, Lücken, Satzbau, Quran und adaptive Mischungen.</p>
          </div>
          <div className="practice-featured">
            {featured.map(item => (
              <button
                key={item.variant}
                onClick={() =>
                  router.push(href(ROUTES.practice, { type: typeFor(item.variant), variant: item.variant }))
                }
              >
                <Icon name={item.icon} size={22} />
                <strong>{item.label}</strong>
                <span>{interactionLabel(item.variant)}</span>
              </button>
            ))}
          </div>
          {reviewSummary.dueNow > 0 && (
            <button className="review-callout" onClick={() => router.push(ROUTES.review)}>
              <Icon name="repeat" size={20} />
              <div>
                <strong>{reviewSummary.dueNow} Wiederholungen fällig</strong>
                <span>Spaced Repetition zuerst erledigen</span>
              </div>
              <Icon name="arrow" size={18} />
            </button>
          )}
          <h2 className="section-heading">Alle Bereiche</h2>
          <div className="practice-catalog">
            {types.map(itemType => (
              <button
                key={itemType}
                onClick={() => router.push(href(ROUTES.practice, { type: itemType }))}
              >
                <span className="practice-letter">{EXERCISE_TYPE_LABELS[itemType].slice(0, 1)}</span>
                <div>
                  <strong>{EXERCISE_TYPE_LABELS[itemType]}</strong>
                  <small>
                    {EXERCISE_DEFINITIONS.filter(definition => definition.type === itemType).length}{' '}
                    Varianten
                  </small>
                </div>
                <Icon name="chevron" size={17} />
              </button>
            ))}
          </div>
          <button
            className="smart-mix"
            onClick={() =>
              router.push(href(ROUTES.practice, { type: 'vocabulary', variant: 'smart_mix' }))
            }
          >
            <Icon name="sparkles" size={22} />
            <div>
              <strong>Interaktiver Mix</strong>
              <span>Matching, Lückentext, Satzbau, Eingabe, Schreiben und Quran gemischt.</span>
            </div>
            <Icon name="arrow" size={18} />
          </button>
        </div>
      </main>
    </div>
  );
}

function VariantPicker({ type }: { type: ExerciseType }) {
  const router = useRouter();
  const variants = EXERCISE_DEFINITIONS.filter(item => item.type === type);

  return (
    <div className="study-tool-workspace">
      <main className="study-tool-main">
        <div className="standard-page">
          <div className="page-title">
            <span>{EXERCISE_TYPE_LABELS[type]}</span>
            <h1>Übungsart wählen</h1>
            <p>Jede Variante verwendet die für das Lernziel passende Interaktion.</p>
          </div>
          <div className="variant-catalog">
            {variants.map(item => (
              <button
                key={item.variant}
                onClick={() => router.push(href(ROUTES.practice, { type, variant: item.variant }))}
              >
                <span>
                  <Icon name={iconForInteraction(interactionLabel(item.variant))} size={21} />
                </span>
                <div>
                  <strong>{variantLabel(item.variant)}</strong>
                  <small>{item.skill}</small>
                  <em>
                    {interactionLabel(item.variant)} · {item.allowedInput.join(' / ')}
                  </em>
                </div>
                <Icon name="arrow" size={17} />
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function Empty({
  title,
  text,
  onClick,
}: {
  title: string;
  text: string;
  onClick?: () => void;
}) {
  return (
    <div className="empty-focus">
      <Icon name="warning" size={32} />
      <h1>{title}</h1>
      <p>{text}</p>
      {onClick && (
        <button className="button button--primary" onClick={onClick}>
          Heute
        </button>
      )}
    </div>
  );
}

function typeFor(variant: string): ExerciseType {
  return EXERCISE_DEFINITIONS.find(item => item.variant === variant)?.type ?? 'vocabulary';
}

function iconForInteraction(label: string) {
  if (label.includes('Drag')) return 'drag' as const;
  if (label.includes('Lücke')) return 'gap' as const;
  if (label.includes('Zuordnen')) return 'matching' as const;
  if (label.includes('Audio')) return 'microphone' as const;
  if (label.includes('Zeichnen')) return 'pen' as const;
  return 'grid' as const;
}

function validAyahInteraction(value?: string): value is AyahInteraction {
  return ['listening', 'cloze', 'order', 'matching', 'dictation'].includes(value ?? '');
}

function interactionLabelForAyah(value: AyahInteraction) {
  return {
    listening: 'Zuhoeren',
    cloze: 'Lueckentext',
    order: 'Drag & Drop',
    matching: 'Wort-Matching',
    dictation: 'Diktat',
  }[value];
}
