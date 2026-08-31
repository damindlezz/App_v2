'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildCoursePathModel } from '../../shared/learning-path';
import { findCourseModule, nextCourseModule } from '../../shared/course-module';
import type { LearningActivityKnowledgeBlock, LearningContent, LearningContentBlock, LearningItemMastery, LearningStep } from '../../types/models';
import { useAppContent, useAppLearning, useAppProgress } from '../../state/AppProvider';
import { Icon } from '../../components/ui/Icon';
import { ArabicText, Transliteration } from '../../components/ui/ArabicText';
import { href, ROUTES } from '../../components/shell/routes';
import { courseHomeHref } from '../learn/course-route';
import { setJourneyPosition } from '../../shared/study-journey';
import { StudyLedgerHeader, StudyLedgerProgress, StudyLedgerShell } from '../study/StudyLedgerPrimitives';
import { StudyContextRail, type StudyContextState } from '../study/StudyContextRail';
import { buildMasteryIndex, masteryKey } from '../../services/learning/mastery-service';
import { evaluateLearningStepCompletion } from '../../services/learning/completion-policy';
import { cloneProgressForUpdate } from '../../state/progress-copy';

interface MicroCheck {
  prompt: string;
  arabic?: string;
  options: string[];
  correct: string;
  explanation: string;
}

