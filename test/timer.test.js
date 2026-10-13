import { test } from 'node:test';
import assert from 'node:assert/strict';
import { READING_MS, WRITING_MS, timerState, formatClock } from '../src/timer.js';

const START = 1_700_000_000_000;

test('timer starts in the reading period with 15:00 left', () => {
  const s = timerState(START, START);
  assert.equal(s.phase, 'reading');
  assert.equal(formatClock(s.remainingMs), '15:00');
});

test('timer moves from reading to writing at 15 minutes', () => {
  assert.equal(timerState(START, START + READING_MS - 1).phase, 'reading');
  const s = timerState(START, START + READING_MS);
  assert.equal(s.phase, 'writing');
  assert.equal(formatClock(s.remainingMs), '45:00');
});

test('timer is done at 60 minutes', () => {
  assert.deepEqual(timerState(START, START + READING_MS + WRITING_MS), { phase: 'done', remainingMs: 0 });
});

test('timer is right after the phone sleeps for 20 minutes or 3 hours', () => {
  const s = timerState(START, START + 20 * 60_000);
  assert.equal(s.phase, 'writing');
  assert.equal(formatClock(s.remainingMs), '40:00');
  assert.equal(timerState(START, START + 3 * 3_600_000).phase, 'done');
});

test('timer never shows more than 15:00 when the clock moves backwards', () => {
  const s = timerState(START, START - 60_000);
  assert.equal(s.phase, 'reading');
  assert.equal(formatClock(s.remainingMs), '15:00');
});

test('formatClock rounds up to whole seconds', () => {
  assert.equal(formatClock(61_000), '01:01');
  assert.equal(formatClock(59_001), '01:00');
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(-5), '00:00');
});
