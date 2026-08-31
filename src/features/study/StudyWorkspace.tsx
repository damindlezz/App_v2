'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CourseTrack, JourneyStatus, LearningHealth } from '../../types/models';
import type { CoursePathRuntimeModel, LearningPathChapterState, LearningPathUnitState } from '../../shared/learning-path';
import { buildModuleHealthIndex, journeyStateFor, journeyStatusFor, moduleHealth, resolveJourneyModule, setJourneyPosition } from '../../shared/study-journey';
import { courseTrackLabel, FIQH_STUDY_TRACKS, fiqhTrackForSchool, isIslamicStudyTrack } from '../../shared/course-track-meta';
import { findCourseModule } from '../../shared/course-module';
import { useAppContent, useAppLearning, useAppProgress } from '../../state/AppProvider';
import { Icon, type IconName } from '../../components/ui/Icon';
import { StudyLedgerHeader, StudyLedgerProgress, StudyLedgerReview, StudyLedgerShell } from './StudyLedgerPrimitives';
import { StudyContextRail as ContextRail, type StudyContextState } from './StudyContextRail';
import { ArabicText } from '../../components/ui/ArabicText';
import { href, ROUTES } from '../../components/shell/routes';
import { courseHomeHref } from '../learn/course-route';

export interface StudyCompetency {
  code?: string;
  title: string;
  text: string;
}

interface Props {
  track: CourseTrack;
  model: CoursePathRuntimeModel;
  fushaModel?: CoursePathRuntimeModel | null;
  eyebrow: string;
  title: string;
  description: string;
  competencies?: readonly StudyCompetency[];
  backLabel?: string;
  onBack?: () => void;
}

type StudyArea = 'arabic' | 'quran' | 'knowledge' | 'hifz';

const AREA_META: Record<StudyArea, { label: string; icon: IconName }> = {
  arabic: { label: 'Arabisch', icon: 'layers' },
  quran: { label: 'Quran', icon: 'book' },
  knowledge: { label: 'Islamische Wissenschaften', icon: 'compass' },
  hifz: { label: 'Hifz', icon: 'target' }
};

