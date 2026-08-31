'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ContentProgressUpdate, LearningActivity, ReviewResultInput } from '../../types/models';
import { chapterExamEntryId, moduleExamEntryId, phasePracticeEntryId } from '../../shared/course-module';
import { EXERCISE_TYPE_LABELS } from '../../shared/exercise-registry';
import { canRecognizeArabic, speakArabic, startArabicRecognition, startRecording, type RecordingSession, type SpeechRecognitionSession } from '../../services/audio/audio-service';
import { useAppContent, useAppLearning, useAppPreferences, useAppProgress } from '../../state/AppProvider';
import { Icon } from '../../components/ui/Icon';
import { ROUTES, href } from '../../components/shell/routes';
import { equivalent, shuffle, splitBlank, taskKindLabel, tokenScore, variantLabel, type ExerciseTask } from './tasks';
import { scoreTextTask, selfAssessmentScore, speakingScore } from './scoring';
import { skillIdsForContent } from '../../services/learning/skill-progress-service';
import { cloneProgressForUpdate } from '../../state/progress-copy';

interface Answer { task: ExerciseTask; correct: boolean; answer: string; score: number; responseTimeMs: number }
interface RunnerProps { title:string; tasks:ExerciseTask[]; moduleId?:string; chapterId?:string; chapterPassScore?:number; returnHref?:string; activity?:LearningActivity; phaseType?:string; phaseId?:string; challengeId?:string }

