'use client';

import { useMemo, useState } from 'react';
import { Icon, type IconName } from '../../components/ui/Icon';
import { useAppPreferences, useAppProfile, useAppProgressActions, useAppRuntime } from '../../state/AppProvider';
import { resetCoursePosition } from '../../shared/course-track-meta';
import type { ArabicExperience, CefrLevel, CourseTrack, PrimaryLearningGoal } from '../../types/models';

interface GoalOption {
  id: PrimaryLearningGoal;
  title: string;
  subtitle: string;
  description: string;
  icon: IconName;
}

interface ExperienceOption {
  id: ArabicExperience;
  title: string;
  description: string;
}

interface PlacementQuestion {
  prompt: string;
  arabic?: string;
  options: string[];
  correct: string;
}

const GOALS: GoalOption[] = [
  { id: 'arabic', title: 'Arabisch lernen', subtitle: '0 bis C2', description: 'Schrift, Lesen, Wortschatz, Grammatik und aktive Sprache.', icon: 'layers' },
  { id: 'quran', title: 'Quran verstehen', subtitle: 'Q0 bis Q6', description: 'Arabische Grundlagen gezielt bis zur sprachlichen Quran-Analyse.', icon: 'book' },
  { id: 'hifz', title: 'Hifz', subtitle: 'Memorieren', description: 'Ayat systematisch lernen, abrufen und langfristig erhalten.', icon: 'target' },
  { id: 'knowledge', title: 'Islamische Wissenschaften', subtitle: 'Wissen', description: 'Fiqh, Usul und Hadith in strukturierten Fachpfaden.', icon: 'compass' }
];

const EXPERIENCE: ExperienceOption[] = [
  { id: 'none', title: 'Ich starte bei 0', description: 'Ich kenne die arabische Schrift noch nicht sicher.' },
  { id: 'letters', title: 'Ich kenne Buchstaben', description: 'Einzelne Buchstaben und Laute erkenne ich.' },
  { id: 'reading', title: 'Ich kann langsam lesen', description: 'Vokalisierte Wörter und kurze Sätze kann ich lesen.' },
  { id: 'basic', title: 'Ich habe Grundlagen', description: 'Ich kenne bereits Basiswortschatz und einfache Grammatik.' },
  { id: 'intermediate', title: 'Ich bin fortgeschritten', description: 'Ich lese sicher und kenne grundlegende Satzstrukturen.' }
];

const PLACEMENT: PlacementQuestion[] = [
  { prompt: 'Welcher Buchstabe ist Bāʾ?', options: ['ب', 'ت', 'ث', 'ن'], correct: 'ب' },
  { prompt: 'Wie liest man diese Silbe?', arabic: 'بِ', options: ['ba', 'bi', 'bu', 'bā'], correct: 'bi' },
  { prompt: 'Was bedeutet dieses Wort?', arabic: 'كِتَابٌ', options: ['Buch', 'Haus', 'Schule', 'Stift'], correct: 'Buch' },
  { prompt: 'Welche Bedeutung passt?', arabic: 'أَنَا طَالِبٌ', options: ['Ich bin Schüler.', 'Er ist Lehrer.', 'Das ist ein Buch.', 'Wir lernen.'], correct: 'Ich bin Schüler.' },
  { prompt: 'Welcher Satz bedeutet „Das Buch ist neu“?', options: ['الْكِتَابُ جَدِيدٌ', 'الْبَيْتُ كَبِيرٌ', 'الطَّالِبُ مُجْتَهِدٌ', 'هٰذَا قَلَمٌ'], correct: 'الْكِتَابُ جَدِيدٌ' }
];