export function StudyWorkspace({ track, model, fushaModel, eyebrow, title, description, competencies = [], backLabel, onBack }: Props) {
  const router = useRouter();
  const { content } = useAppContent();
const { progress, patchProgress } = useAppProgress();
const { reviewItems } = useAppLearning();
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const resolved = useMemo(() => resolveJourneyModule(model.modules, progress, track), [model.modules, progress, track]);
  const [selectedId, setSelectedId] = useState<string | null>(resolved?.unit.id ?? null);
  const selected = model.modules.find((item) => item.unit.id === selectedId) ?? resolved ?? model.modules[0] ?? null;
  const selectedChapter = selected ? model.chapters.find((item) => item.chapter.id === selected.chapter.id) ?? null : null;
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(selectedChapter?.chapter.id ?? model.chapters[0]?.chapter.id ?? null);
  const healthIndex = useMemo(() => content ? buildModuleHealthIndex(content, reviewItems) : new Map(), [content, reviewItems]);
  const overall = model.modules.length ? Math.round(model.modules.reduce((sum, item) => sum + item.progress, 0) / model.modules.length) : 0;


  useEffect(() => {
    const next = resolveJourneyModule(model.modules, progress, track);
    if (!selectedId || !model.modules.some((item) => item.unit.id === selectedId)) setSelectedId(next?.unit.id ?? null);
  }, [model.modules, progress, selectedId, track]);

  useEffect(() => {
    if (!selected) return;
    setExpandedChapterId((current) => current ?? selected.chapter.id);
    const stored = journeyStateFor(progress, track);
    if (stored?.currentModuleId === selected.unit.id && stored?.currentChapterId === selected.chapter.id) return;
    void patchProgress((draft) => setJourneyPosition(draft, track, selected.chapter.id, selected.unit.id), ['journeyStates']);
  }, [patchProgress, progress, selected, track]);

  async function selectModule(item: LearningPathUnitState) {
    if (item.status === 'locked') return;
    setSelectedId(item.unit.id);
    setExpandedChapterId(item.chapter.id);
    setLedgerOpen(false);
    await patchProgress((draft) => setJourneyPosition(draft, track, item.chapter.id, item.unit.id), ['journeyStates']);
  }

  async function openModule(item = selected) {
    if (!item || item.status === 'locked') return;
    await patchProgress((draft) => setJourneyPosition(draft, track, item.chapter.id, item.unit.id), ['journeyStates']);
    router.push(href(ROUTES.module, { id: item.unit.id }));
  }

  const prerequisiteLabels = useMemo(() => {
    if (!content || !selected) return [] as Array<{ id: string; label: string; done: boolean }>;
    const fushaById = new Map((fushaModel?.modules ?? []).map((item) => [item.unit.id, item]));
    return selected.unit.prerequisiteIds.map((id) => {
      const record = findCourseModule(content, id);
      const bridge = fushaById.get(id);
      return {
        id,
        label: record?.unit.title ?? id.replace(/^chapter:/, 'Kapitel '),
        done: bridge ? bridge.examPassed : !selected.missingPrerequisites.includes(id)
      };
    });
  }, [content, fushaModel, selected]);

  const selectedHealth = selected ? moduleHealth(healthIndex, selected.unit.id) : { health: 'stable' as LearningHealth, dueCount: 0, weakCount: 0, lowestMastery: null };

  return <div className="study-workspace">
    <div className="study-mobile-bar">
      <button onClick={() => setLedgerOpen(true)}><Icon name="layers" size={18}/> Pfad</button>
      <span>{selected?.unit.title ?? title}</span>
      <button onClick={() => setContextOpen(true)}>Kontext <Icon name="more" size={18}/></button>
    </div>

    <StudyLedger
      className={ledgerOpen ? 'is-mobile-open' : ''}
      track={track}
      model={model}
      fushaModel={fushaModel}
      overall={overall}
      selectedId={selected?.unit.id ?? null}
      expandedChapterId={expandedChapterId}
      healthIndex={healthIndex}
      backLabel={backLabel}
      onBack={onBack}
      onClose={() => setLedgerOpen(false)}
      onExpand={setExpandedChapterId}
      onSelect={(item) => { void selectModule(item); }}
      onOpen={(item) => { void openModule(item); }}
    />

    <StudyCanvas
      eyebrow={eyebrow}
      title={title}
      description={description}
      selected={selected}
      chapter={selectedChapter}
      health={selectedHealth.health}
      onOpen={() => { void openModule(); }}
      onChapterExam={() => selectedChapter && router.push(href(ROUTES.practice, { chapter: selectedChapter.chapter.id }))}
    />

    <CourseContextRail
      open={contextOpen}
      track={track}
      title={title}
      selected={selected}
      chapter={selectedChapter}
      health={selectedHealth}
      prerequisites={prerequisiteLabels}
      competencies={competencies}
      onClose={() => setContextOpen(false)}
      onReview={() => router.push(ROUTES.review)}
    />
    {(ledgerOpen || contextOpen) && <button className="study-mobile-backdrop" aria-label="Schliessen" onClick={() => { setLedgerOpen(false); setContextOpen(false); }}/>} 
  </div>;
}

interface LedgerProps {
  className?: string;
  track: CourseTrack;
  model: CoursePathRuntimeModel;
  fushaModel?: CoursePathRuntimeModel | null;
  overall: number;
  selectedId: string | null;
  expandedChapterId: string | null;
  healthIndex: Map<string, { health: LearningHealth; dueCount: number; weakCount: number; lowestMastery: number | null }>;
  backLabel?: string;
  onBack?: () => void;
  onClose: () => void;
  onExpand: (id: string) => void;
  onSelect: (item: LearningPathUnitState) => void;
  onOpen: (item: LearningPathUnitState) => void;
}

