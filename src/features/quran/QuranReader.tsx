'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { quranCorpus, quranCurrentSurah, quranJuzForReference } from '../../services/quran/quran-corpus';
import { QURAN_AYAH_COUNTS, QURAN_SURAH_NAMES_AR } from '../../shared/quran-structure';
import { useAppContent, useAppProgress } from '../../state/AppProvider';
import { Icon } from '../../components/ui/Icon';
import { AnnotationTools } from '../../components/ui/AnnotationTools';
import { href, ROUTES } from '../../components/shell/routes';
import { moveReference, newHifz, toggleWordHifzEntry, validReference } from './quran-utils';
import { QuranStudyCanvas, type QuranStudyView, type QuranStudyWordSelection } from './QuranStudyCanvas';
import { QuranAudioPlayer } from './QuranAudioPlayer';

type ReaderContext = 'overview' | 'tafsir' | 'hifz';

export function QuranReader() {
  const { content, ensureQuranReader } = useAppContent();
const { progress, patchProgress } = useAppProgress();
  const router = useRouter();
  const readerResume = progress.quranReaderState;
  const initialReference = validReference(readerResume.reference) ?? '1:1';
  const [reference, setReference] = useState(initialReference);
  const [input, setInput] = useState(initialReference);
  const [view, setView] = useState<QuranStudyView>(readerResume.view);
  const [showWords, setShowWords] = useState(readerResume.showWordByWord);
  const [showTranslation, setShowTranslation] = useState(readerResume.showTranslation);
  const [showTajwid, setShowTajwid] = useState(readerResume.showTajwid);
  const [selectedWord, setSelectedWord] = useState<QuranStudyWordSelection | null>(null);
  const [context, setContext] = useState<ReaderContext>('overview');
  const [practiceOpen, setPracticeOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const queryReference = validReference(params.get('ref'));
    const queryView = params.get('view');
    if (queryReference) { setReference(queryReference); setInput(queryReference); }
    if (queryView === 'verses' || queryView === 'mushaf' || queryView === 'focus') setView(queryView);
  }, []);

  const surah = quranCurrentSurah(reference);
  useEffect(() => { void ensureQuranReader([surah]).catch(()=>undefined); }, [ensureQuranReader, surah]);
  useEffect(() => {
    const stored = progress.quranReaderState;
    if (stored.reference === reference
      && stored.view === view
      && stored.showWordByWord === showWords
      && stored.showTranslation === showTranslation
      && stored.showTajwid === showTajwid) return;
    void patchProgress((draft) => {
      draft.quranReaderState = {
        reference,
        view,
        showWordByWord: showWords,
        showTranslation,
        showTajwid,
        updatedAt: new Date().toISOString()
      };
    }, ['quranReaderState']);
  }, [patchProgress, progress.quranReaderState, reference, showTajwid, showTranslation, showWords, view]);



  if (!content) return null;
  const corpus = content.quranReader ? quranCorpus(content.quranReader) : null;
  const ayah = corpus?.ayah(reference);
  const audio = corpus?.audio(reference);
  const words = corpus?.words(reference) ?? [];
  const selected = selectedWord ? corpus?.words(selectedWord.reference).find((item) => item.wordIndex === selectedWord.wordIndex) : undefined;
  const translations = corpus?.translations(reference) ?? [];
  const tafsir = corpus?.tafsir(reference) ?? [];
  const tajwid = corpus?.tajweed(reference) ?? [];
  const page = corpus?.pageForReference(reference);
  const juz = quranJuzForReference(reference);
  const previous = moveReference(reference, -1);
  const next = moveReference(reference, 1);
  const inHifz = progress.quranHifzEntries.some((item) => item.reference === reference);
  const verseReferences = useMemo(
    () => corpus?.surah(surah).map((item) => item.reference) ?? [reference],
    [corpus, reference, surah]
  );
  const canvasReferences = useMemo(
    () => view === 'verses' ? verseReferences : [reference],
    [reference, verseReferences, view]
  );

  const openReference = useCallback(async (nextReference: string) => {
    const valid = validReference(nextReference);
    if (!valid) return;
    await ensureQuranReader([quranCurrentSurah(valid)]);
    setReference(valid);
    setInput(valid);
    setSelectedWord(null);
    router.replace(href(ROUTES.quran, { mode: 'lesen', ref: valid, view }), { scroll: false });
  }, [ensureQuranReader, router, view]);

  const chooseView = useCallback((nextView: QuranStudyView) => {
    setView(nextView);
    router.replace(href(ROUTES.quran, { mode: 'lesen', ref: reference, view: nextView }), { scroll: false });
  }, [reference, router]);

  const selectWord = useCallback((nextReference: string, wordIndex: number) => {
    setSelectedWord({ reference: nextReference, wordIndex });
    setContext('overview');
  }, []);



  async function addHifz() {
    await patchProgress((draft) => {
      if (!draft.quranHifzEntries.some((item) => item.reference === reference)) draft.quranHifzEntries.push(newHifz(reference));
    }, ['quranHifzEntries']);
  }

  async function toggleWordHifz() {
    if (!selectedWord) return;
    await patchProgress((draft) => {
      toggleWordHifzEntry(draft.quranHifzWordEntries, selectedWord.reference, selectedWord.wordIndex);
    }, ['quranHifzWordEntries']);
  }

  return <div className="quran-reader-workspace">
