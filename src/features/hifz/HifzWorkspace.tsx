'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { quranCorpus, quranCurrentSurah, quranJuzForReference, quranJuzRange, quranSurahsOverlappingOrders } from '../../services/quran/quran-corpus';
import { speakArabic } from '../../services/audio/audio-service';
import { JUZ_STARTS, QURAN_AYAH_COUNTS, QURAN_SURAH_NAMES_AR, TOTAL_QURAN_AYAHS } from '../../shared/quran-structure';
import type { QuranHifzEntry } from '../../types/models';
import { useAppContent, useAppLearning, useAppProgress } from '../../state/AppProvider';
import { Icon } from '../../components/ui/Icon';
import { StudyLedgerHeader, StudyLedgerProgress, StudyLedgerReview, StudyLedgerShell } from '../study/StudyLedgerPrimitives';
import { StudyContextRail, type StudyContextState } from '../study/StudyContextRail';
import { href, ROUTES } from '../../components/shell/routes';
import { applyAyahRecallEvidence, isHifzDue, newHifz, toggleWordHifzEntry, validReference } from '../quran/quran-utils';
import { QuranStudyCanvas, type QuranStudyView, type QuranStudyWordSelection } from '../quran/QuranStudyCanvas';
import { buildUnifiedReviewQueue } from '../../services/review/review-planner';
import { HifzRecallTask } from './HifzRecallTask';
import { cloneProgressForUpdate } from '../../state/progress-copy';

type HifzNavigationMode = 'surah' | 'juz' | 'page';
type HifzStudyPhase = 'understand' | 'memorize' | 'recite' | 'test';
type HifzSessionGoal = 'memorize' | 'review';

interface HifzSession {
  references: string[];
  index: number;
  goal: HifzSessionGoal;
  mode: 'ayah' | 'chain';
  phaseIndex: number;
  memorizePasses: number;
  reveal: boolean;
  attempt: number;
}

const PHASES: Array<{ id: HifzStudyPhase; label: string; description: string }> = [
  { id: 'understand', label: 'Verstehen', description: 'Lesen, hoeren und Wort fuer Wort erfassen.' },
  { id: 'memorize', label: 'Einpraegen', description: 'Wortgruppen wiederholen und Teile ausblenden.' },
  { id: 'recite', label: 'Rezitieren', description: 'Ohne Vorlage abrufen und danach kontrollieren.' },
  { id: 'test', label: 'Pruefen', description: 'Abruf bewerten und Retention aktualisieren.' }
];

const REVIEW_PHASES: HifzStudyPhase[] = ['recite', 'test'];