function StudyLedger({ className = '', track, model, fushaModel, overall, selectedId, expandedChapterId, healthIndex, backLabel, onBack, onClose, onExpand, onSelect, onOpen }: LedgerProps) {
  const router = useRouter();
  const { progress } = useAppProgress();
  const area = areaForTrack(track);
  const currentChapter = model.chapters.find((chapter) => chapter.chapter.id === expandedChapterId) ?? model.chapters.find((chapter) => chapter.modules.some((item) => item.unit.id === selectedId)) ?? model.chapters[0];
  const progressLabel = track === 'fusha' ? currentChapter?.chapter.levelLabel ?? 'A0' : track === 'quran' ? currentChapter?.chapter.quranLevel ?? 'Q0' : currentChapter?.chapter.studyLevel ?? 'S0';

  function switchArea(next: StudyArea) {
    if (next === 'arabic') router.push(ROUTES.learn);
    else if (next === 'quran') router.push(href(ROUTES.quran, { mode: 'verstehen' }));
    else if (next === 'hifz') router.push(ROUTES.hifz);
    else router.push(href(ROUTES.knowledge, { track: fiqhTrackForSchool(progress.preferences.primaryFiqhSchool) }));
  }

  return <StudyLedgerShell className={`study-ledger ${className}`} mainClassName="study-ledger-main">
      <StudyLedgerHeader onClose={onClose}/>
      {backLabel && onBack && <button className="study-ledger-back" onClick={onBack}><Icon name="chevron" size={14}/>{backLabel}</button>}
      <span className="study-ledger-kicker">Aktiver Bereich</span>
      <details className="study-area-switch">
        <summary><span><Icon name={AREA_META[area].icon} size={18}/>{AREA_META[area].label}</span><Icon name="chevron" size={17}/></summary>
        <div className="study-area-menu">{(Object.keys(AREA_META) as StudyArea[]).map((item) => <button key={item} className={item === area ? 'is-active' : ''} onClick={() => switchArea(item)}><Icon name={AREA_META[item].icon} size={17}/><span>{AREA_META[item].label}</span>{item === area && <Icon name="check" size={15}/>}</button>)}</div>
      </details>

      {isIslamicStudyTrack(track) && <KnowledgeTrackSwitch track={track} onTrack={(next) => router.push(courseHomeHref(next))}/>}

      <StudyLedgerProgress label={progressLabel} value={overall}/>

      <div className="study-ledger-path">{model.chapters.map((chapter, chapterIndex) => {
        const expanded = chapter.chapter.id === expandedChapterId;
        const chapterActive = chapter.modules.some((item) => item.unit.id === selectedId);
        const chapterStatus: JourneyStatus = chapterActive ? 'active' : chapter.examPassed ? 'completed' : chapter.locked ? 'locked' : 'available';
        const completedModules = chapter.modules.filter((item) => item.examPassed).length;
        return <section className={`study-ledger-chapter is-${chapterStatus}${expanded ? ' is-expanded' : ''}`} key={chapter.chapter.id}>
          <button className="study-ledger-chapter-head" onClick={() => onExpand(chapter.chapter.id)}>
            <StatusNode status={chapterStatus}/>
            <span><small>{chapter.chapter.levelLabel}</small><strong>{chapter.chapter.title}</strong></span>
            <em>{completedModules}/{chapter.modules.length}</em>
            <Icon name="chevron" size={16}/>
          </button>
          {expanded && <div className="study-ledger-modules">{chapter.modules.map((item) => {
            const status = journeyStatusFor(item, selectedId);
            const health = moduleHealth(healthIndex, item.unit.id);
            const bridges = track === 'quran' ? item.unit.prerequisiteIds.filter((id) => fushaModel?.modules.some((bridge) => bridge.unit.id === id)) : [];
            return <div className={`study-ledger-module is-${status}`} key={item.unit.id}>
              <button className="study-ledger-module-select" disabled={status === 'locked'} onClick={() => onSelect(item)}>
                <StatusNode status={status}/>
                <span className="study-ledger-module-copy"><strong>{item.unit.title}</strong>{status === 'active' && <small>{item.unit.objective}</small>}{bridges.length > 0 && <small className="study-bridge-label">◆ Arabisch-Brücke · {bridges.length}</small>}</span>
                <span className="study-ledger-module-time">{item.unit.estimatedMinutes}′</span>
                <HealthMark health={health.health} dueCount={health.dueCount}/>
                {status === 'active' && <span className="study-ledger-module-open" onClick={(event) => { event.stopPropagation(); onOpen(item); }}>Öffnen <Icon name="arrow" size={13}/></span>}
              </button>
            </div>;
          })}
          <div className={`study-ledger-gate ${chapter.examPassed ? 'is-complete' : chapter.examReady ? 'is-ready' : 'is-locked'}`}>
            <span className="study-ledger-gate-node"><Icon name={chapter.examPassed ? 'check' : chapter.examReady ? 'target' : 'lock'} size={14}/></span>
            <div><small>Kompetenz-Gate · Kapitel-Check</small><strong>{chapter.chapter.exam.title}</strong></div>
            <span>{chapter.examPassed ? `${chapter.examScore}%` : chapter.examReady ? 'bereit' : `${chapter.modules.filter((item) => !item.examPassed).length} offen`}</span>
          </div>
          </div>}
          {!expanded && chapterIndex < model.chapters.length - 1 && <span className="study-ledger-connector"/>}
        </section>;
      })}</div>

      <StudyLedgerReview onOpen={() => router.push(ROUTES.review)}/>
  </StudyLedgerShell>;
}