export function ExerciseRunner({ title, tasks, moduleId, chapterId, chapterPassScore, returnHref, activity, phaseType, phaseId, challengeId }: RunnerProps) {
  const { content } = useAppContent();
const { progress } = useAppProgress();
const { commit } = useAppLearning();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [finished, setFinished] = useState(false);
  const current = tasks[index];
  const taskStartedAt = useRef(Date.now());
  useEffect(() => { taskStartedAt.current = Date.now(); }, [current?.id]);
  const exitHref = returnHref ?? (moduleId ? href(ROUTES.module, { id: moduleId }) : ROUTES.practice);

  if (!tasks.length) return <div className="empty-focus">
<Icon name="grid" size={34}/>
<h1>Keine geeigneten Aufgaben</h1>
<p>Für diese Kombination liegen noch keine passenden Inhalte vor.</p>
<button className="button button--secondary" onClick={() => router.push(ROUTES.practice)}>Andere Übung</button>
</div>;

  async function answer(correct: boolean, value: string, score = correct ? 100 : 0) {
    if (!current) return;
    const responseTimeMs = Math.max(0, Date.now() - taskStartedAt.current);
    const next = [...answers, { task: current, correct, answer: value, score, responseTimeMs }];
    setAnswers(next);
    if (index >= tasks.length - 1) await finish(next);
    else setIndex((value) => value + 1);
  }

  async function finish(records: Answer[]) {
    const score = Math.round(records.reduce((sum, item) => sum + item.score, 0) / records.length);
    const passScore = chapterPassScore ?? activity?.minimumScore ?? (phaseType === 'exam' ? 80 : 70);
    const passed = score >= passScore;
    const next = cloneProgressForUpdate(progress, ['dailyChallenge']);
    const xp = records.filter((item) => item.correct).length * 2 + (passed ? 10 : 0);
    next.xp += xp;
    next.quizCorrect += records.filter((item) => item.correct).length;
    next.quizTotal += records.length;
    next.currentExerciseType = records[0]?.task.exerciseType ?? next.currentExerciseType;
    next.currentExerciseVariant = records[0]?.task.variant ?? next.currentExerciseVariant;
    if (challengeId && next.dailyChallenge?.id === challengeId) {
      next.dailyChallenge.status = 'completed';
      next.dailyChallenge.score = score;
      next.dailyChallenge.completedAt = new Date().toISOString();
    }

    const contentUpdates: ContentProgressUpdate[] = records
      .filter((item) => item.task.module !== 'courseModule')
      .map((item) => ({ module: item.task.module, contentId: item.task.contentId, action: 'attempt', correct: item.correct, score: item.score }));
    if (moduleId && activity) {
      contentUpdates.push({ module: 'courseModule', contentId: activity.id, action: 'attempt', correct: passed, score });
      if (phaseType === 'practice' && phaseId) contentUpdates.push({ module: 'courseModule', contentId: phasePracticeEntryId(phaseId), action: 'attempt', correct: passed, score });
      if (phaseType === 'exam') {
        contentUpdates.push({ module: 'courseModule', contentId: moduleExamEntryId(moduleId), action: 'attempt', correct: passed, score });
        if (passed) contentUpdates.push({ module: 'courseModule', contentId: moduleId, action: 'verify', correct: true, score });
      }
    }
    if (chapterId) {
      const examId = chapterExamEntryId(chapterId);
      contentUpdates.push({ module: 'courseModule', contentId: examId, action: 'attempt', correct: passed, score });
      if (passed) contentUpdates.push({ module: 'courseModule', contentId: examId, action: 'verify', correct: true, score });
    }
    const reviews: ReviewResultInput[] = records.flatMap((item) => item.task.reviewType ? [{ contentType: item.task.reviewType, contentId: `${item.task.contentId}::${item.task.variant}`, prompt: item.task.arabicPrompt ?? item.task.prompt, answer: item.task.correct ?? item.answer, correct: item.correct, rating: item.correct ? 'good' : 'again' }] : []);
    await commit({
      progress: next,
      contentUpdates,
      reviews,
      exerciseResults: records.map((item) => ({ exerciseId: item.task.id, exerciseType: item.task.exerciseType, wasCorrect: item.correct, score: item.score, details: { variant: item.task.variant, module: item.task.module, contentId: item.task.contentId, lessonId: item.task.contentId, answer: item.answer, interaction: item.task.kind, responseTimeMs: item.responseTimeMs, skillIds: content ? skillIdsForContent(content, item.task.module, item.task.contentId) : [] } })),
      history: { module: moduleId || chapterId ? 'courseModule' : 'exercises', activityType: 'exercise_answer', contentId: chapterId ? chapterExamEntryId(chapterId) : activity?.id, title, result: passed ? 'completed' : 'wrong', xpDelta: xp, details: { score, questionCount: records.length, variant: records[0]?.task.variant, scope: chapterId ? 'chapter' : moduleId ? 'module' : 'practice' } }
    });
    setAnswers(records);
    setFinished(true);
  }

  if (finished) {
    const score = Math.round(answers.reduce((sum, item) => sum + item.score, 0) / answers.length);
    const passScore = chapterPassScore ?? activity?.minimumScore ?? (phaseType === 'exam' ? 80 : 70);
    const curriculumScoped = Boolean(moduleId || chapterId);
    return <div className={`exercise-result${curriculumScoped ? ' is-curriculum-checkpoint' : ''}`}>
      <span className={`result-orb ${score >= passScore ? 'is-good' : 'is-retry'}`}>
<Icon name={score >= passScore ? 'check' : 'repeat'} size={30}/>
</span>
      <span className="eyebrow">{curriculumScoped ? 'Kurrikulum-Checkpoint' : 'Session abgeschlossen'}</span>
      <h1>{score}%</h1>
      <p>{score >= passScore ? (curriculumScoped ? 'Evidenz gespeichert. Dein Lernpfad wurde aktualisiert.' : 'Ziel erreicht.') : `Ziel: ${passScore}%.`}</p>
      <div className="result-grid">
<span>
<strong>{answers.filter((item) => item.correct).length}</strong> bestanden</span>
<span>
<strong>{answers.length - answers.filter((item) => item.correct).length}</strong> wiederholen</span>
<span>
<strong>{answers.length}</strong> Aufgaben</span>
</div>
      {curriculumScoped && <div className="exercise-result__curriculum-hint">
<Icon name="layers" size={17}/>
<span>Zurück im Kurrikulum wird automatisch der nächste offene Schritt, die nächste Übung oder das nächste Gate markiert.</span>
</div>}
      <div className="result-actions">
<button className="button button--secondary" onClick={() => { setIndex(0); setAnswers([]); setFinished(false); }}>Nochmal</button>
<button className="button button--primary" onClick={() => router.push(exitHref)}>{chapterId ? 'Kurrikulum öffnen' : moduleId ? 'Weiter im Kurrikulum' : 'Fertig'}</button>
</div>
    </div>;
  }

  if (!current) return null;
  return <div className="exercise-runner">
<header className="exercise-runner__header">
<button className="icon-button" onClick={() => router.push(exitHref)}>
<Icon name="close" size={19}/>
</button>
<div>
<strong>{title}</strong>
<small>{index + 1} / {tasks.length} · {variantLabel(current.variant)} · {taskKindLabel(current.kind)}</small>
</div>
<div className="exercise-runner__progress">
<i style={{ width: `${Math.round((index + 1) / tasks.length * 100)}%` }}/>
</div>
</header>
<main className="exercise-runner__stage">
<TaskView key={current.id} task={current} onAnswer={(correct, value, score) => void answer(correct, value, score)}/>
</main>
<footer className="exercise-runner__footer">
<span>{answers.filter((item) => item.correct).length} bestanden</span>
<span>{EXERCISE_TYPE_LABELS[current.exerciseType]}</span>
</footer>
</div>;
}

