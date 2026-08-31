'use client';
import { useMemo } from 'react';
import type { LearningHistoryEntry } from '../../types/models';
import { useAppContent, useAppLearning, useAppProgress } from '../../state/AppProvider';
import { buildCoursePathModel } from '../../shared/learning-path';
import { courseTrackLabel, enabledCourseTracks } from '../../shared/course-track-meta';
import { Icon } from '../../components/ui/Icon';
import { PageHeading, Surface } from '../../components/ui/Surface';
import { StudyUtilityFrame } from '../study/StudyUtilityFrame';

export function ProgressPage() {
  const { content } = useAppContent();
const { progress } = useAppProgress();
const { contentProgress, reviewSummary, sessionSummary, history, exerciseResults } = useAppLearning();
  const lastSeven = useMemo(() => buildWeek(history), [history]);
  if (!content) return null;
  const tracks = enabledCourseTracks(progress.preferences.enabledTracks);
  const models = tracks.map(track => ({ track, model: buildCoursePathModel(content, progress, contentProgress, reviewSummary, track) }));
  const maxActivity = Math.max(1, ...lastSeven.map(day => day.count));
  const recentAnswers = exerciseResults.slice(0, 100);
  const accuracy = recentAnswers.length ? Math.round(recentAnswers.filter(item => item.wasCorrect).length / recentAnswers.length * 100) : 0;
  const hifzStable = progress.quranHifzEntries.filter(item => item.status === 'stable' || item.status === 'mastered').length;
  const hifzPercent = progress.quranHifzEntries.length ? Math.round(hifzStable / progress.quranHifzEntries.length * 100) : 0;
  const hifzErrors = progress.quranHifzEntries.reduce((sum, item) => sum + item.errorCount, 0) + progress.quranHifzWordEntries.reduce((sum, item) => sum + item.errorCount, 0);
  const weakItems = [...contentProgress].filter(item => item.wrongCount > 0).sort((a, b) => b.wrongCount - a.wrongCount || a.mastery - b.mastery).slice(0, 12);

  return (
    <StudyUtilityFrame active="progress"><div className="page page--progress">
      <PageHeading eyebrow="Fortschritt" title="Entwicklung auf einen Blick" description="Nur Kennzahlen, die für das Lernen relevant sind." />
      <div className="metric-grid">
        <Metric icon="flame" value={sessionSummary.currentStreak} label="Tage Serie" meta={`Bestwert ${sessionSummary.longestStreak}`} />
        <Metric icon="clock" value={sessionSummary.minutesToday} label="Minuten heute" meta={`${sessionSummary.activeDays} aktive Tage`} />
        <Metric icon="target" value={`${accuracy}%`} label="Trefferquote" meta={`letzte ${recentAnswers.length} Antworten`} />
        <Metric icon="star" value={progress.xp} label="XP gesamt" meta={`${contentProgress.filter(item => item.status === 'mastered').length} Inhalte gemeistert`} />
      </div>

      <div className="progress-columns">
        <Surface className="activity-chart-card">
          <div className="card-heading"><div><span className="eyebrow">Aktivität</span><h2>Letzte 7 Tage</h2></div></div>
          <div className="week-chart">{lastSeven.map(day => <div className="week-bar" key={day.key}><div><i style={{ height: `${Math.max(5, day.count / maxActivity * 100)}%` }} /></div><strong>{day.count}</strong><span>{day.label}</span></div>)}</div>
        </Surface>
        <Surface className="review-health-card">
          <span className="eyebrow">Wiederholung</span><h2>SRS-Status</h2>
          <div className="review-health"><div><strong>{reviewSummary.dueNow}</strong><span>jetzt fällig</span></div><div><strong>{reviewSummary.mastered}</strong><span>stabil</span></div><div><strong>{reviewSummary.total}</strong><span>im System</span></div></div>
          <div className="progress-bar progress-bar--large"><span style={{ width: `${reviewSummary.total ? Math.round(reviewSummary.mastered / reviewSummary.total * 100) : 0}%` }} /></div>
        </Surface>
      </div>

      <div className="progress-columns progress-columns--detail">
        <Surface className="review-health-card">
          <span className="eyebrow">Quran Hifz</span><h2>{hifzPercent}% stabil</h2>
          <div className="review-health"><div><strong>{progress.quranHifzEntries.length}</strong><span>Ayat</span></div><div><strong>{progress.quranHifzWordEntries.length}</strong><span>Woerter</span></div><div><strong>{hifzErrors}</strong><span>Fehler</span></div></div>
        </Surface>
        <Surface className="activity-chart-card">
          <div className="card-heading"><div><span className="eyebrow">Fehlerbank</span><h2>Schwachstellen</h2></div></div>
          <div className="error-bank">{weakItems.length ? weakItems.map(item => <div key={`${item.module}:${item.contentId}`}><span>{item.module}</span><strong>{item.contentId}</strong><b>{item.wrongCount} Fehler</b><small>{item.mastery}% Mastery</small></div>) : <p className="muted">Keine gespeicherten Fehler.</p>}</div>
        </Surface>
      </div>

      <Surface className="history-card">
        <div className="card-heading"><div><span className="eyebrow">Verlauf</span><h2>Letzte Aktivitaeten</h2></div></div>
        <div className="history-list">{history.slice(0, 20).map(item => <div key={item.id}><span>{new Date(item.occurredAt).toLocaleDateString('de-DE')}</span><strong>{item.title}</strong><small>{item.result ?? item.activityType}</small><b>{item.xpDelta ? `+${item.xpDelta} XP` : ''}</b></div>)}</div>
      </Surface>

      <section className="section-block">
        <div className="section-title"><div><span className="eyebrow">Pfade</span><h2>Kursfortschritt</h2></div></div>
        <div className="course-progress-list">{models.map(({ track, model }) => {
          const percent = model.modules.length ? Math.round(model.modules.reduce((sum, item) => sum + item.progress, 0) / model.modules.length) : 0;
          const completed = model.modules.filter(item => item.examPassed).length;
          return <div className="course-progress-row" key={track}><span className="track-symbol">{track === 'fusha' ? 'ض' : track === 'quran' ? 'ق' : 'ع'}</span><div><strong>{courseTrackLabel(track)}</strong><span>{completed} von {model.modules.length} Modulen</span><div className="progress-bar"><i style={{ width: `${percent}%` }} /></div></div><b>{percent}%</b></div>;
        })}</div>
      </section>
    </div></StudyUtilityFrame>
  );
}

function Metric({ icon, value, label, meta }: { icon: 'flame' | 'clock' | 'target' | 'star'; value: number | string; label: string; meta: string }) {
  return <Surface className="metric-card"><span className="metric-icon"><Icon name={icon} size={20} /></span><div><strong>{value}</strong><span>{label}</span><small>{meta}</small></div></Surface>;
}

function buildWeek(history: LearningHistoryEntry[]) {
  const formatter = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - (6 - offset));
    const next = new Date(date); next.setDate(next.getDate() + 1);
    return { key: date.toISOString().slice(0, 10), label: formatter.format(date).replace('.', ''), count: history.filter(item => { const time = new Date(item.occurredAt).getTime(); return time >= date.getTime() && time < next.getTime(); }).length };
  });
}