function KnowledgeTrackSwitch({ track, onTrack }: { track: CourseTrack; onTrack: (track: CourseTrack) => void }) {
  const { progress } = useAppProgress();
  const fiqh = (FIQH_STUDY_TRACKS as readonly CourseTrack[]).includes(track);
  const activeFiqh = fiqh ? track : fiqhTrackForSchool(progress.preferences.primaryFiqhSchool);
  const domain = fiqh ? 'fiqh' : track;
  function switchDomain(value: string) {
    if (value === 'fiqh') onTrack(activeFiqh);
    else onTrack(value as CourseTrack);
  }
  return <div className="study-track-stack">
    <label className="study-track-switch"><span>Fachgebiet</span><select value={domain} onChange={(event) => switchDomain(event.target.value)}><option value="fiqh">Fiqh</option><option value="usul_fiqh">Usul al-Fiqh</option><option value="hadith">Hadith</option><option value="usul_hadith">Usul al-Hadith</option></select></label>
    {fiqh && <label className="study-track-switch"><span>Madhhab Layer</span><select value={track} onChange={(event) => onTrack(event.target.value as CourseTrack)}>{FIQH_STUDY_TRACKS.map((item) => <option key={item} value={item}>{courseTrackLabel(item).replace(/^Fiqh . /, '')}</option>)}</select></label>}
  </div>;
}

function StudyCanvas({ eyebrow, title, description, selected, chapter, health, onOpen, onChapterExam }: {
  eyebrow: string;
  title: string;
  description: string;
  selected: LearningPathUnitState | null;
  chapter: LearningPathChapterState | null;
  health: LearningHealth;
  onOpen: () => void;
  onChapterExam: () => void;
}) {
  if (!selected || !chapter) return <main className="study-canvas"><div className="study-canvas-empty"><Icon name="check" size={34}/><h1>Lernpfad abgeschlossen</h1><p>Alle verfügbaren Module wurden bearbeitet.</p></div></main>;
  const practice = selected.phases.find((phase) => phase.phase.type === 'practice');
  const exam = selected.phases.find((phase) => phase.phase.type === 'exam');
  const nextStep = selected.learningSteps.find((step) => !['completed', 'mastered'].includes(step.status)) ?? selected.learningSteps[0];
  const healthText = health === 'review_due' ? 'Wiederholung fällig' : health === 'weak' ? 'Festigung empfohlen' : 'Lernstand stabil';
  return <main className="study-canvas">
    <header className="study-canvas-command"><span>{chapter.chapter.title}</span><Icon name="chevron" size={13}/><strong>{selected.unit.title}</strong><span className={`study-health-text is-${health}`}>{healthText}</span></header>
    <div className="study-canvas-body">
      <div className="study-canvas-course"><span>{eyebrow}</span><strong>{title}</strong><small>{description}</small></div>
      <section className="study-canvas-hero">
        <span className="study-canvas-eyebrow">{chapter.chapter.levelLabel} · Modul</span>
        <h1>{selected.unit.title}</h1>
        <p>{selected.unit.objective}</p>
        <div className="study-canvas-meta"><span><Icon name="clock" size={15}/>{selected.unit.estimatedMinutes} Min.</span><span>{selected.learningSteps.length} Lernschritte</span><span>{selected.progress}% Modulfortschritt</span></div>
      </section>

      <section className="study-cycle" aria-label="Lernzyklus">
        <CycleStep label="Lernen" value={selected.learningProgress} active={!selected.learningComplete}/>
        <i/>
        <CycleStep label="Üben" value={practice?.progress ?? 0} active={selected.learningComplete && !practice?.complete}/>
        <i/>
        <CycleStep label="Prüfen" value={selected.examPassed ? 100 : selected.examScore} active={Boolean(selected.requiredActivitiesComplete && !selected.examPassed)}/>
      </section>

      <section className="study-canvas-intro">
        <div><span className="study-canvas-eyebrow">{selected.unit.intro.title}</span><h2>{selected.unit.intro.summary}</h2></div>
        {selected.unit.intro.example.arabic && <ArabicText as="div" module={selected.unit.module === 'quran' ? 'quran' : 'grammar'} className="study-intro-arabic" text={selected.unit.intro.example.arabic}/>} 
        <p>{selected.unit.intro.example.text}</p>
        {selected.unit.intro.outcomes.length > 0 && <ul>{selected.unit.intro.outcomes.slice(0, 4).map((outcome) => <li key={outcome}><Icon name="check" size={14}/>{outcome}</li>)}</ul>}
      </section>

      <section className="study-step-sequence">
        <div className="study-section-heading"><span className="study-canvas-eyebrow">Lernsequenz</span><strong>{nextStep ? `Als Nächstes: ${nextStep.step.title}` : 'Lernteil abgeschlossen'}</strong></div>
        <ol>{selected.learningSteps.map((item, index) => <li key={item.step.id} className={`is-${item.status}`}><span>{item.status === 'completed' || item.status === 'mastered' ? <Icon name="check" size={13}/> : item.status === 'locked' ? <Icon name="lock" size={12}/> : index + 1}</span><div><strong>{item.step.title}</strong><small>{item.step.estimatedMinutes} Min. · {item.step.objective}</small></div></li>)}</ol>
      </section>

      <footer className="study-canvas-actions">
        <span>{selected.examPassed ? 'Modul abgeschlossen' : nextStep ? `Weiter mit „${nextStep.step.title}“` : 'Bereit zum Üben'}</span>
        <div>{chapter.examReady && <button className="study-action-secondary" onClick={onChapterExam}><Icon name="target" size={16}/> Kapitel-Check</button>}<button className="study-action-primary" onClick={onOpen}>Weiterlernen <Icon name="arrow" size={16}/></button></div>
      </footer>
    </div>
  </main>;
}