function TaskView({ task, onAnswer }: { task: ExerciseTask; onAnswer(correct: boolean, answer: string, score?: number): void }) {
  if (task.kind === 'choice') return <ChoiceTask task={task} onAnswer={onAnswer}/>;
  if (task.kind === 'text') return <TextTask task={task} onAnswer={onAnswer}/>;
  if (task.kind === 'order') return <OrderTask task={task} onAnswer={onAnswer}/>;
  if (task.kind === 'match') return <MatchTask task={task} onAnswer={onAnswer}/>;
  if (task.kind === 'cloze') return <ClozeTask task={task} onAnswer={onAnswer}/>;
  if (task.kind === 'analysis') return <AnalysisTask task={task} onAnswer={onAnswer}/>;
  if (task.kind === 'trace') return <TraceTask task={task} onAnswer={onAnswer}/>;
  return <SpeakingTask task={task} onAnswer={onAnswer}/>;
}

function TaskFrame({ task, children }: { task: ExerciseTask; children: ReactNode }) {
  return <section className={`question-card question-card--${task.kind}`}>
<div className="question-meta">
<span>{variantLabel(task.variant)}</span>
<span>{taskKindLabel(task.kind)}</span>
</div>{task.arabicPrompt && task.kind !== 'cloze' && <div className="question-arabic" dir="rtl">{task.arabicPrompt}</div>}<h1>{task.prompt}</h1>{children}</section>;
}
function AudioPrompt({ text }: { text?: string }) { const { preferences } = useAppPreferences(); return text ? <button className="audio-prompt" disabled={!preferences.audioEnabled} onClick={() => preferences.audioEnabled&&speakArabic(text,preferences.audioRate,{},preferences.audioVoice)}>
<Icon name="headphones" size={19}/> {preferences.audioEnabled?'Anhoeren':'Audio aus'}</button> : null; }