const DAILY_MINUTES = [10, 15, 20, 30, 45];
const LEVEL_RANK: CefrLevel[] = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function OnboardingFlow() {
  const { profile } = useAppProfile();
  const { preferences } = useAppPreferences();
  const { patchProgress } = useAppProgressActions();
  const { busy } = useAppRuntime();
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<PrimaryLearningGoal>(preferences.primaryLearningGoal ?? 'quran');
  const [experience, setExperience] = useState<ArabicExperience>(preferences.onboardingExperience ?? 'none');
  const [minutes, setMinutes] = useState(preferences.dailyGoalMinutes || 15);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const placementRequired = experience !== 'none';
  const totalSteps = placementRequired ? 5 : 4;
  const visibleStep = placementRequired ? step : step === 4 ? 3 : step;
  const score = useMemo(() => {
    if (!placementRequired) return 0;
    const correct = PLACEMENT.filter((question, index) => answers[index] === question.correct).length;
    return Math.round(correct / PLACEMENT.length * 100);
  }, [answers, placementRequired]);
  const currentLevel = placementLevel(score, experience);
  const targetLevel = targetForGoal(goal, currentLevel);

  async function finish() {
    const knowledgeTrack = knowledgeTrackFor(preferences.primaryFiqhSchool);
    await patchProgress((draft) => {
      draft.preferences.onboardingComplete = true;
      draft.preferences.onboardingVersion = 1;
      draft.preferences.primaryLearningGoal = goal;
      draft.preferences.onboardingExperience = experience;
      draft.preferences.placementScore = placementRequired ? score : 0;
      draft.preferences.currentLevel = currentLevel;
      draft.preferences.targetLevel = targetLevel;
      draft.preferences.dailyGoalMinutes = minutes;
      draft.preferences.learningPathMode = 'guided';
      draft.preferences.contentLevelScope = 'up_to_target';
      draft.preferences.enabledTracks = goal === 'knowledge'
        ? ['fusha', 'quran', knowledgeTrack]
        : ['fusha', 'quran'];
      const initialTrack = goal === 'knowledge' ? knowledgeTrack : goal === 'arabic' ? 'fusha' : 'quran';
      resetCoursePosition(draft, initialTrack);
    }, ['preferences', 'journeyStates']);
  }

  function next() {
    if (!placementRequired && step === 2) setStep(4);
    else setStep((value) => Math.min(4, value + 1));
  }
  function back() {
    if (!placementRequired && step === 4) setStep(2);
    else setStep((value) => Math.max(0, value - 1));
  }

  return <div className="onboarding-shell">
    <section className="onboarding-card">
      <header className="onboarding-head">
        <div className="onboarding-brand"><span>✦</span><div><strong>NŪR</strong><small>Dein persönlicher Lernweg · نُور</small></div></div>
        <div className="onboarding-progress" aria-label={`Schritt ${visibleStep + 1} von ${totalSteps}`}><i style={{ width: `${((visibleStep + 1) / totalSteps) * 100}%` }}/></div>
      </header>

      {step === 0 && <div className="onboarding-step">
        <div className="onboarding-title"><span>1 · Ziel</span><h1>Was möchtest du erreichen?</h1><p>Dein Hauptziel bestimmt den empfohlenen nächsten Schritt. Alle Bereiche bleiben jederzeit zugänglich.</p></div>
        <div className="onboarding-goals">{GOALS.map((item) => <button key={item.id} className={goal === item.id ? 'is-selected' : ''} onClick={() => setGoal(item.id)}><span><Icon name={item.icon} size={22}/></span><div><small>{item.subtitle}</small><strong>{item.title}</strong><p>{item.description}</p></div>{goal === item.id && <Icon name="check" size={18}/>}</button>)}</div>
      </div>}

      {step === 1 && <div className="onboarding-step">
        <div className="onboarding-title"><span>2 · Startpunkt</span><h1>Wo stehst du aktuell?</h1><p>Damit überspringst du nichts Wichtiges und wiederholst nicht unnötig.</p></div>
        <div className="experience-list">{EXPERIENCE.map((item) => <button key={item.id} className={experience === item.id ? 'is-selected' : ''} onClick={() => setExperience(item.id)}><span className="experience-dot"/><div><strong>{item.title}</strong><p>{item.description}</p></div></button>)}</div>
      </div>}

      {step === 2 && <div className="onboarding-step">
        <div className="onboarding-title"><span>3 · Rhythmus</span><h1>Wie viel Zeit passt täglich?</h1><p>Die Heute-Seite priorisiert Inhalte so, dass dein Plan realistisch bleibt.</p></div>
        <div className="minutes-grid">{DAILY_MINUTES.map((value) => <button key={value} className={minutes === value ? 'is-selected' : ''} onClick={() => setMinutes(value)}><strong>{value}</strong><span>Minuten</span></button>)}</div>
        <div className="onboarding-note"><Icon name="clock" size={18}/><span>Empfehlung: 15–30 Minuten regelmäßig sind sinnvoller als seltene lange Sitzungen.</span></div>
      </div>}

      {step === 3 && placementRequired && <div className="onboarding-step">
        <div className="onboarding-title"><span>4 · Einstufung</span><h1>Kurzer Standortcheck</h1><p>5 Aufgaben. Das Ergebnis setzt nur deinen Startpunkt und kann später geändert werden.</p></div>
        <div className="placement-list">{PLACEMENT.map((question, index) => <article key={question.prompt}><div><b>{index + 1}</b><div><strong>{question.prompt}</strong>{question.arabic && <span dir="rtl">{question.arabic}</span>}</div></div><div className="placement-options">{question.options.map((option) => <button key={option} className={answers[index] === option ? 'is-selected' : ''} onClick={() => setAnswers((current) => ({ ...current, [index]: option }))}>{option}</button>)}</div></article>)}</div>
      </div>}

      {step === 4 && <div className="onboarding-step onboarding-summary">
        <div className="onboarding-title"><span>{placementRequired ? '5' : '4'} · Lernplan</span><h1>Dein Start ist vorbereitet.</h1><p>Die App führt dich ab jetzt über genau einen empfohlenen nächsten Schritt.</p></div>
        <div className="plan-summary">
          <div><span>Hauptziel</span><strong>{GOALS.find((item) => item.id === goal)?.title}</strong></div>
          <div><span>Startniveau</span><strong>{currentLevel}</strong>{placementRequired && <small>{score}% Einstufung</small>}</div>
          <div><span>Zielniveau Arabisch</span><strong>{targetLevel}</strong></div>
          <div><span>Tagesziel</span><strong>{minutes} Min.</strong></div>
        </div>
        <div className="plan-path"><span className="plan-node is-active">Start</span><i/><span className="plan-node">Arabisch</span><i/><span className="plan-node">Quran anwenden</span><i/><span className="plan-node">Verstehen</span></div>
        <p className="plan-explainer">{planText(goal, currentLevel)}</p>
      </div>}

      <footer className="onboarding-footer">
        <button className="button button--ghost" disabled={step === 0 || busy} onClick={back}>Zurück</button>
        {step < 4 ? <button className="button button--primary" disabled={step === 3 && placementRequired && Object.keys(answers).length < PLACEMENT.length} onClick={next}>Weiter <Icon name="arrow" size={17}/></button> : <button className="button button--primary" disabled={busy} onClick={() => void finish()}>Lernplan starten <Icon name="play" size={17}/></button>}
      </footer>
    </section>
  </div>;
}

