'use client';

import { useMemo, useState } from 'react';
import { quranCorpus } from '../../services/quran/quran-corpus';
import { shuffle, tokenScore } from '../practice/tasks';

interface RecallToken { id: string; text: string; wordIndex?: number }

export function HifzRecallTask({ corpus, references, chain, onResult }: {
  corpus: ReturnType<typeof quranCorpus> | null;
  references: string[];
  chain: boolean;
  onResult(score: number, wrongWordIndexes: number[], responseTimeMs: number): void;
}) {
  const source = useMemo(() => buildRecallSource(corpus, references, chain), [chain, corpus, references.join('|')]);
  const [pool, setPool] = useState<RecallToken[]>(() => shuffle(source));
  const [built, setBuilt] = useState<RecallToken[]>([]);
  const [checked, setChecked] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const score = source.length ? Math.round(tokenScore(built.map((item) => item.text), source.map((item) => item.text)) * 100) : 0;
  const wrong = chain ? [] : source.filter((item, index) => built[index]?.text !== item.text && item.wordIndex).map((item) => item.wordIndex!);

  function moveToBuilt(item: RecallToken) {
    if (checked) return;
    setPool((items) => items.filter((entry) => entry.id !== item.id));
    setBuilt((items) => [...items, item]);
  }
  function moveToPool(item: RecallToken) {
    if (checked) return;
    setBuilt((items) => items.filter((entry) => entry.id !== item.id));
    setPool((items) => [...items, item]);
  }

  return <section className="hifz-recall-test">
    <header><span>{chain ? 'Range Recall' : 'Ayah Recall'}</span><strong>{chain ? 'Ordne die Verse ueber ihre Anfaenge.' : 'Rekonstruiere die Ayah Wort fuer Wort.'}</strong></header>
    <div className="hifz-recall-built" dir="rtl">{built.length ? built.map((item) => <button key={item.id} disabled={checked} onClick={() => moveToPool(item)}>{item.text}</button>) : <span>Hier zusammensetzen</span>}</div>
    <div className="hifz-recall-pool" dir="rtl">{pool.map((item) => <button key={item.id} disabled={checked} onClick={() => moveToBuilt(item)}>{item.text}</button>)}</div>
    {checked && <div className={`hifz-recall-score ${score >= 75 ? 'is-good' : 'is-retry'}`}><strong>{score}%</strong><span>{score >= 75 ? 'Objektiver Recall bestanden.' : 'Reihenfolge noch nicht stabil.'}</span></div>}
    <button className="button button--primary" disabled={!source.length || built.length !== source.length} onClick={() => checked ? onResult(score, wrong, Date.now() - startedAt) : setChecked(true)}>{checked ? 'Evidenz speichern' : 'Pruefen'}</button>
  </section>;
}

export function HifzWordRecallTask({ corpus, reference, wordIndex, onResult }: {
  corpus: ReturnType<typeof quranCorpus> | null;
  reference: string;
  wordIndex: number;
  onResult(score: number, responseTimeMs: number): void;
}) {
  const [startedAt] = useState(() => Date.now());
  const words = corpus?.words(reference) ?? [];
  const target = words.find((item) => item.wordIndex === wordIndex);
  const options = useMemo(() => {
    if (!target) return [] as string[];
    const local = words.filter((item) => item.wordIndex !== wordIndex).map((item) => item.text);
    return shuffle([...new Set([target.text, ...local])]).slice(0, Math.min(6, Math.max(4, local.length + 1)));
  }, [reference, target?.text, wordIndex, words.map((item) => item.text).join('|')]);
  const [selected, setSelected] = useState('');
  const [checked, setChecked] = useState(false);
  const score = target && selected === target.text ? 100 : 0;

  return <section className="hifz-recall-test hifz-word-recall">
    <header><span>Wort Recall</span><strong>Waehle das passende Quran-Wort ohne Selbsteinschaetzung.</strong></header>
    <div className="hifz-word-options" dir="rtl">{options.map((option) => <button key={option} disabled={checked} className={selected === option ? 'is-selected' : ''} onClick={() => setSelected(option)}>{option}</button>)}</div>
    {checked && <div className={`hifz-recall-score ${score === 100 ? 'is-good' : 'is-retry'}`}><strong>{score}%</strong><span>{score === 100 ? 'Wort korrekt erkannt.' : `Gesucht: ${target?.text ?? ''}`}</span></div>}
    <button className="button button--primary" disabled={!target || !selected} onClick={() => checked ? onResult(score, Date.now() - startedAt) : setChecked(true)}>{checked ? 'Evidenz speichern' : 'Pruefen'}</button>
  </section>;
}

function buildRecallSource(corpus: ReturnType<typeof quranCorpus> | null, references: string[], chain: boolean): RecallToken[] {
  if (!corpus) return [];
  if (chain) return references.map((ref) => {
    const words = corpus.words(ref).slice(0, 3).map((word) => word.text);
    const text = words.length ? `${words.join(' ')} ...` : `${(corpus.ayah(ref)?.text ?? '').split(/\s+/).slice(0, 3).join(' ')} ...`;
    return { id: ref, text };
  });
  const ref = references[0];
  if (!ref) return [];
  const words = corpus.words(ref);
  return words.length
    ? words.map((word) => ({ id: `${ref}:${word.wordIndex}`, text: word.text, wordIndex: word.wordIndex }))
    : (corpus.ayah(ref)?.text ?? '').split(/\s+/).filter(Boolean).map((text, index) => ({ id: `${ref}:${index + 1}`, text, wordIndex: index + 1 }));
}