export function ModulePage() {
  const { content, ensureIslamicTrack } = useAppContent();
const { progress, patchProgress } = useAppProgress();
const { contentProgress, reviewSummary, reviewItems, exerciseResults, skillProgress, commit } = useAppLearning();
  const router = useRouter();
  const [moduleId, setModuleId] = useState('');
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  useEffect(() => setModuleId(new URLSearchParams(location.search).get('id') ?? ''), []);
  const record = content && moduleId ? findCourseModule(content, moduleId) : null;
  useEffect(() => { if (content && moduleId && !record) void ensureIslamicTrack().catch(()=>undefined); }, [content, ensureIslamicTrack, moduleId, record]);

  const model = useMemo(() => content && record ? buildCoursePathModel(content, progress, contentProgress, reviewSummary, record.track) : null, [content, contentProgress, progress, record, reviewSummary]);
  const state = model?.modules.find((item) => item.unit.id === moduleId) ?? null;
  const chapterState = model?.chapters.find((item) => item.chapter.id === record?.chapter.id) ?? null;
  const storedStep = record ? progress.journeyStates[record.track]?.currentStepId : null;
  const initial = (storedStep && state?.learningSteps.some((step) => step.step.id === storedStep) ? storedStep : null)
    ?? state?.learningSteps.find((step) => step.status === 'in_progress' || step.status === 'available')?.step.id
    ?? state?.learningSteps[0]?.step.id
    ?? null;
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => setSelected(initial), [initial, moduleId]);
  useEffect(() => {
    if (!record || !selected || progress.journeyStates[record.track]?.currentStepId === selected) return;
    void patchProgress((draft) => {
      setJourneyPosition(draft, record.track, record.chapter.id, moduleId, selected, selected);
    }, ['journeyStates']);
  }, [moduleId, patchProgress, progress.journeyStates, record, selected]);

  const selectedState = state?.learningSteps.find((item) => item.step.id === selected) ?? state?.learningSteps[0] ?? null;
  const masteryIndex = useMemo(() => buildMasteryIndex(contentProgress, reviewItems, exerciseResults), [contentProgress, exerciseResults, reviewItems]);
  const snapshot = useMemo(() => masterySnapshotForStep(masteryIndex, selectedState?.step ?? null), [masteryIndex, selectedState]);
  const completionStartedAt = selectedState
    ? contentProgress.find((entry) => entry.module === 'courseModule' && entry.contentId === selectedState.step.id)?.firstStartedAt ?? null
    : null;
  const completion = useMemo(
    () => selectedState ? evaluateLearningStepCompletion(selectedState.step, exerciseResults, completionStartedAt) : null,
    [completionStartedAt, exerciseResults, selectedState]
  );
  const completionCommit = useRef<string | null>(null);

  useEffect(() => {
    if (!record || !selectedState || !completion?.complete || ['completed', 'mastered'].includes(selectedState.status)) return;
    const step = selectedState.step;
    if (completionCommit.current === step.id) return;
    completionCommit.current = step.id;
    const next = cloneProgressForUpdate(progress, ['journeyStates']);
    next.xp += 10;
    setJourneyPosition(next, record.track, record.chapter.id, moduleId, step.id, step.id);
    void commit({
      progress: next,
      contentUpdates: [{ module: 'courseModule', contentId: step.id, action: 'verify', correct: true, score: completion.averageScore ?? 100 }],
      history: {
        module: 'courseModule',
        activityType: 'lesson_completed',
        contentId: step.id,
        title: step.title,
        result: 'completed',
        xpDelta: 10,
        details: { evidence: 'completion_policy', evidenceCount: completion.successfulEvidenceCount, modes: completion.achievedModes }
      }
    }).finally(() => { completionCommit.current = null; });
  }, [commit, completion, moduleId, progress, record, selectedState]);

  if (!moduleId) return <State title="Kein Modul gewaehlt" action={() => router.push(ROUTES.learn)}/>;
  if (!content || !record || !state) return <State title="Modul wird geladen" action={() => router.push(ROUTES.learn)}/>;
  const courseHref = courseHomeHref(record.track);
  if (state.status === 'locked') return <State title={record.unit.title} text="Voraussetzungen sind noch nicht abgeschlossen." action={() => router.push(courseHref)}/>;

  const selectedIndex = selectedState ? state.learningSteps.findIndex((item) => item.step.id === selectedState.step.id) : -1;
  const practicePhase = state.phases.find((item) => item.phase.type === 'practice');
  const examPhase = state.phases.find((item) => item.phase.type === 'exam');
  const practiceActivity = practicePhase?.activities.find((item) => item.status !== 'locked' && !['completed', 'mastered'].includes(item.status))?.activity ?? practicePhase?.activities[0]?.activity;
  const examActivity = examPhase?.activities.find((item) => item.status !== 'locked')?.activity ?? examPhase?.activities[0]?.activity;
  const candidate = state.examPassed ? nextCourseModule(content, moduleId) : null;
  const nextModule = candidate && (candidate.chapter.id === record.chapter.id || chapterState?.examPassed) ? candidate : null;
  const chapterExamReady = Boolean(state.examPassed && candidate?.chapter.id !== record.chapter.id && chapterState?.examReady);
  const check = selectedState ? buildMicroCheck(content, selectedState.step, state.learningSteps.map((item) => item.step)) : null;
  const activeTrack = record.track;
  const activeChapterId = record.chapter.id;

  const skillRows = selectedState?.step.skillIds.map((id) => ({
    definition: content.skills.find((item) => item.id === id),
    progress: skillProgress.find((item) => item.skillId === id)
  })).filter((item) => item.definition).slice(0, 4) ?? [];
  const dueForStep = selectedState ? reviewItems.filter((item) => {
    if (new Date(item.nextReviewAt).getTime() > Date.now()) return false;
    return item.contentId.includes(selectedState.step.id) || selectedState.step.contentIds.some((id) => item.contentId.includes(id));
  }).length : 0;

  const completedLearningSteps = state.learningSteps.filter((item) => ['completed', 'mastered'].includes(item.status)).length;
  const nextLearningStep = state.learningSteps.find((item, index) => index > selectedIndex && item.status !== 'locked' && !['completed', 'mastered'].includes(item.status))
    ?? state.learningSteps.find((item) => item.status !== 'locked' && !['completed', 'mastered'].includes(item.status));
  const showCurriculumCheckpoint = Boolean(
    selectedState && (
      ['completed', 'mastered'].includes(selectedState.status)
      || state.learningComplete
      || state.requiredActivitiesComplete
      || state.examPassed
    )
  );

  function continueFromCheckpoint() {
    if (nextLearningStep && !state.learningComplete) {
      setSelected(nextLearningStep.step.id);
      return;
    }
    if (!practicePhase?.complete && practiceActivity) {
      router.push(href(ROUTES.practice, { module: moduleId, activity: practiceActivity.id }));
      return;
    }
    if (!state.examPassed && state.requiredActivitiesComplete && examActivity) {
      router.push(href(ROUTES.practice, { module: moduleId, activity: examActivity.id }));
      return;
    }
    if (chapterExamReady && chapterState) {
      router.push(href(ROUTES.practice, { chapter: chapterState.chapter.id }));
      return;
    }
    if (state.examPassed && nextModule) {
      void patchProgress((draft) => setJourneyPosition(draft, nextModule.track, nextModule.chapter.id, nextModule.unit.id), ['journeyStates'])
        .then(() => router.push(href(ROUTES.module, { id: nextModule.unit.id })));
      return;
    }
    router.push(courseHref);
  }

  function checkpointNextLabel(): string {
    if (nextLearningStep && !state.learningComplete) return nextLearningStep.step.title;
    if (!practicePhase?.complete && practiceActivity) return 'Anwendung starten';
    if (!state.examPassed && state.requiredActivitiesComplete && examActivity) return 'Modulprüfung starten';
    if (chapterExamReady) return 'Kapitel-Check starten';
    if (state.examPassed && nextModule) return nextModule.unit.title;
    return 'Zum Lernpfad';
  }

  async function recordStepEvidence(step: LearningStep, correct: boolean, responseTimeMs: number) {
    const next = cloneProgressForUpdate(progress, ['journeyStates']);
    setJourneyPosition(next, activeTrack, activeChapterId, moduleId, step.id, step.id);
    await commit({
      progress: next,
      contentUpdates: [{ module: 'courseModule', contentId: step.id, action: 'attempt', correct, score: correct ? 100 : 0 }],
      exerciseResults: [{
        exerciseId: `step-check:${step.id}`,
        exerciseType: 'knowledge',
        wasCorrect: correct,
        score: correct ? 100 : 0,
        details: { module: 'courseModule', contentId: step.id, lessonId: step.id, variant: 'step_micro_check', interaction: 'choice', evidenceMode: 'recognition', responseTimeMs, skillIds: step.skillIds }
      }],
      history: { module: 'courseModule', activityType: 'exercise_answer', contentId: step.id, title: step.title, result: correct ? 'correct' : 'wrong', xpDelta: 0, details: { evidence: 'micro_check' } }
    });
  }

  return <div className="module-study-workspace">
    <StudyLedgerShell className="module-study-ledger" mainClassName="module-study-ledger-main" open={ledgerOpen}>
        <StudyLedgerHeader onClose={() => setLedgerOpen(false)}/>
        <button className="module-study-back" onClick={() => router.push(courseHref)}>