function ChoiceTask({ task, onAnswer }: { task: ExerciseTask; onAnswer(correct: boolean, answer: string): void }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <TaskFrame task={task}>
<AudioPrompt text={task.audioText}/>
<div className="choice-grid">{(task.options ?? []).map((choice, index) => { const revealed = selected !== null; const correct = choice === task.correct; const chosen = choice === selected; return <button key={`${choice}-${index}`} className={`${chosen ? 'is-selected' : ''} ${revealed && correct ? 'is-correct' : ''} ${revealed && chosen && !correct ? 'is-wrong' : ''}`} disabled={revealed} onClick={() => setSelected(choice)}>
<span>{String.fromCharCode(65 + index)}</span>
<strong>{choice}</strong>
</button>; })}</div>{selected && <>
<Feedback correct={selected === task.correct} solution={task.correct} explanation={task.explanation}/>
<button className="button button--primary task-next" onClick={() => onAnswer(selected === task.correct, selected)}>Weiter</button>
</>}</TaskFrame>;
}

function TextTask({ task, onAnswer }: { task: ExerciseTask; onAnswer(correct: boolean, answer: string, score?: number): void }) {
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);
  const assessment = scoreTextTask(task, value);
  return <TaskFrame task={task}>
<AudioPrompt text={task.audioText}/>
<input className="answer-input" dir="auto" value={value} onChange={(event) => { setValue(event.target.value); setChecked(false); }} placeholder="Antwort eingeben" onKeyDown={(event) => { if (event.key === 'Enter' && value.trim()) setChecked(true); }}/>{checked && <Feedback correct={assessment.correct} solution={task.correct} explanation={task.explanation} score={assessment.score}/>}<button className="button button--primary task-next" disabled={!value.trim()} onClick={() => checked ? onAnswer(assessment.correct, value, assessment.score) : setChecked(true)}>{checked ? 'Weiter' : 'Prüfen'}</button>
</TaskFrame>;
}

function OrderTask({ task, onAnswer }: { task: ExerciseTask; onAnswer(correct: boolean, answer: string, score?: number): void }) {
  const [pool, setPool] = useState(() => shuffle(task.tokens ?? []));
  const [built, setBuilt] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [drag, setDrag] = useState<{ token: string; source: 'pool' | 'built'; index: number } | null>(null);
  const expected = task.correct ?? '';
  const value = built.join(' ');
  const score = Math.round(tokenScore(built, expected.split(' ')) * 100);
  const correct = equivalent(value, expected);
  function toBuilt(token: string, source: 'pool' | 'built', index: number, target?: number) { if (checked) return; if (source === 'pool') setPool((items) => items.filter((_, i) => i !== index)); else setBuilt((items) => items.filter((_, i) => i !== index)); setBuilt((items) => { const next = [...items]; next.splice(target === undefined ? next.length : Math.max(0, Math.min(target, next.length)), 0, token); return next; }); }
  function toPool(token: string, source: 'pool' | 'built', index: number) { if (checked) return; if (source === 'built') setBuilt((items) => items.filter((_, i) => i !== index)); else setPool((items) => items.filter((_, i) => i !== index)); setPool((items) => [...items, token]); }
  function dragStart(event: ReactDragEvent, token: string, source: 'pool' | 'built', index: number) { setDrag({ token, source, index }); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', token); }
  return <TaskFrame task={task}>
<p className="interaction-hint">Bausteine ziehen oder antippen. Die Reihenfolge wird vollständig bewertet.</p>
<div className={`sentence-drop ${drag ? 'is-dragging' : ''}`} dir="rtl" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (drag) toBuilt(drag.token, drag.source, drag.index); setDrag(null); }}>{built.length ? built.map((token, index) => <button draggable={!checked} key={`${token}-${index}`} onDragStart={(event) => dragStart(event, token, 'built', index)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (drag) toBuilt(drag.token, drag.source, drag.index, index); setDrag(null); }} onClick={() => toPool(token, 'built', index)}>{token}</button>) : <span>Satz hier zusammensetzen</span>}</div>
<div className="token-bank" dir="rtl" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (drag) toPool(drag.token, drag.source, drag.index); setDrag(null); }}>{pool.map((token, index) => <button draggable={!checked} key={`${token}-${index}`} onDragStart={(event) => dragStart(event, token, 'pool', index)} onClick={() => toBuilt(token, 'pool', index)}>{token}</button>)}</div>{checked && <Feedback correct={correct} solution={expected} explanation={task.explanation} score={score}/>}<button className="button button--primary task-next" disabled={!built.length} onClick={() => checked ? onAnswer(correct, value, score) : setChecked(true)}>{checked ? 'Weiter' : 'Prüfen'}</button>
</TaskFrame>;
}

