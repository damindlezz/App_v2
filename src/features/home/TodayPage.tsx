'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buildCoursePathModel, recommendedLearningUnit, type LearningPathChapterState, type LearningPathUnitState } from '../../shared/learning-path';
import { ISLAMIC_STUDY_TRACKS, enabledCourseTracks, fiqhTrackForSchool, isIslamicStudyTrack } from '../../shared/course-track-meta';
import { journeyStateFor, mostRecentJourneyTrack } from '../../shared/study-journey';
import { createDailyChallenge, dailyChallengeDayKey } from '../../services/learning/daily-challenge-service';
import { getDailyImpulseById, impulseDayKey, selectAlternativeImpulse, selectDailyImpulse } from '../../shared/daily-impulses';
import { useAppContent, useAppLearning, useAppProfile, useAppProgress, useAppRuntime } from '../../state/AppProvider';
import { Icon, type IconName } from '../../components/ui/Icon';
import { ROUTES, href } from '../../components/shell/routes';
import { buildUnifiedReviewQueue } from '../../services/review/review-planner';
import type { PrimaryLearningGoal } from '../../types/models';
import { StudyUtilityFrame } from '../study/StudyUtilityFrame';
import { ReferenceDashboardExtras } from './ReferenceDashboardExtras';

interface FocusAction {
  eyebrow: string;
  title: string;
  text: string;
  meta: string[];
  icon: IconName;
  action: string;
  href: string;
}