export function HifzWorkspace() {
  const { content, ensureQuranReader } = useAppContent();
const { progress, patchProgress } = useAppProgress();
const { reviewItems, commit } = useAppLearning();
  const router = useRouter();
  const hifzResume = progress.hifzStudyState;
  const initial = validReference(hifzResume.reference) ?? '1:1';
  const initialSelection = hifzResume.selection.map(validReference).filter((item): item is string => Boolean(item));
  const [reference, setReference] = useState(initial);
  const [navMode, setNavMode] = useState<HifzNavigationMode>(hifzResume.navMode);
  const [surah, setSurah] = useState(hifzResume.surah || quranCurrentSurah(initial));
  const [juz, setJuz] = useState(hifzResume.juz || quranJuzForReference(initial));
  const [page, setPage] = useState(hifzResume.page ?? 1);
  const [view, setView] = useState<QuranStudyView>(hifzResume.view);
  const [showWords, setShowWords] = useState(hifzResume.showWordByWord);
  const [showTranslation, setShowTranslation] = useState(hifzResume.showTranslation);
  const [showTajwid, setShowTajwid] = useState(hifzResume.showTajwid);
  const [selectedWord, setSelectedWord] = useState<QuranStudyWordSelection | null>(null);
  const [selection, setSelection] = useState<string[]>(initialSelection.length ? initialSelection : [initial]);
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [session, setSession] = useState<HifzSession | null>(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const corpus = content?.quranReader ? quranCorpus(content.quranReader) : null;


  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const ref = validReference(params.get('ref'));
    const mode = params.get('nav');
    if (ref) {
      setReference(ref);
      setSelection([ref]);
      setSurah(quranCurrentSurah(ref));
      setJuz(quranJuzForReference(ref));
    }
    if (mode === 'surah' || mode === 'juz' || mode === 'page') setNavMode(mode);
  }, []);

  const lexicalSurahs = useMemo(() => {
    const values = [quranCurrentSurah(reference), ...selection.map(quranCurrentSurah)];
    return [...new Set(values)].slice(-6);
  }, [reference, selection]);

  useEffect(() => { void ensureQuranReader(lexicalSurahs).catch(()=>undefined); }, [ensureQuranReader, lexicalSurahs.join(',')]);
  useEffect(() => {
    const nextPage = corpus?.pageForReference(reference);
    if (nextPage && navMode !== 'page') setPage(nextPage);
  }, [corpus, navMode, reference]);
  useEffect(() => {
    const stored = progress.hifzStudyState;
    const sameSelection = stored.selection.length === selection.length && stored.selection.every((item, index) => item === selection[index]);
    if (stored.reference === reference
      && sameSelection
      && stored.navMode === navMode
      && stored.view === view
      && stored.surah === surah
      && stored.juz === juz
      && stored.page === page
      && stored.showWordByWord === showWords
      && stored.showTranslation === showTranslation
      && stored.showTajwid === showTajwid) return;
    void patchProgress((draft) => {
      draft.hifzStudyState = {
        reference,
        selection: [...selection],
        navMode,
        view,
        surah,
        juz,
        page,
        showWordByWord: showWords,
        showTranslation,
        showTajwid,
        mushafLayoutId: 'indopak_13_line',
        updatedAt: new Date().toISOString()
      };
    }, ['hifzStudyState']);
  }, [juz, navMode, page, patchProgress, progress.hifzStudyState, reference, selection, showTajwid, showTranslation, showWords, surah, view]);

  if (!content) return null;
  const resolvedPage = corpus?.pageForReference(reference) ?? page;

  const visibleAyahs = navMode === 'surah'
    ? corpus?.surah(surah) ?? []
    : navMode === 'juz'
      ? corpus?.juz(juz) ?? []
      : corpus?.pageAyahs(page) ?? [];
  const visibleReferences = visibleAyahs.map((ayah) => ayah.reference);
  const unifiedReview = buildUnifiedReviewQueue(reviewItems, progress.quranHifzEntries, progress.quranHifzWordEntries);
  const hifzReviewCount = unifiedReview.filter((item) => item.kind === 'hifz_ayah' || item.kind === 'hifz_word').length;
  const activeHifz = progress.quranHifzEntries.length;
  const hifzPercent = Math.round(activeHifz / TOTAL_QURAN_AYAHS * 1000) / 10;
  const activeEntry = progress.quranHifzEntries.find((entry) => entry.reference === reference);
  const activeWord = selectedWord ? corpus?.words(selectedWord.reference).find((word) => word.wordIndex === selectedWord.wordIndex) : undefined;
  const activePhase = session ? phaseFlow(session)[session.phaseIndex] : null;
  const currentSessionReference = session?.references[session.index] ?? reference;
  const currentSessionReferences = session ? (session.mode === 'chain' ? session.references.slice(0, session.index + 1) : [currentSessionReference]) : selection;
  const canvasReferences = session ? currentSessionReferences : selection;
  const canvasView: QuranStudyView = session ? 'focus' : view;
  const canvasMask = activePhase === 'memorize' ? 'partial' : activePhase === 'recite' || activePhase === 'test' ? 'full' : 'none';
  const canvasWords = session ? activePhase === 'understand' : showWords;
  const canvasTranslation = session ? activePhase === 'understand' : showTranslation;

  function switchArea(area: 'arabic' | 'quran' | 'knowledge' | 'hifz') {
    if (area === 'arabic') router.push(ROUTES.learn);
    else if (area === 'quran') router.push(href(ROUTES.quran, { mode: 'verstehen' }));
    else if (area === 'knowledge') router.push(ROUTES.knowledge);
  }

  async function openReference(next: string, navigation: HifzNavigationMode = navMode) {
    const valid = validReference(next);
    if (!valid) return;
    const nextSurah = quranCurrentSurah(valid);
    await ensureQuranReader([nextSurah]);
    setReference(valid);
    setSurah(nextSurah);
    setJuz(quranJuzForReference(valid));
    const nextPage = corpus?.pageForReference(valid);
    if (nextPage) setPage(nextPage);
    setSelectedWord(null);
    if (!rangeMode) setSelection([valid]);
    router.replace(href(ROUTES.hifz, { ref: valid, nav: navigation }), { scroll: false });
  }

  async function chooseSurah(next: number) {
    const ref = `${next}:1`;
    setNavMode('surah');
    setSurah(next);
    setRangeMode(false);
    setRangeAnchor(null);
    await openReference(ref, 'surah');
  }

  async function chooseJuz(next: number) {
    const safe = Math.max(1, Math.min(30, next));
    const ref = JUZ_STARTS[safe - 1] ?? '1:1';
    const range = quranJuzRange(safe);
    await ensureQuranReader(quranSurahsOverlappingOrders(range.start, range.end).slice(0, 6));
    setNavMode('juz');
    setJuz(safe);
    setRangeMode(false);
    setRangeAnchor(null);
    await openReference(ref, 'juz');
  }

  async function choosePage(next: number) {
    const safe = Math.max(corpus?.mushafPages[0] ?? 1, Math.min(corpus?.mushafPages[(corpus?.mushafPages.length ?? 1) - 1] ?? next, next));
    const first = corpus?.pageAyahs(safe)[0]?.reference;
    setNavMode('page');
    setPage(safe);
    setView('mushaf');
    setRangeMode(false);
    setRangeAnchor(null);
    if (first) await openReference(first, 'page');
  }

  async function chooseAyah(next: string) {
    if (!rangeMode) {
      await openReference(next);
      return;
    }
    if (!rangeAnchor) {
      setRangeAnchor(next);
      setSelection([next]);
      setReference(next);
      return;
    }
    const values = selectRange(visibleReferences, rangeAnchor, next);
    setSelection(values.length ? values : [next]);
    setReference(values[0] ?? next);
    setRangeAnchor(null);
    setRangeMode(false);
  }

  function beginRange() {
    setRangeMode(true);
    setRangeAnchor(null);
    setSelection([]);
  }

  async function ensureHifzEntries(references: readonly string[]) {
    await patchProgress((draft) => {
      for (const ref of references) if (!draft.quranHifzEntries.some((item) => item.reference === ref)) draft.quranHifzEntries.push(newHifz(ref));
    }, ['quranHifzEntries']);
  }

  async function startStudy(references: readonly string[] = selection, goal: HifzSessionGoal = 'memorize') {
    const refs = [...new Set(references.filter((item) => validReference(item)))];
    if (!refs.length) return;
    if (goal === 'memorize') await ensureHifzEntries(refs);
    const first = refs[0];
    if (first) {
      await ensureQuranReader([...new Set(refs.map(quranCurrentSurah))].slice(0, 6));
      setReference(first);
      setSelection(refs);
    }
    setSession({ references: refs, index: 0, goal, mode: 'ayah', phaseIndex: 0, memorizePasses: 0, reveal: false, attempt: 0 });
    setView('focus');
  }

  function nextPhase() {
    if (!session) return;
    const flow = phaseFlow(session);
    if (session.phaseIndex >= flow.length - 1) return;
    setSession({ ...session, phaseIndex: session.phaseIndex + 1, memorizePasses: 0, reveal: false });
  }

  async function finishTest(score: number, wrongWordIndexes: number[] = [], responseTimeMs = 0) {
    if (!session) return;
    const passed = score >= 75;
    const testedReferences = session.mode === 'chain' ? session.references.slice(0, session.index + 1) : [session.references[session.index]];
    const next = cloneProgressForUpdate(progress, ['quranHifzEntries', 'quranHifzWordEntries']);
    for (const ref of testedReferences) applyAyahRecallEvidence(next.quranHifzEntries, next.quranHifzWordEntries, ref, score, session.mode === 'ayah' && ref === session.references[session.index] ? wrongWordIndexes : []);
    next.xp += passed ? 3 : 0;
    await commit({
      progress: next,
      exerciseResults: [{ exerciseId: `hifz-recall:${session.mode}:${testedReferences.join('+')}`, exerciseType: 'quran', wasCorrect: passed, score, details: { module: 'quran', contentId: testedReferences.join('+'), variant: 'quran_language', interaction: session.mode === 'chain' ? 'hifz_range_chain' : 'hifz_word_order', responseTimeMs, references: testedReferences, wrongWordIndexes } }],
      history: { module: 'quran', activityType: 'exercise_answer', contentId: testedReferences.join('+'), title: session.mode === 'chain' ? `Hifz Verkettung ${selectionLabel(testedReferences)}` : `Hifz Recall ${testedReferences[0]}`, result: passed ? 'correct' : 'wrong', xpDelta: passed ? 3 : 0, details: { score, mode: session.mode, objectiveEvidence: true } }
    });
    if (!passed) {
      setSession({ ...session, attempt: session.attempt + 1, reveal: false });
      return;
    }

    if (session.goal === 'review') {
      if (session.index >= session.references.length - 1) {
        const ref = session.references[session.index];
        setSession(null); setReference(ref); setSelection([ref]); setView('verses');
        return;
      }
      const nextIndex = session.index + 1;
      const nextRef = session.references[nextIndex];
      setSession({ ...session, index: nextIndex, mode: 'ayah', phaseIndex: 0, memorizePasses: 0, reveal: false, attempt: 0 });
      setReference(nextRef); setSelection([nextRef]);
      await ensureQuranReader([quranCurrentSurah(nextRef)]);
      return;
    }

    if (session.mode === 'ayah') {
      if (session.references.length === 1) {
        const ref = session.references[session.index];
        setSession(null); setReference(ref); setSelection([ref]); setView('verses');
        return;
      }
      if (session.index === 0) {
        const nextRef = session.references[1];
        setSession({ ...session, index: 1, mode: 'ayah', phaseIndex: 0, memorizePasses: 0, reveal: false, attempt: 0 });
        setReference(nextRef); setSelection([nextRef]);
        await ensureQuranReader([quranCurrentSurah(nextRef)]);
        return;
      }
      const chain = session.references.slice(0, session.index + 1);
      setSession({ ...session, mode: 'chain', phaseIndex: 0, memorizePasses: 0, reveal: false, attempt: 0 });
      setSelection(chain);
      return;
    }

    if (session.index >= session.references.length - 1) {
      const ref = session.references[session.index];
      setSession(null); setReference(ref); setSelection(session.references); setView('verses');
      return;
    }
    const nextIndex = session.index + 1;
    const nextRef = session.references[nextIndex];
    setSession({ ...session, index: nextIndex, mode: 'ayah', phaseIndex: 0, memorizePasses: 0, reveal: false, attempt: 0 });
    setReference(nextRef); setSelection([nextRef]);
    await ensureQuranReader([quranCurrentSurah(nextRef)]);
  }

  async function toggleWordHifz() {
    if (!selectedWord) return;
    await patchProgress((draft) => {
      toggleWordHifzEntry(draft.quranHifzWordEntries, selectedWord.reference, selectedWord.wordIndex);
    }, ['quranHifzWordEntries']);
  }

  function playCurrent() {
    if (!progress.preferences.audioEnabled) return;
    const text = currentSessionReferences.map((ref) => corpus?.ayah(ref)?.text ?? '').filter(Boolean).join(' ');
    if (!text) return;
    speakArabic(text, progress.preferences.audioRate, {}, progress.preferences.audioVoice);
  }

  const selectedRangeLabel = selectionLabel(selection);
  const phaseCanContinue = activePhase !== 'memorize' || (session?.memorizePasses ?? 0) >= 2;

  return <div className="hifz-study-workspace">
    <div className="study-mobile-bar">
      <button onClick={() => setLedgerOpen(true)}><Icon name="layers" size={18}/> Hifz</button>
      <span>{session ? `${currentSessionReference} - ${PHASES.find((item) => item.id === activePhase)?.label ?? ''}` : selectedRangeLabel}</span>
      <button onClick={() => setContextOpen(true)}>Kontext <Icon name="more" size={18}/></button>
    </div>

    <StudyLedgerShell className="hifz-study-ledger" mainClassName="hifz-ledger-main" open={ledgerOpen}>
        <StudyLedgerHeader onClose={() => setLedgerOpen(false)}/>
        <span className="study-ledger-kicker">Aktiver Bereich</span>
        <details className="study-area-switch">
          <summary><span><Icon name="target" size={18}/>Hifz</span><Icon name="chevron" size={17}/></summary>
          <div className="study-area-menu">
            <button onClick={() => switchArea('arabic')}><Icon name="layers" size={17}/>Arabisch</button>
            <button onClick={() => switchArea('quran')}><Icon name="book" size={17}/>Quran</button>
            <button onClick={() => switchArea('knowledge')}><Icon name="compass" size={17}/>Islamische Wissenschaften</button>
            <button className="is-active"><Icon name="target" size={17}/>Hifz<Icon name="check" size={15}/></button>
          </div>
        </details>

        <StudyLedgerProgress label="Hifz" value={hifzPercent} detail={`${activeHifz} / ${TOTAL_QURAN_AYAHS} Ayat · ${hifzPercent}%`}/>

        <nav className="hifz-ledger-tabs" aria-label="Hifz Navigation">
          {(['surah', 'juz', 'page'] as const).map((item) => <button key={item} className={navMode === item ? 'is-active' : ''} onClick={() => { setNavMode(item); if (item === 'page') { const nextPage = corpus?.pageForReference(reference); if (nextPage) setPage(nextPage); setView('mushaf'); } else if (view === 'mushaf') setView('verses'); }}>{item === 'surah' ? 'SURE' : item === 'juz' ? 'JUZ' : 'SEITE'}</button>)}
        </nav>

        <div className="hifz-ledger-locator">
          {navMode === 'surah' && <label><span>Sure</span><select value={surah} onChange={(event) => void chooseSurah(Number(event.target.value))}>{QURAN_AYAH_COUNTS.map((_, index) => <option value={index + 1} key={index + 1}>{index + 1} - {QURAN_SURAH_NAMES_AR[index]}</option>)}</select></label>}
          {navMode === 'juz' && <label><span>Juz</span><select value={juz} onChange={(event) => void chooseJuz(Number(event.target.value))}>{Array.from({ length: 30 }, (_, index) => <option value={index + 1} key={index + 1}>Juz {index + 1}</option>)}</select></label>}
          {navMode === 'page' && <label><span>Seite</span><select value={page} onChange={(event) => void choosePage(Number(event.target.value))}>{(corpus?.mushafPages ?? []).map((item) => <option value={item} key={item}>Seite {item}</option>)}</select></label>}
          <button className={rangeMode ? 'is-active' : ''} onClick={beginRange}><Icon name="drag" size={15}/>{rangeMode ? rangeAnchor ? 'Ende waehlen' : 'Start waehlen' : 'Bereich waehlen'}</button>
        </div>

        <div className="hifz-ledger-scope">
          <div><strong>{navMode === 'surah' ? QURAN_SURAH_NAMES_AR[surah - 1] : navMode === 'juz' ? `Juz ${juz}` : `Seite ${page}`}</strong><span>{visibleAyahs.length} Ayat</span></div>
        </div>

        <div className="hifz-ledger-ayahs">
          {visibleAyahs.map((ayah) => {
            const entry = progress.quranHifzEntries.find((item) => item.reference === ayah.reference);
            const active = ayah.reference === reference;
            const selected = selection.includes(ayah.reference);
            return <button key={ayah.reference} className={`${active ? 'is-active ' : ''}${selected ? 'is-selected ' : ''}${rangeAnchor === ayah.reference ? 'is-anchor ' : ''}`} onClick={() => void chooseAyah(ayah.reference)}>
              <HifzStatusNode entry={entry}/>
              <strong>{ayah.ayah}</strong>
              <span dir="rtl">{ayah.text}</span>
              {active && !rangeMode && <em><span onClick={(event) => { event.stopPropagation(); void startStudy([ayah.reference]); }}>LERNEN</span><span onClick={(event) => { event.stopPropagation(); setShowWords(true); setView('focus'); }}>WOERTER</span><span onClick={(event) => { event.stopPropagation(); playCurrent(); }}>AUDIO</span></em>}
            </button>;
          })}
          {!visibleAyahs.length && <div className="hifz-ledger-empty">Quran-Daten werden geladen.</div>}
        </div>

        <div className="hifz-ledger-selection">
          <div><small>Auswahl</small><strong>{selectedRangeLabel}</strong></div>
          <button disabled={!selection.length} onClick={() => void startStudy()}>Study starten <Icon name="arrow" size={14}/></button>
        </div>
        <StudyLedgerReview count={hifzReviewCount} onOpen={() => router.push(ROUTES.review)}/>
    </StudyLedgerShell>

    <main className="hifz-study-main">
      <header className="hifz-study-toolbar">
        <div><span>{session ? session.goal === 'review' ? 'Hifz Review' : 'Hifz Study' : 'Hifz Study'}</span><strong>{session ? (session.mode === 'chain' ? `Verkettung ${selectionLabel(currentSessionReferences)}` : currentSessionReference) : selectedRangeLabel}</strong></div>
        {!session && <div className="hifz-view-switch">{(['verses', 'mushaf', 'focus'] as const).map((item) => <button key={item} className={view === item ? 'is-active' : ''} onClick={() => setView(item)}>{item === 'verses' ? 'Verse' : item === 'mushaf' ? 'Mushaf' : 'Fokus'}</button>)}</div>}
        {!session && <div className="hifz-layer-switch"><button className={showWords ? 'is-active' : ''} onClick={() => setShowWords((value) => !value)}>Wort fuer Wort</button><button className={showTranslation ? 'is-active' : ''} onClick={() => setShowTranslation((value) => !value)}>Uebersetzung</button><button className={showTajwid ? 'is-active' : ''} onClick={() => setShowTajwid((value) => !value)}>Tajwid</button></div>}
        {session && <button className="hifz-session-close" onClick={() => setSession(null)}><Icon name="close" size={16}/> Session beenden</button>}
      </header>

      {session && <div className="hifz-phase-line" style={{ gridTemplateColumns: `repeat(${phaseFlow(session).length},1fr)` }}>{phaseFlow(session).map((phase, index) => <span key={phase} className={index < session.phaseIndex ? 'is-done' : index === session.phaseIndex ? 'is-active' : ''}><i>{index < session.phaseIndex ? <Icon name="check" size={11}/> : index + 1}</i>{PHASES.find((item) => item.id === phase)?.label}</span>)}</div>}

      <div className="hifz-study-canvas-wrap">
        <QuranStudyCanvas
          corpus={corpus}
          references={canvasReferences}
          activeReference={currentSessionReference}
          view={canvasView}
          page={resolvedPage}
          showTranslation={canvasTranslation}
          showWordByWord={canvasWords}
          showTajwid={!session && showTajwid}
          mask={canvasMask}
          reveal={session?.reveal ?? false}
          selectedWord={selectedWord}
          onSelectReference={(ref) => { if (!session) void openReference(ref); }}
          onSelectWord={(ref, wordIndex) => { setSelectedWord({ reference: ref, wordIndex }); setContextOpen(true); }}
        />
        {session && activePhase === 'test' && <HifzRecallTask key={`${session.mode}:${session.index}:${session.attempt}`} corpus={corpus} references={currentSessionReferences} chain={session.mode === 'chain'} onResult={(score, wrong, ms) => void finishTest(score, wrong, ms)}/>}
      </div>

      {session && <footer className="hifz-study-sessionbar">
        <div><span>{PHASES.find((item) => item.id === activePhase)?.label}</span><strong>{PHASES.find((item) => item.id === activePhase)?.description}</strong><small>{session.mode === 'chain' ? `Verkettung 1–${session.index + 1}` : `Ayah ${session.index + 1} / ${session.references.length}`}</small></div>
        <div>
          <button onClick={playCurrent} disabled={!progress.preferences.audioEnabled}><Icon name="volume" size={16}/> Hoeren</button>
          {(activePhase === 'recite' || activePhase === 'test') && <button onClick={() => setSession({ ...session, reveal: !session.reveal })}><Icon name="eye" size={16}/>{session.reveal ? 'Ausblenden' : 'Kontrollieren'}</button>}
          {activePhase === 'understand' && <button className="is-primary" onClick={nextPhase}>Weiter <Icon name="arrow" size={15}/></button>}
          {activePhase === 'memorize' && <button className="is-primary" onClick={() => setSession({ ...session, memorizePasses: session.memorizePasses + 1 })}>{session.memorizePasses}/2 Wiederholungen</button>}
          {activePhase === 'memorize' && <button className="is-primary" disabled={!phaseCanContinue} onClick={nextPhase}>Rezitieren <Icon name="arrow" size={15}/></button>}
          {activePhase === 'recite' && <button className="is-primary" onClick={nextPhase}>Pruefen <Icon name="arrow" size={15}/></button>}
          {activePhase === 'test' && <span className="hifz-objective-test-label"><Icon name="target" size={15}/> Objektiver Recall-Test aktiv</span>}
        </div>
      </footer>}
    </main>

    <StudyContextRail state={hifzContextState({ activeWord, selectedWord, activeEntry, session, activePhase, selectedRangeLabel, hifzReviewCount, onToggleWord: () => void toggleWordHifz(), onReview: () => router.push(ROUTES.review) })} className="hifz-study-context" open={contextOpen} onClose={() => setContextOpen(false)}/>
    {(ledgerOpen || contextOpen) && <button className="study-mobile-backdrop" aria-label="Schliessen" onClick={() => { setLedgerOpen(false); setContextOpen(false); }}/>} 
  </div>;
}