<Icon name="chevron" size={15}/> Lernpfad</button>
        <span className="study-ledger-kicker">{record.chapter.levelLabel} · {record.chapter.title}</span>
        <h1>{record.unit.title}</h1>
        <p>{record.unit.objective}</p>
        <StudyLedgerProgress label="Modulfortschritt" value={state.progress}/>
        <ol className="module-study-step-list">{state.learningSteps.map((item, index) => <li key={item.step.id} className={item.step.id === selectedState?.step.id ? 'is-active' : ''}>
          <button disabled={item.status === 'locked'} onClick={() => { setSelected(item.step.id); setLedgerOpen(false); }}>
            <span>{item.status === 'completed' || item.status === 'mastered' ? <Icon name="check" size={13}/> : item.status === 'locked' ? <Icon name="lock" size={12}/> : index + 1}</span>
            <div>
<strong>{item.step.title}</strong>
<small>{item.step.estimatedMinutes} Min.</small>
</div>
          </button>
        </li>)}</ol>
        <div className="module-study-phase-list">
          <button disabled={!state.learningComplete || practicePhase?.locked} onClick={() => practiceActivity && router.push(href(ROUTES.practice, { module: moduleId, activity: practiceActivity.id }))}>
<Icon name="grid" size={16}/>
<span>
<strong>Ueben</strong>
<small>{practicePhase?.bestScore ?? 0}% Bestwert</small>
</span>
</button>
          <button disabled={!state.requiredActivitiesComplete || examPhase?.locked} onClick={() => examActivity && router.push(href(ROUTES.practice, { module: moduleId, activity: examActivity.id }))}>