function placementLevel(score: number, experience: ArabicExperience): CefrLevel {
  if (experience === 'none') return 'A0';
  const measured: CefrLevel = score <= 20 ? 'A0' : score <= 40 ? 'A1' : score <= 60 ? 'A2' : score <= 80 ? 'B1' : 'B2';
  const ceiling: Record<ArabicExperience, CefrLevel> = { none: 'A0', letters: 'A1', reading: 'A2', basic: 'B1', intermediate: 'B2' };
  return LEVEL_RANK.indexOf(measured) > LEVEL_RANK.indexOf(ceiling[experience]) ? ceiling[experience] : measured;
}

function targetForGoal(goal: PrimaryLearningGoal, current: CefrLevel): CefrLevel {
  const desired: CefrLevel = goal === 'arabic' ? 'C2' : goal === 'quran' ? 'B2' : goal === 'hifz' ? 'A2' : 'B1';
  return LEVEL_RANK.indexOf(current) > LEVEL_RANK.indexOf(desired) ? current : desired;
}

function knowledgeTrackFor(school: string): CourseTrack {
  if (school === 'maliki') return 'fiqh_maliki';
  if (school === 'shafii') return 'fiqh_shafii';
  if (school === 'hanbali') return 'fiqh_hanbali';
  return 'fiqh_hanafi';
}

function planText(goal: PrimaryLearningGoal, level: CefrLevel): string {
  if (goal === 'quran') return `Start auf ${level}. Arabisch-Grundlagen und Quran-Kompetenzen werden verzahnt, damit jede neue Sprachstruktur direkt an Quran-Beispielen angewendet wird.`;
  if (goal === 'hifz') return `Start auf ${level}. Der Hifz-Bereich bleibt dein Hauptfokus; notwendige Lese- und Sprachgrundlagen werden gezielt vorgeschaltet.`;
  if (goal === 'knowledge') return `Start auf ${level}. Fachwissen ist dein Hauptfokus; Arabisch und Quran bleiben als ergänzende Lernpfade erreichbar.`;
  return `Start auf ${level}. Der Arabisch-Pfad führt schrittweise von Schrift und Lesen über Wortschatz und Grammatik bis zur fortgeschrittenen Sprachkompetenz.`;
}
