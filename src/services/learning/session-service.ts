import type { LearningSession, SessionSummary } from '../../types/models';

function localDateKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayDifference(later: string, earlier: string): number {
  const laterParts = later.split('-').map(Number);
  const earlierParts = earlier.split('-').map(Number);
  if (laterParts.length !== 3 || earlierParts.length !== 3) return 0;
  const [ly, lm, ld] = laterParts as [number, number, number];
  const [ey, em, ed] = earlierParts as [number, number, number];
  return Math.round((Date.UTC(ly, lm - 1, ld) - Date.UTC(ey, em - 1, ed)) / 86_400_000);
}

export interface SessionDayAggregate {
  date: string;
  durationSeconds: number;
}

export function summarizeSessionDays(days: SessionDayAggregate[], reference = new Date()): SessionSummary {
  const today = localDateKey(reference);
  const byDay = new Map<string, number>();
  for (const day of days) {
    const duration = Math.max(0, Number(day.durationSeconds) || 0);
    byDay.set(day.date, (byDay.get(day.date) ?? 0) + duration);
  }

  const activeDays = [...byDay.entries()]
    .filter(([, seconds]) => seconds >= 30)
    .map(([key]) => key)
    .sort();

  let longestStreak = 0;
  let running = 0;
  let previous: string | null = null;
  for (const day of activeDays) {
    running = !previous || dayDifference(day, previous) === 1 ? running + 1 : 1;
    longestStreak = Math.max(longestStreak, running);
    previous = day;
  }

  let currentStreak = 0;
  if (activeDays.length) {
    const last = activeDays.at(-1);
    if (last && dayDifference(today, last) <= 1) {
      currentStreak = 1;
      for (let index = activeDays.length - 1; index > 0; index -= 1) {
        const current = activeDays[index];
        const previousDay = activeDays[index - 1];
        if (!current || !previousDay || dayDifference(current, previousDay) !== 1) break;
        currentStreak += 1;
      }
    }
  }

  return {
    minutesToday: Math.floor((byDay.get(today) ?? 0) / 60),
    currentStreak,
    longestStreak,
    activeDays: activeDays.length,
    lastActiveDate: activeDays.at(-1) ?? null
  };
}

export function summarizeSessions(sessions: LearningSession[], reference = new Date()): SessionSummary {
  const byDay = new Map<string, number>();
  for (const session of sessions) {
    if (session.activityCount <= 0) continue;
    const key = localDateKey(session.startedAt);
    const duration = Math.max(0, Number(session.durationSeconds) || 0);
    byDay.set(key, (byDay.get(key) ?? 0) + duration);
  }
  return summarizeSessionDays([...byDay].map(([date, durationSeconds]) => ({ date, durationSeconds })), reference);
}

const MAX_ACTIVITY_GAP_SECONDS = 300;

export function recordSessionActivity(session: LearningSession, at = new Date()): LearningSession {
  const previousActivityAt = new Date(session.endedAt ?? session.startedAt).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((at.getTime() - previousActivityAt) / 1000));
  return {
    ...session,
    endedAt: at.toISOString(),
    durationSeconds: session.durationSeconds + Math.min(elapsedSeconds, MAX_ACTIVITY_GAP_SECONDS),
    activityCount: session.activityCount + 1
  };
}

export function endSession(session: LearningSession, at = new Date()): LearningSession {
  return { ...session, endedAt: at.toISOString() };
}