<Icon name="target" size={16}/>
<span>
<strong>Pruefen</strong>
<small>{state.examScore}% Bestwert</small>
</span>
</button>
        </div>
    </StudyLedgerShell>

    <main className="module-study-main">
      <div className="study-mobile-bar">
<button onClick={() => setLedgerOpen(true)}>
<Icon name="layers" size={18}/> Pfad</button>
<span>{selectedState?.step.title ?? record.unit.title}</span>
<button onClick={() => setContextOpen(true)}>Kontext <Icon name="more" size={18}/>
</button>
</div>
      {selectedState ? <article className="module-study-reader">
        <header>
          <span className="study-canvas-eyebrow">Schritt {selectedIndex + 1} von {state.learningSteps.length}</span>
          <h1>{selectedState.step.title}</h1>
          <p>{selectedState.step.description}</p>
          <div className="module-study-objective">
<Icon name="target" size={18}/>
<div>
<strong>Ziel</strong>
<span>{selectedState.step.objective}</span>
</div>
</div>
          <p className="learning-help-detail module-study-help">Lies den Inhalt, arbeite die Beispiele aktiv durch und loese danach den Mikro-Check. Erst bewertete Evidenz schliesst den Schritt ab.</p>
        </header>
        <LearningStepContent step={selectedState.step}/>
        <section className="module-study-check">
          <div>
<span className="study-canvas-eyebrow">Mikro-Check</span>
<h2>Direkt anwenden</h2>
<p>Der Schritt wird erst nach einer bewerteten Aufgabe abgeschlossen.</p>
</div>
          {check ? <StepMicroCheck key={selectedState.step.id} check={check} completed={['completed', 'mastered'].includes(selectedState.status)} onResult={(correct, ms) => void recordStepEvidence(selectedState.step, correct, ms)}/> : null}
          {completion && !['completed', 'mastered'].includes(selectedState.status) && <div className="module-study-policy">
<span>Evidenz {Math.min(completion.successfulEvidenceCount, completion.requiredEvidenceCount)}/{completion.requiredEvidenceCount}</span>{completion.missingModes.length > 0 && <small>Noch erforderlich: {completion.missingModes.map(modeLabel).join(', ')}</small>}{practiceActivity && !completion.complete && <button className="study-action-primary" onClick={() => router.push(href(ROUTES.practice, { module: moduleId, activity: practiceActivity.id }))}>Zur Anwendung <Icon name="arrow" size={16}/>
</button>}</div>}
        </section>
        {showCurriculumCheckpoint && <CurriculumCheckpoint
          moduleTitle={record.unit.title}
          completed={completedLearningSteps}
          total={state.learningSteps.length}
          steps={state.learningSteps.map((item) => ({
            id: item.step.id,
            title: item.step.title,
            minutes: item.step.estimatedMinutes,
            status: ['completed', 'mastered'].includes(item.status)
              ? 'done'
              : item.step.id === nextLearningStep?.step.id && !state.learningComplete
                ? 'active'
                : item.status === 'locked' ? 'locked' : 'open'
          }))}
          practiceStatus={practicePhase?.complete ? 'done' : state.learningComplete ? 'active' : 'locked'}
          examStatus={state.examPassed ? 'done' : state.requiredActivitiesComplete ? 'active' : 'locked'}
          nextLabel={checkpointNextLabel()}
          onNext={continueFromCheckpoint}
          onCurriculum={() => router.push(courseHref)}
          onReview={() => practiceActivity ? router.push(href(ROUTES.practice, { module: moduleId, activity: practiceActivity.id })) : router.push(ROUTES.review)}
        />}
      </article> : <div className="module-study-complete">
<Icon name="check" size={30}/>
<h1>Lernteil abgeschlossen</h1>
</div>}
    </main>

    <StudyContextRail state={moduleContextState({ selectedState, record, state, snapshot, skillRows, dueForStep, onReview: () => router.push(ROUTES.review) })} className="module-study-context" open={contextOpen} onClose={() => setContextOpen(false)}/>
    {(ledgerOpen || contextOpen) && <button className="study-mobile-backdrop" aria-label="Overlay schliessen" onClick={() => { setLedgerOpen(false); setContextOpen(false); }}/>} 
  </div>;
}