function CourseContextRail({ open, title, selected, chapter, health, prerequisites, onClose, onReview }: {
  open: boolean;
  track: CourseTrack;
  title: string;
  selected: LearningPathUnitState | null;
  chapter: LearningPathChapterState | null;
  health: { health: LearningHealth; dueCount: number; weakCount: number; lowestMastery: number | null };
  prerequisites: Array<{ id: string; label: string; done: boolean }>;
  competencies: readonly StudyCompetency[];
  onClose: () => void;
  onReview: () => void;
}) {
  const missing = prerequisites.filter((item) => !item.done);
  let state: StudyContextState;
  if (missing.length) {
    state = { kind: 'prerequisite', eyebrow: 'Voraussetzung', title: `${missing.length} Voraussetzung${missing.length === 1 ? '' : 'en'} offen`, description: selected?.unit.title ?? title, body: <div className="study-prerequisites">{missing.map((item) => <div key={item.id}><Icon name="lock" size={14}/><strong>{item.label}</strong><small>noch offen</small></div>)}</div> };
  } else if (health.health === 'review_due') {
    state = { kind: 'review', eyebrow: 'Review faellig', title: `${health.dueCount} Wiederholung${health.dueCount === 1 ? '' : 'en'}`, description: selected?.unit.title ?? title, status: chapter ? `Kapitel ${chapter.chapter.title}` : undefined, action: { label: 'Review oeffnen', onClick: onReview } };
  } else if (health.health === 'weak') {
    state = { kind: 'evidence', eyebrow: 'Festigen', title: selected?.unit.title ?? title, description: health.lowestMastery === null ? 'Schwache Evidenz erkannt.' : `Niedrigste Mastery ${health.lowestMastery}%.`, status: `${health.weakCount} schwache Evidenz${health.weakCount === 1 ? '' : 'en'}` };
  } else {
    state = { kind: 'focus', eyebrow: 'Aktueller Fokus', title: selected?.unit.title ?? title, description: selected?.unit.objective ?? 'Waehle im Study Ledger einen Lernschritt.', status: selected ? (selected.examPassed ? `Gate bestanden · ${selected.examScore}%` : `Gate-Ziel ${selected.unit.exam.passScore}%`) : undefined };
  }
  return <ContextRail state={state} open={open} onClose={onClose}/>;
}

function CycleStep({ label, value, active }: { label: string; value: number; active: boolean }) {
  const done = value >= 100;
  return <div className={`${done ? 'is-complete' : ''}${active ? ' is-active' : ''}`}><span>{done ? <Icon name="check" size={14}/> : Math.max(0, Math.min(100, Math.round(value)))}</span><strong>{label}</strong><small>{Math.round(value)}%</small></div>;
}

function StatusNode({ status }: { status: JourneyStatus }) {
  return <span className={`study-status-node is-${status}`}>{status === 'completed' ? <Icon name="check" size={13}/> : status === 'locked' ? <Icon name="lock" size={12}/> : status === 'active' ? <Icon name="arrow" size={12}/> : null}</span>;
}

function HealthMark({ health, dueCount }: { health: LearningHealth; dueCount: number }) {
  if (health === 'stable') return <span className="study-health-mark is-stable" title="Stabil"/>;
  return <span className={`study-health-mark is-${health}`} title={health === 'review_due' ? 'Review fällig' : 'Festigen'}>{health === 'review_due' ? <Icon name="repeat" size={12}/> : <Icon name="warning" size={12}/>} {dueCount > 0 ? <small>{dueCount}</small> : null}</span>;
}

function areaForTrack(track: CourseTrack): StudyArea {
  if (track === 'fusha') return 'arabic';
  if (track === 'quran') return 'quran';
  return 'knowledge';
}
