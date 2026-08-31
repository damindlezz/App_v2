'use client';

import { memo, useMemo } from 'react';
import type { QuranCorpusIndex } from '../../services/quran/quran-corpus';
import { quranReferenceOrder } from '../../services/quran/quran-corpus';
import { ArabicText } from '../../components/ui/ArabicText';
import { Icon } from '../../components/ui/Icon';

export type QuranStudyView = 'verses' | 'mushaf' | 'focus';
export type QuranStudyMask = 'none' | 'partial' | 'full';

export interface QuranStudyWordSelection {
  reference: string;
  wordIndex: number;
}

interface Props {
  corpus: QuranCorpusIndex | null;
  references: readonly string[];
  activeReference: string;
  view: QuranStudyView;
  page?: number | null;
  showTranslation?: boolean;
  showWordByWord?: boolean;
  showTajwid?: boolean;
  mask?: QuranStudyMask;
  reveal?: boolean;
  selectedWord?: QuranStudyWordSelection | null;
  onSelectReference?: (reference: string) => void;
  onSelectWord?: (reference: string, wordIndex: number) => void;
}

export const QuranStudyCanvas = memo(function QuranStudyCanvas({
  corpus,
  references,
  activeReference,
  view,
  page,
  showTranslation = false,
  showWordByWord = false,
  showTajwid = false,
  mask = 'none',
  reveal = false,
  selectedWord,
  onSelectReference,
  onSelectWord
}: Props) {
  const uniqueReferences = useMemo(() => [...new Set(references.length ? references : [activeReference])], [activeReference, references]);
  if (!corpus) return <div className="quran-study-empty">Quran-Daten werden geladen.</div>;

  if (view === 'mushaf') {
    const resolvedPage = page ?? corpus.pageForReference(activeReference) ?? corpus.mushafPages[0] ?? 1;
    const lines = corpus.page(resolvedPage);
    const activeAyah = corpus.ayah(activeReference);
    return <section className="quran-study-canvas is-mushaf" aria-label="Mushaf Study">
      <header className="quran-study-page-head"><span>13-Zeilen-Mushaf</span><strong>Seite {resolvedPage}</strong></header>
      <div className="quran-study-mushaf" dir="rtl">
        {lines.map((line) => {
          const ref = line.reference ?? line.startReference ?? null;
          const active = lineContainsReference(line.startReference ?? line.reference, line.endReference ?? line.reference, activeReference);
          return <button key={line.id} className={`quran-study-mushaf-line${active ? ' is-active' : ''}`} disabled={!ref} onClick={() => ref && onSelectReference?.(ref)}>
            <ArabicText as="span" module="quran" text={maskArabic(line.text, reveal ? 'none' : mask)}/>
          </button>;
        })}
        {!lines.length && <div className="quran-study-empty">Fuer diese Seite liegt kein Mushaf-Layout vor.</div>}
      </div>
      {activeAyah && <div className="quran-study-mushaf-context">
        <span>{activeReference}</span>
        {showTranslation && <p>{corpus.translations(activeReference)[0]?.text ?? 'Keine Uebersetzung geladen.'}</p>}
        {showWordByWord && <WordLine corpus={corpus} reference={activeReference} selectedWord={selectedWord} onSelectWord={onSelectWord}/>} 
      </div>}
    </section>;
  }

  if (view === 'focus') {
    const ayah = corpus.ayah(activeReference);
    const translation = corpus.translations(activeReference)[0]?.text;
    const tajwid = corpus.tajweed(activeReference);
    return <section className="quran-study-canvas is-focus" aria-label="Ayah Fokus">
      <div className="quran-study-focus-ref">{activeReference}</div>
      <ArabicText as="div" module="quran" className="quran-study-focus-text" text={maskArabic(ayah?.text ?? '...', reveal ? 'none' : mask)}/>
      {showTranslation && <p className="quran-study-translation">{translation ?? 'Keine Uebersetzung geladen.'}</p>}
      {showWordByWord && <WordLine corpus={corpus} reference={activeReference} selectedWord={selectedWord} onSelectWord={onSelectWord}/>} 
      {showTajwid && tajwid.length > 0 && <TajwidLine items={tajwid}/>} 
    </section>;
  }

  return <section className="quran-study-canvas is-verses" aria-label="Verse Study">
    <div className="quran-study-verses">
      {uniqueReferences.map((reference) => {
        const ayah = corpus.ayah(reference);
        if (!ayah) return null;
        const active = reference === activeReference;
        const translation = corpus.translations(reference)[0]?.text;
        const tajwid = corpus.tajweed(reference);
        return <article key={reference} className={`quran-study-verse${active ? ' is-active' : ''}`}>
          <button className="quran-study-verse-ref" onClick={() => onSelectReference?.(reference)}>{reference.split(':')[1]}</button>
          <button className="quran-study-verse-text" onClick={() => onSelectReference?.(reference)}>
            <ArabicText as="span" module="quran" text={maskArabic(ayah.text, reveal ? 'none' : mask)}/>
          </button>
          {showTranslation && <p className="quran-study-translation">{translation ?? 'Keine Uebersetzung geladen.'}</p>}
          {showWordByWord && <WordLine corpus={corpus} reference={reference} selectedWord={selectedWord} onSelectWord={onSelectWord}/>} 
          {showTajwid && tajwid.length > 0 && <TajwidLine items={tajwid}/>} 
        </article>;
      })}
      {!uniqueReferences.some((reference) => corpus.ayah(reference)) && <div className="quran-study-empty">Keine Ayat fuer diese Auswahl geladen.</div>}
    </div>
  </section>;
});

function WordLine({ corpus, reference, selectedWord, onSelectWord }: {
  corpus: QuranCorpusIndex;
  reference: string;
  selectedWord?: QuranStudyWordSelection | null;
  onSelectWord?: (reference: string, wordIndex: number) => void;
}) {
  const words = corpus.words(reference);
  if (!words.length) return <div className="quran-study-word-empty">Wortdaten werden bei Bedarf geladen.</div>;
  return <div className="quran-study-word-line" dir="rtl">
    {words.map((word) => {
      const active = selectedWord?.reference === reference && selectedWord.wordIndex === word.wordIndex;
      return <button key={word.id} className={active ? 'is-active' : ''} onClick={() => onSelectWord?.(reference, word.wordIndex)}>
        <b>{word.text}</b>
        <small>{word.translation ?? `#${word.wordIndex}`}</small>
      </button>;
    })}
  </div>;
}

function TajwidLine({ items }: { items: readonly { id: string; rule: string; explanation: string }[] }) {
  return <div className="quran-study-tajwid-line">
    <Icon name="book" size={14}/>
    <div>{items.slice(0, 3).map((item) => <span key={item.id}><strong>{item.rule}</strong>{item.explanation}</span>)}</div>
  </div>;
}

function maskArabic(text: string, mask: QuranStudyMask): string {
  if (mask === 'none') return text;
  const words = text.trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return text;
  if (mask === 'full') return words.map(() => '••••').join('   ');
  return words.map((word, index) => index % 2 === 0 ? word : '••••').join(' ');
}

function lineContainsReference(start: string | undefined, end: string | undefined, reference: string): boolean {
  const current = quranReferenceOrder(reference);
  const startOrder = quranReferenceOrder(start);
  const endOrder = quranReferenceOrder(end);
  if (current < 1 || startOrder < 1) return false;
  return current >= startOrder && current <= (endOrder >= startOrder ? endOrder : startOrder);
}