<div className="quran-study-reader">
    <header className="quran-study-commandbar">
      <form onSubmit={(event) => { event.preventDefault(); void openReference(input); }}>
        <select value={surah} onChange={(event) => void openReference(`${Number(event.target.value)}:1`)} aria-label="Sure">
          {QURAN_AYAH_COUNTS.map((_, index) => <option value={index + 1} key={index + 1}>{index + 1} - {QURAN_SURAH_NAMES_AR[index]}</option>)}
        </select>
        <input value={input} onChange={(event) => setInput(event.target.value)} aria-label="Quran Referenz"/>
        <button type="submit">Oeffnen</button>
      </form>
      <div className="quran-study-location">
<span>Juz {juz}</span>{page && <span>Seite {page}</span>}<strong>{reference}</strong>
</div>
      <div className="quran-study-view-switch">{(['verses', 'mushaf', 'focus'] as const).map((item) => <button key={item} className={view === item ? 'is-active' : ''} onClick={() => chooseView(item)}>{item === 'verses' ? 'Verse' : item === 'mushaf' ? 'Mushaf' : 'Fokus'}</button>)}</div>
      <div className="quran-study-command-actions">
<button onClick={() => router.push(href(ROUTES.quran, { mode: 'verstehen' }))} title="Quran Lernpfad">
<Icon name="layers" size={17}/>
</button>
<AnnotationTools entityType="quran_ayah" entityId={reference} compact/>
<button onClick={() => setPracticeOpen(true)} title="Ueben">
<Icon name="grid" size={17}/>
</button>
</div>
    </header>

    <div className="quran-study-reader-layout">
      <main className="quran-study-reader-main">
        <div className="quran-study-layerbar">
          <div>
<button disabled={!previous} onClick={() => previous && void openReference(previous)}>
<Icon name="chevron" size={15}/> Vorherige</button>
<button disabled={!next} onClick={() => next && void openReference(next)}>Naechste <Icon name="chevron" size={15}/>
</button>
</div>
          <div>
<button className={showWords ? 'is-active' : ''} onClick={() => setShowWords((value) => !value)}>Wort fuer Wort</button>
<button className={showTranslation ? 'is-active' : ''} onClick={() => setShowTranslation((value) => !value)}>Uebersetzung</button>
<button className={showTajwid ? 'is-active' : ''} onClick={() => setShowTajwid((value) => !value)}>Tajwid</button>
</div>
        </div>

        <QuranStudyCanvas
          corpus={corpus}
          references={canvasReferences}
          activeReference={reference}
          view={view}
          page={page}
          showTranslation={showTranslation}
          showWordByWord={showWords}
          showTajwid={showTajwid}
          selectedWord={selectedWord}
          onSelectReference={openReference}
          onSelectWord={selectWord}
        />

        <QuranAudioPlayer reference={reference} ayahText={ayah?.text} audio={audio} />
      </main>

      <aside className="quran-study-context-rail">
        <div className="quran-study-context-tabs">
