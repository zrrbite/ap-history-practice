// The DBQ timer: a 15-minute reading period, then 45 minutes of writing. It works from
// wall-clock times, so it stays right when a phone sleeps or a tab sits in the background.
export const READING_MS = 15 * 60 * 1000;
export const WRITING_MS = 45 * 60 * 1000;

export function timerState(startMs, nowMs) {
  const elapsed = Math.max(0, nowMs - startMs);
  if (elapsed < READING_MS) return { phase: 'reading', remainingMs: READING_MS - elapsed };
  if (elapsed < READING_MS + WRITING_MS) return { phase: 'writing', remainingMs: READING_MS + WRITING_MS - elapsed };
  return { phase: 'done', remainingMs: 0 };
}

// "mm:ss", rounded up so the clock reads 00:00 only when time is really up.
export function formatClock(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