function hifzContextState({ activeWord, selectedWord, activeEntry, session, activePhase, selectedRangeLabel, hifzReviewCount, onToggleWord, onReview }: any): StudyContextState {
  if (activeWord && selectedWord) {
    const rows = [
      ['Position', `${selectedWord.reference} · Wort ${selectedWord.wordIndex}`],
      activeWord.lemma ? ['Lemma', activeWord.lemma] : null,
      activeWord.root ? ['Wurzel', activeWord.root] : null,
      activeWord.morphology ? ['Morphologie', activeWord.morphology] : null
    ].filter(Boolean) as string[][];
    return { kind: 'word', eyebrow: 'Wort fuer Wort', title: activeWord.text, description: activeWord.translation ?? 'Keine Wortuebersetzung geladen.', body: <dl>{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd dir={label === 'Lemma' || label === 'Wurzel' ? 'rtl' : undefined}>{value}</dd></div>)}</dl>, status: selectedRangeLabel, action: { label: 'Hifz-Wortmarkierung umschalten', onClick: onToggleWord } };
  }
  if (session) return { kind: 'focus', eyebrow: session.mode === 'chain' ? 'Verkettung' : 'Study Phase', title: PHASES.find((item) => item.id === activePhase)?.label ?? 'Hifz Study', description: session.mode === 'chain' ? `Kumulativer Abruf ${selectionLabel(session.references.slice(0, session.index + 1))}.` : PHASES.find((item) => item.id === activePhase)?.description, status: `Vers ${session.index + 1}/${session.references.length} · Versuch ${session.attempt + 1}` };
  if (activeEntry && isHifzDue(activeEntry)) return { kind: 'review', eyebrow: 'Review faellig', title: selectedRangeLabel, description: `${activeEntry.repetitions} Wiederholungen · ${activeEntry.errorCount} Fehler`, status: `${hifzReviewCount} Hifz-Reviews gesamt`, action: { label: 'Review oeffnen', onClick: onReview } };
  return { kind: 'focus', eyebrow: 'Aktuelle Auswahl', title: selectedRangeLabel, description: activeEntry ? `${hifzEntryLabel(activeEntry)} · ${activeEntry.repetitions} Wiederholungen` : 'Study starten, um objektive Hifz-Evidenz aufzubauen.', status: `${hifzReviewCount} Hifz-Reviews faellig` };
}