function MatchTask({ task, onAnswer }: { task: ExerciseTask; onAnswer(correct: boolean, answer: string, score?: number): void }) {
  const pairs = useMemo(() => (task.pairs ?? []).map((pair, index) => ({ ...pair, matchId: `${task.id}:${index}` })), [task]);
  const [left, setLeft] = useState<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [errors, setErrors] = useState(0);
  const rights = useMemo(() => shuffle(pairs.map((pair) => ({ matchId: pair.matchId, label: pair.right }))), [pairs]);
  function choose(target: string, candidate = left) { if (!candidate) return; if (candidate === target) setMatched((items) => items.includes(candidate) ? items : [...items, candidate]); else setErrors((value) => value + 1); setLeft(null); setDragged(null); }
  const complete = matched.length === pairs.length;
  const score = pairs.length ? Math.max(0, Math.round((pairs.length - errors) / pairs.length * 100)) : 0;
  return <TaskFrame task={task}>
<p className="interaction-hint">Ziehen oder auf Touch beide Karten nacheinander antippen.</p>
<div className="match-board">
<div>{pairs.map((pair) => <button draggable={!matched.includes(pair.matchId)} disabled={matched.includes(pair.matchId)} className={`${left === pair.matchId ? 'is-selected' : ''} ${matched.includes(pair.matchId) ? 'is-matched' : ''}`} key={pair.matchId} onDragStart={(event) => { setDragged(pair.matchId); event.dataTransfer.setData('text/plain', pair.matchId); }} onClick={() => setLeft(pair.matchId)}>{pair.left}</button>)}</div>
<div>{rights.map((right) => <button disabled={matched.includes(right.matchId)} className={matched.includes(right.matchId) ? 'is-matched' : ''} key={right.matchId} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(right.matchId, dragged ?? event.dataTransfer.getData('text/plain')); }} onClick={() => choose(right.matchId)}>{right.label}</button>)}</div>
</div>
<div className="interaction-status">
<span>{matched.length}/{pairs.length} Paare</span>
<span>{errors} Fehlversuche</span>
</div>
<button className="button button--primary task-next" disabled={!complete} onClick={() => onAnswer(score >= 70, `${pairs.length} Paare`, score)}>Weiter</button>
</TaskFrame>;
}

function ClozeTask({ task, onAnswer }: { task: ExerciseTask; onAnswer(correct: boolean, answer: string): void }) {
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);
  const correct = equivalent(value, task.correct ?? '');
  const [before, after] = splitBlank(task.clozeTemplate ?? task.arabicPrompt ?? '___');
  function select(option: string) { if (!checked) setValue(option); }
  return <TaskFrame task={task}>