export function TodayPage() {
  const { content, ensureIslamicTrack } = useAppContent();
const { progress, patchProgress } = useAppProgress();
const { contentProgress, reviewSummary, sessionSummary, reviewItems, exerciseResults } = useAppLearning();
const { profile } = useAppProfile();
const { hydrated } = useAppRuntime();
  const router = useRouter();
  const primaryGoal = progress.preferences.primaryLearningGoal ?? 'quran';

  const tracks = enabledCourseTracks(progress.preferences.enabledTracks);
  const enabledKnowledgeTracks = tracks.filter(isIslamicStudyTrack);
  const preferredKnowledgeTrack = fiqhTrackForSchool(progress.preferences.primaryFiqhSchool);
  const activeKnowledgeTrack = mostRecentJourneyTrack(progress, enabledKnowledgeTracks)
    ?? (enabledKnowledgeTracks.includes(preferredKnowledgeTrack) ? preferredKnowledgeTrack : enabledKnowledgeTracks[0] ?? preferredKnowledgeTrack);

  useEffect(() => { if (primaryGoal === 'knowledge') void ensureIslamicTrack(activeKnowledgeTrack).catch(()=>undefined); }, [activeKnowledgeTrack, ensureIslamicTrack, primaryGoal]);

  useEffect(() => {
    if (!content || !profile || !hydrated) return;
    const cDate = dailyChallengeDayKey();
    const iDate = impulseDayKey();
    const challengeMissing = progress.dailyChallenge?.date !== cDate;
    const impulseMissing = progress.dailyImpulseDate !== iDate || !getDailyImpulseById(progress.dailyImpulseId);
    if (!challengeMissing && !impulseMissing) return;
    const challenge = challengeMissing ? createDailyChallenge(profile.id, content, progress, contentProgress, reviewItems, exerciseResults) : progress.dailyChallenge;
    const impulse = impulseMissing ? selectDailyImpulse(profile.id, new Date(), progress.impulseRecentIds) : null;
    // Only patch when there is actually something new to write. `createDailyChallenge`
    // can legitimately return null (e.g. content for the active track isn't hydrated yet).
    // Calling patchProgress unconditionally in that case creates a fresh cloned progress
    // object on every render without ever resolving `challengeMissing`, which re-triggers
    // this effect indefinitely ("Maximum update depth exceeded") and freezes the whole app,
    // including navigation.
    const willSetChallenge = challengeMissing && Boolean(challenge);
    const willSetImpulse = impulseMissing && Boolean(impulse);
    if (!willSetChallenge && !willSetImpulse) return;
    void patchProgress((draft) => {
      if (willSetChallenge) draft.dailyChallenge = challenge;
      if (willSetImpulse && impulse) {
        draft.dailyImpulseDate = iDate;
        draft.dailyImpulseId = impulse.id;
        draft.impulseRecentIds = [impulse.id, ...draft.impulseRecentIds.filter((id) => id !== impulse.id)].slice(0, 8);
      }
    }, ['impulses', 'dailyChallenge']);
  }, [content, contentProgress, exerciseResults, hydrated, patchProgress, profile, progress.dailyChallenge?.date, progress.dailyImpulseDate, progress.dailyImpulseId, progress.impulseRecentIds, reviewItems]);

  const models = useMemo(() => content ? tracks.map((track) => ({ track, model: buildCoursePathModel(content, progress, contentProgress, reviewSummary, track) })) : [], [content, contentProgress, progress, reviewSummary, tracks.join('|')]);
  const arabicModel = useMemo(() => content ? buildCoursePathModel(content, progress, contentProgress, reviewSummary, 'fusha') : null, [content, contentProgress, progress, reviewSummary]);
  const quranModel = useMemo(() => content ? buildCoursePathModel(content, progress, contentProgress, reviewSummary, 'quran') : null, [content, contentProgress, progress, reviewSummary]);
  const unifiedReview = useMemo(() => buildUnifiedReviewQueue(reviewItems, progress.quranHifzEntries, progress.quranHifzWordEntries), [progress.quranHifzEntries, progress.quranHifzWordEntries, reviewItems]);

  if (!content || !profile) return null;

  const profileId = profile.id;
  const activeTrack = primaryGoal === 'arabic' ? 'fusha' : primaryGoal === 'quran' ? 'quran' : primaryGoal === 'knowledge' ? activeKnowledgeTrack : null;
  const activeModel = primaryGoal === 'arabic'
    ? arabicModel
    : primaryGoal === 'quran'
      ? quranModel
      : primaryGoal === 'knowledge'
        ? models.find((item) => item.track === activeKnowledgeTrack)?.model ?? null
        : null;
  const storedModuleId = activeTrack ? journeyStateFor(progress, activeTrack)?.currentModuleId : null;
  const stored = activeModel?.modules.find((item) => item.unit.id === storedModuleId) ?? null;
  const current = stored && ['available', 'in_progress', 'exam_ready'].includes(stored.status)
    ? stored
    : activeModel ? recommendedLearningUnit(activeModel.modules, progress.preferences.currentLevel) : null;
  const chapterGate = !current ? activeModel?.chapters.find((item) => item.examReady) ?? null : null;
  const hifzDue = unifiedReview.filter((item) => item.kind === 'hifz_ayah' || item.kind === 'hifz_word').length;
  const goalMinutes = Math.max(5, progress.preferences.dailyGoalMinutes);
  const goalPercent = Math.min(100, Math.round(sessionSummary.minutesToday / goalMinutes * 100));
  const focus = focusFor(primaryGoal, current, chapterGate, hifzDue, progress.quranHifzEntries.length, progress.preferences.currentLevel, progress.hifzStudyState.reference);
  const challenge = progress.dailyChallenge?.date === dailyChallengeDayKey() ? progress.dailyChallenge : null;
  const impulse = progress.dailyImpulseDate === impulseDayKey() ? getDailyImpulseById(progress.dailyImpulseId) : null;
  const arabicOverall = overall(arabicModel?.modules.map((item) => item.progress) ?? []);
  const quranOverall = overall(quranModel?.modules.map((item) => item.progress) ?? []);

  const areas: Array<{ title: string; eyebrow: string; text: string; metric: string; icon: IconName; href: string; id: PrimaryLearningGoal }> = [
    { id: 'arabic', title: 'Arabisch lernen', eyebrow: '0 bis C2', text: 'Schrift, Lesen, Wortschatz, Grammatik und Satzbau.', metric: `${arabicOverall}%`, icon: 'layers', href: ROUTES.learn },
    { id: 'quran', title: 'Quran verstehen', eyebrow: 'Q0 bis Q6', text: 'Sprachkompetenz direkt auf Quran-Text anwenden.', metric: `${quranOverall}%`, icon: 'book', href: href(ROUTES.quran, { mode: 'verstehen' }) },
    { id: 'hifz', title: 'Hifz', eyebrow: 'Memorieren', text: 'Neue Ayat lernen, abrufen und langfristig erhalten.', metric: `${progress.quranHifzEntries.length} Ayat`, icon: 'target', href: ROUTES.hifz },
    { id: 'knowledge', title: 'Islamische Wissenschaften', eyebrow: 'Wissen', text: 'Fiqh, Usul und Hadith in klaren Fachpfaden.', metric: `${ISLAMIC_STUDY_TRACKS.length} Pfade`, icon: 'compass', href: ROUTES.knowledge }
  ];

  async function nextImpulse() {
    if (!impulse) return;
    const next = selectAlternativeImpulse(impulse.id, profileId, new Date(), progress.impulseRecentIds);
    await patchProgress((draft) => {
      draft.dailyImpulseDate = impulseDayKey();
      draft.dailyImpulseId = next.id;
      draft.impulseRecentIds = [next.id, impulse.id, ...draft.impulseRecentIds.filter((id) => id !== next.id && id !== impulse.id)].slice(0, 8);
    }, ['impulses']);
  }

  return <StudyUtilityFrame active="today"><div className="today-page">
    <header className="today-header">
      <div><span>HEUTE</span><h1>As-salamu 'alaykum, {profile.name}</h1><p>Ein Fokus. Danach entscheidet dein Lernplan den nächsten sinnvollen Schritt.</p></div>
      <div className="today-date">{new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date())}</div>
    </header>

    <section className="today-focus">
      <div className="today-focus__icon"><Icon name={focus.icon} size={28}/></div>
      <div className="today-focus__body"><span className="section-eyebrow">{focus.eyebrow}</span><h2>{focus.title}</h2><p>{focus.text}</p><div className="today-focus__meta">{focus.meta.map((item) => <span key={item}>{item}</span>)}</div><button className="button button--primary" onClick={() => router.push(focus.href)}>{focus.action} <Icon name="arrow" size={17}/></button></div>
      <div className="today-focus__signal"><span>{goalPercent}%</span><small>Tagesziel</small></div>
    </section>

    <section className="today-secondary" aria-label="Heute zusätzlich">
      <article><div><Icon name="clock" size={18}/><span>Tagesziel</span></div><strong>{sessionSummary.minutesToday}<small> / {goalMinutes} Min.</small></strong><i><em style={{ width: `${goalPercent}%` }}/></i></article>
      <Link href={ROUTES.review}><div><Icon name="repeat" size={18}/><span>Wiederholen</span></div><strong>{unifiedReview.length}<small> fällig</small></strong><b>Öffnen <Icon name="arrow" size={14}/></b></Link>
      <Link href={ROUTES.hifz}><div><Icon name="target" size={18}/><span>Hifz</span></div><strong>{hifzDue}<small> fällig</small></strong><b>Öffnen <Icon name="arrow" size={14}/></b></Link>
    </section>

    <section className="core-goals">
      <div className="core-goals__head"><span className="section-eyebrow">Lernbereiche</span><h2>Vier Ziele. Ein gemeinsamer Lernplan.</h2></div>
      <div className="core-goal-grid">{areas.map((item) => <Link key={item.id} href={item.href} className={item.id === primaryGoal ? 'is-primary' : ''}><span className="core-goal-icon"><Icon name={item.icon} size={20}/></span><div><small>{item.eyebrow}{item.id === primaryGoal ? ' · Hauptziel' : ''}</small><strong>{item.title}</strong><p>{item.text}</p></div><b>{item.metric}</b><Icon name="arrow" size={16}/></Link>)}</div>
    </section>

    <section className="today-lower">
      {challenge && <article className="today-challenge"><div><span className="section-eyebrow">Aufgabe des Tages · {challenge.reasonLabel}</span><h2>{challenge.title}</h2><p>{challenge.description}</p><small>{challenge.itemCount} Aufgaben · ca. {challenge.estimatedMinutes} Min.</small></div><button className="button button--secondary" onClick={() => router.push(href(ROUTES.practice, { challenge: challenge.id }))}>{challenge.status === 'completed' ? 'Nochmal' : 'Starten'} <Icon name="arrow" size={17}/></button></article>}
      {impulse && <article className="today-impulse"><div className="today-impulse__head"><span className="section-eyebrow">Impuls · {impulse.type === 'quran' ? 'Quran' : 'Hadith'}</span><button className="icon-button" onClick={() => void nextImpulse()} title="Anderen Impuls"><Icon name="repeat" size={17}/></button></div><p dir="rtl" className="arabic-text">{impulse.arabic}</p><blockquote>{impulse.translation}</blockquote><small>{impulse.source}</small></article>}
    </section>

    <ReferenceDashboardExtras />
  </div></StudyUtilityFrame>;
}

