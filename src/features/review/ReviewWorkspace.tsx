'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { ReviewItem, ReviewRating } from '../../types/models';
import { quranCorpus, quranCurrentSurah } from '../../services/quran/quran-corpus';
import { useAppContent, useAppLearning, useAppProgress } from '../../state/AppProvider';
import { Icon } from '../../components/ui/Icon';
import { ROUTES } from '../../components/shell/routes';
import { applyAyahRecallEvidence, applyWordRecallEvidence } from '../quran/quran-utils';
import { HifzRecallTask, HifzWordRecallTask } from '../hifz/HifzRecallTask';
import { buildUnifiedReviewQueue, type UnifiedReviewItem } from '../../services/review/review-planner';
import { cloneProgressForUpdate } from '../../state/progress-copy';

export function ReviewWorkspace() {
  const { reviewItems, reviewSummary, commit } = useAppLearning();
const { progress } = useAppProgress();
const { content, ensureQuranReader } = useAppContent();
  const due = useMemo(
    () => buildUnifiedReviewQueue(reviewItems, progress.quranHifzEntries, progress.quranHifzWordEntries),
    [progress.quranHifzEntries, progress.quranHifzWordEntries, reviewItems]
  );
  const [queue] = useState<UnifiedReviewItem[]>(() => structuredClone(due));
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const current = queue[index];
  const quranSurahs = useMemo(
    () => [...new Set(queue.filter((item) => item.kind !== 'srs').slice(0, 40).map((item) => quranCurrentSurah(item.reference)))],
    [queue]
  );
  useEffect(() => {
    if (quranSurahs.length) void ensureQuranReader(quranSurahs).catch(()=>undefined);
  }, [ensureQuranReader, quranSurahs.join(',')]);
  const corpus = content?.quranReader ? quranCorpus(content.quranReader) : null;

  async function rateSrs(item: ReviewItem, rating: ReviewRating) {
    const correct = rating !== 'again';
    const next = cloneProgressForUpdate(progress, []);
    next.xp += correct ? 2 : 0;
    await commit({
      progress: next,
      reviews: [{ contentType: item.contentType, contentId: item.contentId, prompt: item.prompt, answer: item.answer, correct, rating }],
      history: {
        module: 'review',
        activityType: 'review_answer',
        contentId: item.contentId,
        title: `Review: ${item.prompt.slice(0, 60)}`,
        result: correct ? 'correct' : 'wrong',
        xpDelta: correct ? 2 : 0
      }
    });
    advance();
  }

  async function rateHifz(item: Extract<UnifiedReviewItem, { kind: 'hifz_ayah' | 'hifz_word' }>, score: number, responseTimeMs: number, wrongWordIndexes: number[] = []) {
    const passed = score >= 75;
    const next = cloneProgressForUpdate(progress, ['quranHifzEntries', 'quranHifzWordEntries']);
    if (item.kind === 'hifz_ayah') applyAyahRecallEvidence(next.quranHifzEntries, next.quranHifzWordEntries, item.reference, score, wrongWordIndexes);
    else applyWordRecallEvidence(next.quranHifzWordEntries, item.reference, item.wordIndex, score);
    next.xp += passed ? 2 : 0;
    const contentId = item.kind === 'hifz_word' ? `${item.reference}:${item.wordIndex}` : item.reference;
    await commit({
      progress: next,
      exerciseResults: [{
        exerciseId: `review:${item.kind}:${contentId}:${attempt}`,
        exerciseType: 'quran',
        wasCorrect: passed,
        score,
        details: {
          module: 'quran',
          contentId,
          variant: 'quran_language',
          interaction: item.kind === 'hifz_word' ? 'hifz_word_recall' : 'hifz_word_order',
          responseTimeMs,
          reference: item.reference,
          wordIndex: item.kind === 'hifz_word' ? item.wordIndex : undefined,
          wrongWordIndexes,
          objectiveEvidence: true
        }
      }],
      history: {
        module: 'review',
        activityType: 'review_answer',
        contentId,
        title: item.kind === 'hifz_word' ? `Hifz Wort ${contentId}` : `Hifz Ayah ${item.reference}`,
        result: passed ? 'correct' : 'wrong',
        xpDelta: passed ? 2 : 0,
        details: { score, objectiveEvidence: true, kind: item.kind }
      }
    });
    if (passed) advance();
    else setAttempt((value) => value + 1);
  }

  function advance() {
    setRevealed(false);
    setAttempt(0);
    setIndex((value) => value + 1);
  }

  if (!current) {
    return (
      <div className="state-page">
        <span className="result-mark is-good"><Icon name="check" size={30} /></span>
        <h1>Alles wiederholt</h1>
        <p>Aktuell sind keine SRS-Karten, Hifz-Ayat oder Hifz-Woerter faellig.</p>
        <div>
          <Link className="button button--primary" href={ROUTES.today}>Heute</Link>
          <Link className="button button--secondary" href={ROUTES.practice}>Frei ueben</Link>
        </div>
      </div>
    );
  }

  const isSrs = current.kind === 'srs';
  const word = current.kind === 'hifz_word' ? corpus?.words(current.reference).find((item) => item.wordIndex === current.wordIndex) : null;
  const prompt = isSrs
    ? current.review.prompt
    : current.kind === 'hifz_word'
      ? (word?.translation ? `Welches Quran-Wort bedeutet "${word.translation}"?` : `${current.reference} · Wort ${current.wordIndex}`)
      : current.reference;
  const answer = isSrs ? current.review.answer : '';
  const kindLabel = isSrs ? typeLabel(current.review.contentType) : current.kind === 'hifz_word' ? 'Hifz · Wort' : 'Hifz · Ayah';
  const total = queue.length;
  const completion = Math.round(((index + 1) / total) * 100);
  const remaining = total - index;
  const upcoming = queue.slice(index + 1, index + 6);
  const mix = {
    srs: queue.slice(index).filter((item) => item.kind === 'srs').length,
    ayah: queue.slice(index).filter((item) => item.kind === 'hifz_ayah').length,
    word: queue.slice(index).filter((item) => item.kind === 'hifz_word').length
  };

  return (
    <div className="review-focus">
      <header className="focus-header">
        <Link className="icon-button" href={ROUTES.today}><Icon name="close" size={19} /></Link>
        <div><span>Wiederholen</span><strong>{kindLabel}</strong></div>
        <em>{index + 1} / {total}</em>
      </header>
      <div className="focus-progress"><i style={{ width: `${completion}%` }} /></div>
      <main className="review-stage review-stage--split">
        <section className="review-study-sheet">
          <div className="review-study-sheet__intro">
            <span className="pill">{isSrs ? `${kindLabel} · ${reviewSummary.dueNow} SRS faellig` : `${kindLabel} · objektiv priorisiert`}</span>
            <div className="review-kpis">
              <article><strong>{remaining}</strong><span>offen</span></article>
              <article><strong>{completion}%</strong><span>fortschritt</span></article>
              <article><strong>{attempt + 1}</strong><span>versuch</span></article>
            </div>
          </div>

          <div className={`review-prompt-card${isSrs ? ' is-flashcard' : ''}${revealed ? ' is-revealed' : ''}`}>
            <span className="section-eyebrow">{isSrs ? 'Frage' : current.kind === 'hifz_word' ? 'Wortabruf' : 'Ayah-Recall'}</span>
            <h1 className={isSrs && containsArabic(prompt) ? 'arabic-question' : ''} dir={isSrs && containsArabic(prompt) ? 'rtl' : undefined}>{prompt}</h1>
            {!isSrs && <p className="review-prompt-meta">{current.kind === 'hifz_word' ? `${current.reference} · Wort ${current.wordIndex}` : `${current.reference} · Surah ${quranCurrentSurah(current.reference)}`}</p>}

            {isSrs ? (
              !revealed ? (
                <button className="button button--primary" onClick={() => setRevealed(true)}>Antwort zeigen</button>
              ) : (
                <>
                  <div className="review-answer">
                    <span className="section-eyebrow">Antwort</span>
                    <strong className={containsArabic(answer) ? 'arabic-text' : ''} dir={containsArabic(answer) ? 'rtl' : undefined}>{answer}</strong>
                  </div>
                  <div className="review-rating">
                    <button onClick={() => void rateSrs(current.review, 'again')}><strong>Nochmal</strong><span>kurz</span></button>
                    <button onClick={() => void rateSrs(current.review, 'hard')}><strong>Schwer</strong><span>1-2 Tage</span></button>
                    <button onClick={() => void rateSrs(current.review, 'good')}><strong>Gut</strong><span>normal</span></button>
                    <button onClick={() => void rateSrs(current.review, 'easy')}><strong>Leicht</strong><span>spaeter</span></button>
                  </div>
                </>
              )
            ) : current.kind === 'hifz_ayah' ? (
              <HifzRecallTask key={`${current.key}:${attempt}`} corpus={corpus} references={[current.reference]} chain={false} onResult={(score, wrong, ms) => void rateHifz(current, score, ms, wrong)} />
            ) : (
              <HifzWordRecallTask key={`${current.key}:${attempt}`} corpus={corpus} reference={current.reference} wordIndex={current.wordIndex} onResult={(score, ms) => void rateHifz(current, score, ms)} />
            )}
          </div>
        </section>

        <aside className="review-sidebar">
          <section className="review-sidebar-card">
            <span className="section-eyebrow">Mix</span>
            <div className="review-sidebar-stats">
              <div><strong>{mix.srs}</strong><span>SRS</span></div>
              <div><strong>{mix.ayah}</strong><span>Ayat</span></div>
              <div><strong>{mix.word}</strong><span>Woerter</span></div>
            </div>
          </section>

          <section className="review-sidebar-card">
            <span className="section-eyebrow">Als naechstes</span>
            <div className="review-queue-list">
              {upcoming.length ? upcoming.map((item) => (
                <div key={item.key}>
                  <strong>{queueLabel(item)}</strong>
                  <span>{queueMeta(item)}</span>
                </div>
              )) : <small>Nach dieser Karte ist die Session abgeschlossen.</small>}
            </div>
          </section>

          <section className="review-sidebar-card">
            <span className="section-eyebrow">Schnellaktionen</span>
            <div className="review-sidebar-actions">
              <Link className="button button--secondary" href={ROUTES.progress}><Icon name="chart" size={17} /> Fortschritt</Link>
              <Link className="button button--secondary" href={ROUTES.quran}><Icon name="book" size={17} /> Quran</Link>
            </div>
            <p>Kurze Session mit klarer Reihenfolge. Hifz nutzt objektive Evidenz statt Selbsteinschaetzung.</p>
          </section>
        </aside>
      </main>
    </div>
  );
}

function containsArabic(value: string) { return /[؀-ۿ]/.test(value); }
function typeLabel(type: ReviewItem['contentType']) { return ({ vocabulary: 'Vokabel', reading: 'Lesen', grammar: 'Grammatik', alphabet: 'Alphabet', quran: 'Quran', knowledge: 'Wissen', speaking: 'Sprechen' } as const)[type]; }
function queueLabel(item: UnifiedReviewItem) {
  if (item.kind === 'srs') return typeLabel(item.review.contentType);
  return item.kind === 'hifz_word' ? 'Hifz Wort' : 'Hifz Ayah';
}
function queueMeta(item: UnifiedReviewItem) {
  if (item.kind === 'srs') return item.review.prompt.slice(0, 48);
  return item.kind === 'hifz_word' ? `${item.reference} · Wort ${item.wordIndex}` : item.reference;
}