<button className={context === 'overview' ? 'is-active' : ''} onClick={() => setContext('overview')}>Kontext</button>
<button className={context === 'tafsir' ? 'is-active' : ''} onClick={() => setContext('tafsir')}>Tafsir</button>
<button className={context === 'hifz' ? 'is-active' : ''} onClick={() => setContext('hifz')}>Hifz</button>
</div>
        {context === 'overview' && <>
          {selected && selectedWord ? <section>
<span>Wort fuer Wort</span>
<h2 dir="rtl">{selected.text}</h2>
<p>{selected.translation ?? 'Keine Wortuebersetzung geladen.'}</p>
<dl>
<div>
<dt>Position</dt>
<dd>{selectedWord.reference} · Wort {selected.wordIndex}</dd>
</div>{selected.lemma && <div>
<dt>Lemma</dt>
<dd dir="rtl">{selected.lemma}</dd>
</div>}{selected.root && <div>
<dt>Wurzel</dt>
<dd dir="rtl">{selected.root}</dd>
</div>}{selected.morphology && <div>
<dt>Morphologie</dt>
<dd>{selected.morphology}</dd>
</div>}</dl>{!selected.lemma && !selected.root && !selected.morphology && <small>Morphologie ist fuer diese Wortposition noch nicht importiert.</small>}<button onClick={() => void toggleWordHifz()}>{progress.quranHifzWordEntries.some((entry) => entry.reference === selectedWord.reference && entry.wordIndex === selectedWord.wordIndex) ? 'Wortmarkierung entfernen' : 'Fuer Hifz markieren'}</button>
</section> : <section>
<span>Ayah</span>
<h2>{reference}</h2>
<p>{translations[0]?.text ?? 'Keine Uebersetzung geladen.'}</p>
<small>{words.length} Wortpositionen geladen · {tajwid.length} Tajwid-Hinweise</small>
</section>}
          <section>
<span>Study Layer</span>
<p>Verse, Mushaf und Fokus verwenden denselben QuranStudyCanvas. Wort-fuer-Wort, Uebersetzung und Tajwid bleiben ueber alle Ansichten konsistent.</p>
</section>
        </>}
        {context === 'tafsir' && <section>
<span>Tafsir</span>{tafsir.length ? tafsir.map((item) => <article key={item.id}>
<h3>{item.title ?? reference}</h3>
<p>{item.text}</p>
</article>) : <p>Fuer diese Ayah liegt kein Tafsir-Datensatz vor.</p>}</section>}
        {context === 'hifz' && <section>
<span>Hifz</span>
<h2>{inHifz ? 'Im Hifz-Bestand' : 'Ayah memorieren'}</h2>
<p>Quran Study und Hifz teilen dieselben Ayah- und Wortdaten.</p>
<button disabled={inHifz} onClick={() => void addHifz()}>{inHifz ? 'Bereits hinzugefuegt' : 'Zum Hifz hinzufuegen'}</button>
<button className="is-primary" onClick={() => router.push(href(ROUTES.hifz, { ref: reference }))}>In Hifz Study oeffnen <Icon name="arrow" size={14}/>
</button>
</section>}
      </aside>
    </div>

    {practiceOpen && <PracticeSheet reference={reference} onClose={() => setPracticeOpen(false)}/>} 
  </div>
</div>;
}

function PracticeSheet({ reference, onClose }: { reference: string; onClose(): void }) {
  const router = useRouter();
  const items: Array<{ label: string; icon: 'headphones' | 'gap' | 'drag' | 'grid'; interaction?: 'listening' | 'cloze' | 'order'; route?: string }> = [
    { label: 'Zuhoeren', icon: 'headphones', interaction: 'listening' },
    { label: 'Lueckentext', icon: 'gap', interaction: 'cloze' },
    { label: 'Drag & Drop', icon: 'drag', interaction: 'order' },
    { label: 'Mehr', icon: 'grid', route: ROUTES.practice }
  ];
  return <div className="sheet-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
<div className="practice-sheet">
<div className="sheet-handle"/>
<div className="sheet-heading">
<strong>Uebung waehlen</strong>
<button className="icon-button" onClick={onClose}>
<Icon name="close" size={18}/>
</button>
</div>
<div className="practice-sheet__grid">{items.map((item) => <button key={item.label} onClick={() => { if (item.route) router.push(item.route); else router.push(href(ROUTES.practice, { mode: 'ayah', ref: reference, interaction: item.interaction ?? 'order' })); onClose(); }}>
<span>
<Icon name={item.icon} size={22}/>
</span>
<strong>{item.label}</strong>
</button>)}</div>
</div>
</div>;
}