type CheckpointStatus = 'done' | 'active' | 'open' | 'locked';

function CurriculumCheckpoint({ moduleTitle, completed, total, steps, practiceStatus, examStatus, nextLabel, onNext, onCurriculum, onReview }: {
  moduleTitle: string;
  completed: number;
  total: number;
  steps: Array<{ id: string; title: string; minutes: number; status: CheckpointStatus }>;
  practiceStatus: CheckpointStatus;
  examStatus: CheckpointStatus;
  nextLabel: string;
  onNext(): void;
  onCurriculum(): void;
  onReview(): void;
}) {
  const rows = [
    ...steps,
    { id: 'practice', title: 'Anwenden & festigen', minutes: 8, status: practiceStatus },
    { id: 'exam', title: 'Modul-Check', minutes: 5, status: examStatus }
  ];
  return <section className="curriculum-checkpoint" aria-label="Kurrikulum-Checkpoint">
    <div className="curriculum-checkpoint__head">
      <div>
<span>Kurrikulum-Checkpoint</span>
<h2>{moduleTitle}</h2>
<p>Dein Lernstand bestimmt automatisch den nächsten sinnvollen Schritt.</p>
</div>
      <b>{completed}/{total} Lernschritte</b>
    </div>
    <div className="curriculum-checkpoint__steps">{rows.map((item) => <div className={`curriculum-checkpoint__step is-${item.status}`} key={item.id}>
      <i>{item.status === 'done' ? <Icon name="check" size={11}/> : item.status === 'locked' ? <Icon name="lock" size={10}/> : item.status === 'active' ? '●' : '○'}</i>
      <strong>{item.title}</strong>
      <small>{item.minutes}′</small>
    </div>)}</div>
    <div className="curriculum-checkpoint__actions">
      <button className="study-action-secondary" onClick={onCurriculum}>Zum Kurrikulum</button>
      <button className="study-action-secondary" onClick={onReview}>Wiederholen</button>
      <button className="study-action-primary" onClick={onNext}>{nextLabel} <Icon name="arrow" size={15}/>
</button>
    </div>
  </section>;
}

function moduleContextState({ selectedState, record, state, snapshot, skillRows, dueForStep, onReview }: any): StudyContextState {
  if (dueForStep > 0) return { kind: 'review', eyebrow: 'Review faellig', title: `${dueForStep} Wiederholung${dueForStep === 1 ? '' : 'en'}`, description: selectedState?.step.title ?? record.unit.title, status: `Gate-Ziel ${record.unit.exam.passScore}%`, action: { label: 'Review oeffnen', onClick: onReview } };
  if (snapshot.dominantError && (snapshot.errorRate ?? 0) > 0) return { kind: 'error', eyebrow: 'Fehlermuster', title: errorLabel(snapshot.dominantError), description: `${snapshot.errorRate}% Fehlerrate in ${snapshot.evidenceCount} Evidenzen.`, status: selectedState?.step.title ?? record.unit.title };
  if (snapshot.evidenceCount > 0) return { kind: 'evidence', eyebrow: 'Lern-Evidenz', title: snapshot.mastery === null ? 'Evidenz vorhanden' : `Mastery ${snapshot.mastery}%`, description: selectedState?.step.title ?? record.unit.title, body: <dl>
<div>
<dt>Sicherheit</dt>
<dd>{snapshot.confidence === null ? '-' : `${snapshot.confidence}%`}</dd>
</div>
<div>
<dt>Evidenzen</dt>
<dd>{snapshot.evidenceCount}</dd>
</div>
<div>
<dt>Skills</dt>
<dd>{skillRows.length}</dd>
</div>{snapshot.responseTimeMs !== null && <div>
<dt>Reaktionszeit</dt>
<dd>{Math.round(snapshot.responseTimeMs / 100) / 10}s</dd>
</div>}</dl>, status: state.examPassed ? `Gate bestanden · ${state.examScore}%` : `Gate-Ziel ${record.unit.exam.passScore}%` };
  return { kind: 'focus', eyebrow: 'Aktueller Fokus', title: selectedState?.step.title ?? record.unit.title, description: selectedState?.step.objective ?? record.unit.objective, status: state.examPassed ? `Gate bestanden · ${state.examScore}%` : `Gate-Ziel ${record.unit.exam.passScore}%` };
}