function HifzStatusNode({ entry }: { entry: QuranHifzEntry | undefined }) {
  if (!entry) return <i className="hifz-node is-open"/>;
  if (entry.status === 'mastered' || entry.status === 'stable') return <i className="hifz-node is-stable"><Icon name="check" size={11}/></i>;
  if (entry.status === 'unstable') return <i className="hifz-node is-weak"><Icon name="warning" size={10}/></i>;
  return <i className="hifz-node is-learning"/>;
}

function phaseFlow(session: HifzSession): HifzStudyPhase[] {
  return session.goal === 'review' || session.mode === 'chain' ? REVIEW_PHASES : PHASES.map((item) => item.id);
}

function selectRange(visible: readonly string[], from: string, to: string): string[] {
  const left = visible.indexOf(from);
  const right = visible.indexOf(to);
  if (left < 0 || right < 0) return [to];
  const start = Math.min(left, right);
  const end = Math.max(left, right);
  return visible.slice(start, end + 1);
}

function selectionLabel(references: readonly string[]): string {
  if (!references.length) return 'Keine Ayah gewaehlt';
  if (references.length === 1) return references[0];
  const first = references[0];
  const last = references[references.length - 1];
  const firstSurah = first.split(':')[0];
  const lastSurah = last.split(':')[0];
  return firstSurah === lastSurah ? `${first}-${last.split(':')[1]}` : `${first} - ${last}`;
}

function hifzEntryLabel(entry: QuranHifzEntry): string {
  if (entry.status === 'mastered') return 'Gefestigt';
  if (entry.status === 'stable') return 'Stabil';
  if (entry.status === 'unstable') return 'Festigen';
  if (entry.status === 'learning') return 'Im Lernen';
  return 'Neu';
}