function focusFor(goal: PrimaryLearningGoal, current: LearningPathUnitState | null, chapterGate: LearningPathChapterState | null, hifzDue: number, hifzCount: number, level: string, reference: string | null): FocusAction {
  if (goal === 'hifz') {
    if (hifzDue > 0) return { eyebrow: 'Dein nächster Schritt · Hifz', title: `${hifzDue} faellige Hifz-Reviews sichern`, text: 'Bearbeite zuerst die priorisierten Ayah- und Wort-Reviews.', meta: [`${hifzDue} Wiederholungen`, 'Retention zuerst'], icon: 'target', action: 'Hifz wiederholen', href: ROUTES.review };
    return { eyebrow: 'Dein nächster Schritt · Hifz', title: hifzCount ? 'Hifz fortsetzen' : 'Erste Ayah memorieren', text: hifzCount ? 'Baue deinen Bestand kontrolliert weiter aus.' : 'Starte mit einer geführten Hören–Wiederholen–Abrufen-Session.', meta: [`${hifzCount} Ayat im Bestand`, reference ?? '1:1'], icon: 'target', action: hifzCount ? 'Session öffnen' : 'Hifz starten', href: ROUTES.hifz };
  }
  if (chapterGate) return { eyebrow: `Dein nächster Schritt · ${goalLabel(goal)}`, title: chapterGate.chapter.exam.title, text: chapterGate.chapter.exam.description, meta: [`ca. ${chapterGate.chapter.exam.estimatedMinutes} Min.`, chapterGate.chapter.levelLabel, 'Kompetenz-Gate'], icon: 'target', action: 'Kapitelprüfung starten', href: href(ROUTES.practice, { chapter: chapterGate.chapter.id }) };
  if (current) return { eyebrow: `Dein nächster Schritt · ${goalLabel(goal)}`, title: current.unit.title, text: current.unit.objective, meta: [`ca. ${current.unit.estimatedMinutes} Min.`, current.chapter.levelLabel ?? level, current.progress ? `${current.progress}% erledigt` : 'Neu'], icon: goal === 'quran' ? 'book' : goal === 'knowledge' ? 'compass' : 'layers', action: current.progress ? 'Weiterlernen' : 'Starten', href: href(ROUTES.module, { id: current.unit.id }) };
  if (goal === 'knowledge') return { eyebrow: 'Dein nächster Schritt · Wissen', title: 'Fachpfad auswählen', text: 'Wähle deinen islamwissenschaftlichen Lernpfad und beginne auf der passenden Studienstufe.', meta: ['Fiqh', 'Usul', 'Hadith'], icon: 'compass', action: 'Wissen öffnen', href: ROUTES.knowledge };
  if (goal === 'quran') return { eyebrow: 'Dein nächster Schritt · Quran verstehen', title: 'Quran-Verstehenspfad öffnen', text: 'Verbinde Arabisch-Grundlagen mit Wortanalyse, Grammatik und echten Ayat.', meta: ['Q0–Q6', 'Arabisch-Brücken'], icon: 'book', action: 'Quran lernen', href: href(ROUTES.quran, { mode: 'verstehen' }) };
  return { eyebrow: 'Dein nächster Schritt · Arabisch', title: 'Arabisch-Lernpfad starten', text: 'Beginne mit dem strukturierten Weg von Schrift und Lesen bis C2.', meta: [level, 'geführt'], icon: 'layers', action: 'Lernpfad öffnen', href: ROUTES.learn };
}

function goalLabel(goal: PrimaryLearningGoal): string {
  if (goal === 'arabic') return 'Arabisch';
  if (goal === 'quran') return 'Quran verstehen';
  if (goal === 'hifz') return 'Hifz';
  return 'Islamische Wissenschaften';
}

function overall(values: number[]): number {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}