<div className="cloze-sentence" dir="rtl">
<span>{before}</span>
<button className={`${value ? 'has-value' : ''} ${checked ? (correct ? 'is-correct' : 'is-wrong') : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); select(event.dataTransfer.getData('text/plain')); }}>{value || '_____'} </button>
<span>{after}</span>
</div>
<div className="cloze-bank" dir="rtl">{(task.options ?? []).map((option) => <button key={option} draggable={!checked} disabled={checked || option === value} onDragStart={(event) => event.dataTransfer.setData('text/plain', option)} onClick={() => select(option)}>{option}</button>)}</div>{!(task.options ?? []).length && <input className="answer-input" value={value} onChange={(event) => { setValue(event.target.value); setChecked(false); }}/>} {checked && <Feedback correct={correct} solution={task.correct} explanation={task.explanation}/>}<button className="button button--primary task-next" disabled={!value.trim()} onClick={() => checked ? onAnswer(correct, value) : setChecked(true)}>{checked ? 'Weiter' : 'Prüfen'}</button>
</TaskFrame>;
}

function AnalysisTask({ task, onAnswer }: { task: ExerciseTask; onAnswer(correct: boolean, answer: string, score?: number): void }) {
  const steps = task.analysisSteps ?? [];
  const [answers, setAnswers] = useState<Record<string,string>>({});
  const [checked, setChecked] = useState(false);
  const completed = steps.length > 0 && steps.every((step) => Boolean(answers[step.id]));
  const correctCount = steps.filter((step) => answers[step.id] === step.correct).length;
  const score = steps.length ? Math.round(correctCount / steps.length * 100) : 0;
  const correct = score >= 75;
  return <TaskFrame task={task}>
<div className="analysis-task">{steps.map((step, stepIndex) => <section key={step.id} className={checked ? (answers[step.id] === step.correct ? 'is-correct' : 'is-wrong') : ''}>
<header>
<span>{stepIndex + 1}</span>
<strong>{step.prompt}</strong>
</header>
<div>{step.options.map((option) => <button key={option} disabled={checked} className={answers[step.id] === option ? 'is-selected' : ''} onClick={() => setAnswers((current) => ({ ...current, [step.id]: option }))}>{option}</button>)}</div>{checked && <small>{answers[step.id] === step.correct ? 'Richtig.' : `Erwartet: ${step.correct}`}{step.explanation ? ` ${step.explanation}` : ''}</small>}</section>)}</div>{checked && <Feedback correct={correct} explanation={task.explanation} score={score}/>}<button className="button button--primary task-next" disabled={!completed} onClick={() => checked ? onAnswer(correct, steps.map((step) => answers[step.id]).join(' | '), score) : setChecked(true)}>{checked ? 'Weiter' : 'Analyse prüfen'}</button>
</TaskFrame>;
}

function TraceTask({ task, onAnswer }: { task: ExerciseTask; onAnswer(correct: boolean, answer: string, score?: number): void }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const points = useRef<Array<{ x: number; y: number }>>([]);
  const [drawing, setDrawing] = useState(false);
  const [strokes, setStrokes] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  function pos(event: ReactPointerEvent<HTMLCanvasElement>) { const node = canvas.current!; const rect = node.getBoundingClientRect(); return { x: (event.clientX - rect.left) * node.width / rect.width, y: (event.clientY - rect.top) * node.height / rect.height }; }
  function down(event: ReactPointerEvent<HTMLCanvasElement>) { const node = canvas.current; if (!node) return; node.setPointerCapture(event.pointerId); const context = node.getContext('2d'); if (!context) return; const point = pos(event); context.beginPath(); context.moveTo(point.x, point.y); context.lineWidth = 12; context.lineCap = 'round'; context.lineJoin = 'round'; context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d8b25c'; points.current.push(point); setDrawing(true); setStrokes((value) => value + 1); setScore(null); }
  function move(event: ReactPointerEvent<HTMLCanvasElement>) { if (!drawing) return; const node = canvas.current; const context = node?.getContext('2d'); if (!node || !context) return; const point = pos(event); context.lineTo(point.x, point.y); context.stroke(); points.current.push(point); }
  function clear() { const node = canvas.current; node?.getContext('2d')?.clearRect(0, 0, node.width, node.height); points.current = []; setStrokes(0); setScore(null); }
  function assess() { const node = canvas.current; if (!node) return; setScore(scoreTrace(points.current, task.traceText ?? task.arabicPrompt ?? '', node.width, node.height)); }
  return <TaskFrame task={task}>
<p className="interaction-hint">Fahre die Vorlage möglichst vollständig nach. Nähe zur Vorlage und Flächenabdeckung werden bewertet.</p>
<div className="trace-wrap">
<span dir="rtl">{task.traceText}</span>
<canvas ref={canvas} width={720} height={300} onPointerDown={down} onPointerMove={move} onPointerUp={() => setDrawing(false)} onPointerCancel={() => setDrawing(false)}/>
</div>{score !== null && <div className={`trace-score ${score >= 70 ? 'is-good' : 'is-retry'}`}>
<strong>{score}%</strong>
<span>{score >= 70 ? 'Vorlage ausreichend getroffen.' : 'Noch einmal näher an der Vorlage nachfahren.'}</span>
</div>}<div className="answer-actions">
<button className="button button--secondary" onClick={clear}>Löschen</button>{score === null ? <button className="button button--primary" disabled={!strokes || points.current.length < 8} onClick={assess}>Bewerten</button> : <button className="button button--primary" onClick={() => onAnswer(score >= 70, `${strokes} Striche`, score)}>Weiter</button>}</div>
</TaskFrame>;
}

function SpeakingTask({ task, onAnswer }: { task: ExerciseTask; onAnswer(correct: boolean, answer: string, score?: number): void }) {
  const { preferences } = useAppPreferences();
  const recording = useRef<RecordingSession | null>(null);
  const recognition = useRef<SpeechRecognitionSession | null>(null);
  const [active, setActive] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [transcript, setTranscript] = useState('');
  const [autoScore, setAutoScore] = useState<number | null>(null);
  const [criteria, setCriteria] = useState([false, false, false]);
  const recognitionAvailable = canRecognizeArabic();

  useEffect(() => () => { recording.current?.cancel(); recognition.current?.cancel(); if (url) URL.revokeObjectURL(url); }, [url]);

  async function toggle() {
    try {
      if (!active) {
        if (url) URL.revokeObjectURL(url);
        setUrl(''); setTranscript(''); setAutoScore(null); setCriteria([false, false, false]); setError('');
        recording.current = await startRecording();
        recognition.current = startArabicRecognition();
        setActive(true);
        return;
      }
      if (!recording.current) return;
      const recordingResult = await recording.current.stop();
      setUrl(recordingResult.url);
      recording.current = null;
      setActive(false);
      if (recognition.current) {
        try {
          const result = await recognition.current.stop();
          recognition.current = null;
          if (result.transcript) {
            const score = speakingScore(result.transcript, task.correct ?? '', result.confidence);
            setTranscript(result.transcript);
            setAutoScore(score);
          }
        } catch {
          recognition.current = null;
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      recording.current?.cancel(); recognition.current?.cancel(); recording.current = null; recognition.current = null; setActive(false);
    }
  }

  const fallbackScore = selfAssessmentScore(criteria);
  const finalScore = autoScore ?? fallbackScore;
  const canFinish = autoScore !== null || (url && criteria.some(Boolean));
  return <TaskFrame task={task}>
<div className="speaking-target" dir="rtl">{task.correct}</div>
<div className="speaking-controls">
<button className="button button--secondary" disabled={!preferences.audioEnabled} onClick={() => preferences.audioEnabled&&speakArabic(task.correct ?? '',preferences.audioRate,{},preferences.audioVoice)}>
<Icon name="volume" size={18}/> {preferences.audioEnabled?'Vorbild':'Audio aus'}</button>
<button className={`button ${active ? 'button--danger' : 'button--secondary'}`} onClick={() => void toggle()}>
<Icon name="microphone" size={18}/>{active ? 'Stoppen' : url ? 'Neu aufnehmen' : 'Aufnehmen'}</button>
</div>{url && <audio controls src={url}/>} {error && <div className="inline-error">{error}</div>}{autoScore !== null ? <div className={`speech-analysis ${autoScore >= 75 ? 'is-good' : 'is-retry'}`}>
<div>
<span>Erkannt</span>
<strong dir="rtl">{transcript}</strong>
</div>
<b>{autoScore}%</b>
<p>Automatische Wortübereinstimmung. Aussprachefeinheiten werden nicht vollständig erfasst.</p>
</div> : url ? <div className="speech-rubric">
<span>{recognitionAvailable ? 'Keine sichere Transkription. Bewerte drei Kriterien:' : 'Offline-Spracherkennung nicht verfügbar. Bewerte drei Kriterien:'}</span>{['Alle Wörter vollständig', 'Laute deutlich artikuliert', 'Rhythmus und Längen passend'].map((label, index) => <button key={label} className={criteria[index] ? 'is-selected' : ''} onClick={() => setCriteria((items) => items.map((value, cursor) => cursor === index ? !value : value))}>
<Icon name={criteria[index] ? 'check' : 'target'} size={16}/>{label}</button>)}<strong>{fallbackScore}%</strong>
</div> : <p className="interaction-hint">Höre das Vorbild, nimm dich auf und vergleiche. Wenn unterstützt, bewertet die App zusätzlich die erkannte Wortfolge.</p>}<button className="button button--primary task-next" disabled={!canFinish} onClick={() => onAnswer(finalScore >= 75, autoScore !== null ? transcript : `Selbsteinschätzung ${fallbackScore}%`, finalScore)}>Bewertung übernehmen</button>
</TaskFrame>;
}

function Feedback({ correct, solution, explanation, score }: { correct: boolean; solution?: string; explanation?: string; score?: number }) {
  return <div className={`feedback ${correct ? 'is-correct' : 'is-wrong'}`}>
<strong>{correct ? 'Richtig' : `Lösung: ${solution ?? '–'}`}{score !== undefined ? ` · ${score}%` : ''}</strong>{explanation && <span>{explanation}</span>}</div>;
}

function scoreTrace(points: Array<{ x: number; y: number }>, target: string, width: number, height: number): number {
  if (points.length < 8 || !target.trim()) return 0;
  const mask = document.createElement('canvas');
  mask.width = width; mask.height = height;
  const context = mask.getContext('2d', { willReadFrequently: true });
  if (!context) return 0;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#fff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.direction = 'rtl';
  const fontSize = Math.min(138, Math.max(68, width / Math.max(4, target.length * 0.78)));
  context.font = `${fontSize}px serif`;
  context.fillText(target, width / 2, height / 2 + fontSize * 0.08, width * 0.86);
  const data = context.getImageData(0, 0, width, height).data;
  const radius = 18;
  let matched = 0;
  for (const point of points) if (nearMask(data, width, height, Math.round(point.x), Math.round(point.y), radius)) matched += 1;
  const precision = matched / points.length;
  const xs = points.map((point) => point.x); const ys = points.map((point) => point.y);
  const userWidth = Math.max(...xs) - Math.min(...xs); const userHeight = Math.max(...ys) - Math.min(...ys);
  const targetBounds = alphaBounds(data, width, height);
  const widthCoverage = targetBounds.width ? Math.min(1, userWidth / targetBounds.width) : 0;
  const heightCoverage = targetBounds.height ? Math.min(1, userHeight / targetBounds.height) : 0;
  const coverage = Math.sqrt(widthCoverage * heightCoverage);
  const density = Math.min(1, points.length / 80);
  return Math.max(0, Math.min(100, Math.round((precision * 0.68 + coverage * 0.22 + density * 0.10) * 100)));
}

function nearMask(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, radius: number): boolean {
  const step = 4;
  for (let dy = -radius; dy <= radius; dy += step) for (let dx = -radius; dx <= radius; dx += step) {
    if (dx * dx + dy * dy > radius * radius) continue;
    const px = x + dx; const py = y + dy;
    if (px < 0 || py < 0 || px >= width || py >= height) continue;
    if (data[(py * width + px) * 4 + 3] > 24) return true;
  }
  return false;
}

function alphaBounds(data: Uint8ClampedArray, width: number, height: number): { width: number; height: number } {
  let minX = width; let maxX = 0; let minY = height; let maxY = 0;
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) if (data[(y * width + x) * 4 + 3] > 24) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return { width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}