function StepMicroCheck({ check, completed, onResult }: { check: MicroCheck; completed: boolean; onResult(correct: boolean, responseTimeMs: number): void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const correct = selected === check.correct;
  if (completed && selected === null) return <div className="module-study-check-complete">
<Icon name="check" size={16}/>
<span>Evidenz vorhanden · Schritt abgeschlossen</span>
</div>;
  if (submitted && correct) return <div className="module-study-check-complete">
<Icon name="check" size={16}/>
<span>Mikro-Check bestanden · jetzt anwenden</span>
</div>;
  return <div className="module-study-check-body">
    {check.arabic && <ArabicText as="div" module="grammar" className="module-study-check-arabic" text={check.arabic}/>}<strong>{check.prompt}</strong>
    <div>{check.options.map((option) => <button key={option} disabled={selected !== null} className={selected === option ? (correct ? 'is-correct' : 'is-wrong') : selected && option === check.correct ? 'is-correct' : ''} onClick={() => setSelected(option)}>{option}</button>)}</div>
    {selected && <div className={`module-study-check-feedback ${correct ? 'is-correct' : 'is-wrong'}`}>
<strong>{correct ? 'Richtig' : 'Noch nicht'}</strong>
<span>{check.explanation}</span>
<button className="study-action-primary" onClick={() => { onResult(correct, Date.now() - startedAt); if (correct) setSubmitted(true); else setSelected(null); }}>{correct ? 'Evidenz speichern' : 'Noch einmal'}</button>
</div>}
  </div>;
}

function buildMicroCheck(content: LearningContent, step: LearningStep, siblings: LearningStep[]): MicroCheck | null {
  const fallback = () => {
    const block = step.knowledge[0];
    if (!block?.text) return null;
    const pool = siblings.flatMap((item) => item.knowledge.map((entry) => entry.text)).filter((text) => text && text !== block.text);
    return makeCheck(`Welcher Inhalt gehoert zu „${block.title}“?`, undefined, block.text, pool, block.text, step.id);
  };
  const ids = new Set(step.contentIds);
  if (step.contentModule === 'vocabulary') {
    const target = content.vocabulary.find((item) => ids.has(item.id));
    if (!target) return fallback();
    return makeCheck('Welche Bedeutung passt?', target.arabicVocalized, target.german, content.vocabulary.map((item) => item.german), `${target.arabicVocalized} bedeutet „${target.german}“.`, step.id);
  }
  if (step.contentModule === 'alphabet') {
    const target = content.alphabet.find((item) => ids.has(item.id));
    if (!target) return fallback();
    return makeCheck('Wie heisst dieser Buchstabe?', target.letter, target.name, content.alphabet.map((item) => item.name), `${target.letter} ist ${target.name}.`, step.id);
  }
  if (step.contentModule === 'grammar') {
    const target = content.grammar.find((item) => ids.has(item.id));
    const correct = target?.rules[0];
    if (!target || !correct) return fallback();
    return makeCheck(`Welche Regel gehoert zu „${target.title}“?`, undefined, correct, content.grammar.flatMap((item) => item.rules.slice(0, 1)), correct, step.id);
  }
  if (step.contentModule === 'reading') {
    const target = content.reading.find((item) => ids.has(item.id))?.examples[0];
    if (!target) return fallback();
    return makeCheck('Welche Bedeutung passt?', target.vocalized, target.german, content.reading.flatMap((item) => item.examples.slice(0, 1).map((example) => example.german)), target.german, step.id);
  }
  if (step.contentModule === 'writing') {
    const target = content.writing.find((item) => ids.has(item.id));
    if (!target) return fallback();
    return makeCheck('Welcher arabische Ausdruck gehoert zu dieser Schreibaufgabe?', undefined, target.targetVocalized, content.writing.map((item) => item.targetVocalized), target.prompt, step.id);
  }
  if (step.contentModule === 'quran') {
    const target = content.quran.find((item) => ids.has(item.id))?.examples[0];
    if (!target) return fallback();
    return makeCheck('Welche Bedeutung passt zum Beispiel?', target.arabic, target.german, content.quran.flatMap((item) => item.examples.slice(0, 1).map((example) => example.german)), target.note, step.id);
  }
  return fallback();
}

function makeCheck(prompt: string, arabic: string | undefined, correct: string, pool: string[], explanation: string, seed: string): MicroCheck {
  const distractors = [...new Set(pool.filter((item) => item && item !== correct))].slice(0, 8);
  const options = [correct, ...distractors.slice(0, 3)];
  const offset = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % Math.max(1, options.length);
  const rotated = [...options.slice(offset), ...options.slice(0, offset)];
  return { prompt, arabic, correct, options: rotated, explanation };
}

function LearningStepContent({ step }: { step: LearningStep }) {
  const { content } = useAppContent();
  if (!content) return null;
  return <div className="lesson-content module-study-content">{step.sections?.map((section) => <section key={section.id}>
<h2>{section.title}</h2>{section.description && <p>{section.description}</p>}{section.blocks.map((block) => <ContentBlock key={block.id} block={block}/>)}</section>)}{!step.sections?.length && step.knowledge.map((block, index) => <KnowledgeBlock key={`${step.id}:${index}`} block={block}/>)}<DomainContent step={step}/>
</div>;
}
function ContentBlock({ block }: { block: LearningContentBlock }) { return <div className={`learning-block learning-block--${block.type}`}>{block.title && <h3>{block.title}</h3>}{block.arabic && <ArabicText as="div" module="grammar" text={block.arabic}/>} {block.text && <p>{block.text}</p>}{block.items?.length ? <ul>{block.items.map((item) => <li key={item}>{item}</li>)}</ul> : null}</div>; }
function KnowledgeBlock({ block }: { block: LearningActivityKnowledgeBlock }) { return <div className="learning-block">
<h3>{block.title}</h3>{block.arabic && <ArabicText as="div" module="grammar" text={block.arabic}/>}<p>{block.text}</p>
</div>; }
function DomainContent({ step }: { step: LearningStep }) {
  const { content } = useAppContent(); if (!content || !step.contentModule || !step.contentIds.length) return null; const ids = new Set(step.contentIds);
  if (step.contentModule === 'vocabulary') return <div className="vocab-grid">{content.vocabulary.filter((item) => ids.has(item.id)).slice(0, 12).map((item) => <div className="vocab-card" key={item.id}>
<ArabicText module="vocabulary" text={item.arabicVocalized}/>
<strong>{item.german}</strong>
<small>
<Transliteration>{item.transliteration}</Transliteration>
</small>
</div>)}</div>;
  if (step.contentModule === 'alphabet') return <div className="alphabet-grid">{content.alphabet.filter((item) => ids.has(item.id)).map((item) => <div className="letter-card" key={item.id}>
<ArabicText module="vocabulary" text={item.letter}/>
<strong>{item.name}</strong>
<small>{item.sound}</small>
</div>)}</div>;
  if (step.contentModule === 'grammar') return <>{content.grammar.filter((item) => ids.has(item.id)).map((item) => <div className="domain-lesson" key={item.id}>
<h2>{item.title}</h2>
<p>{item.description}</p>{item.rules.slice(0, 5).map((rule) => <div className="rule-line" key={rule}>
<Icon name="check" size={15}/>
<span>{rule}</span>
</div>)}</div>)}</>;
  if (step.contentModule === 'reading') return <>{content.reading.filter((item) => ids.has(item.id)).map((item) => <div className="domain-lesson" key={item.id}>
<h2>{item.title}</h2>{item.examples.slice(0, 3).map((example) => <div className="reading-example" key={example.id}>
<ArabicText as="div" module="reading" text={example.vocalized}/>
<strong>{example.german}</strong>
</div>)}</div>)}</>;
  if (step.contentModule === 'writing') return <>{content.writing.filter((item) => ids.has(item.id)).map((item) => <div className="domain-lesson" key={item.id}>
<h2>{item.title}</h2>
<ArabicText as="div" module="writing" className="arabic-text--large" text={item.targetVocalized}/>
<p>{item.prompt}</p>
</div>)}</>;
  if (step.contentModule === 'quran') return <>{content.quran.filter((item) => ids.has(item.id)).map((item) => <div className="domain-lesson" key={item.id}>
<h2>{item.title}</h2>
<p>{item.objective}</p>{item.examples.slice(0, 3).map((example) => <div className="reading-example" key={example.id}>
<ArabicText as="div" module="quran" text={example.arabic}/>
<strong>{example.german}</strong>
<small>{example.note}</small>
</div>)}</div>)}</>;
  return null;
}
function masterySnapshotForStep(index: ReturnType<typeof buildMasteryIndex>, step: LearningStep | null) {
  if (!step) return { evidenceCount: 0, mastery: null as number | null, confidence: null as number | null, errorRate: null as number | null, responseTimeMs: null as number | null, dominantError: null as string | null };
  const keys = [masteryKey('courseModule', step.id), ...(step.contentModule ? step.contentIds.map((id) => masteryKey(step.contentModule!, id)) : [])];
  const values = keys.map((key) => index.get(key)).filter((value): value is LearningItemMastery => Boolean(value));
  if (!values.length) return { evidenceCount: 0, mastery: null as number | null, confidence: null as number | null, errorRate: null as number | null, responseTimeMs: null as number | null, dominantError: null as string | null };
  const evidenceCount = values.reduce((sum, value) => sum + value.evidenceCount, 0);
  const weighted = (pick: (value: typeof values[number]) => number) => Math.round(values.reduce((sum, value) => sum + pick(value) * Math.max(1, value.evidenceCount), 0) / Math.max(1, evidenceCount));
  const response = values.filter((value) => value.responseTimeMs !== null);
  const errors = new Map<string, number>();
  for (const value of values) if (value.dominantError) errors.set(value.dominantError, (errors.get(value.dominantError) ?? 0) + Math.max(1, value.evidenceCount));
  return {
    evidenceCount,
    mastery: weighted((value) => value.overall),
    confidence: weighted((value) => value.confidence),
    errorRate: weighted((value) => value.errorRate),
    responseTimeMs: response.length ? Math.round(response.reduce((sum, value) => sum + (value.responseTimeMs ?? 0), 0) / response.length) : null,
    dominantError: [...errors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  };
}
function errorLabel(value: string) { return ({ vocabulary: 'Wortschatz', grammar: 'Grammatik', orthography: 'Schreibweise', listening: 'Hoerverstehen', word_order: 'Wortreihenfolge', morphology: 'Morphologie', pronunciation: 'Aussprache', unknown: 'unspezifischer Fehler' } as Record<string, string>)[value] ?? value; }
function State({ title, text, action }: { title: string; text?: string; action(): void }) { return <div className="state-page">
<Icon name="book" size={30}/>
<h1>{title}</h1>{text && <p>{text}</p>}<button className="button button--primary" onClick={action}>Zum Lernpfad</button>
</div>; }

function modeLabel(value: string): string { return ({ recognition: 'Erkennen', recall: 'Abrufen', application: 'Anwenden', production: 'Produzieren', listening: 'Hoeren', speaking: 'Sprechen' } as Record<string, string>)[value] ?? value; }
