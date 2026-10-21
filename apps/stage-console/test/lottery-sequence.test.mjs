import test from 'node:test';
import assert from 'node:assert/strict';
import { createRevealSequence, revealCountAt } from '../src/lottery-sequence.js';

test('confirmed winners appear only at 500ms boundaries and never exceed supplied results', () => {
  const sequence = createRevealSequence('draw-1/prize-1', 0, 3);
  assert.deepEqual([0, 499, 500, 999, 1000, 1500, 99999].map(ms => revealCountAt(sequence, ms)), [0, 0, 1, 1, 2, 3, 3]);
});
test('reconnect starts from saved cursor; a new prize has an independent sequence', () => {
  const resumed = createRevealSequence('draw-1/prize-1', 2, 3);
  const next = createRevealSequence('draw-1/prize-2', 0, 4);
  assert.equal(revealCountAt(resumed, 0), 2);
  assert.equal(revealCountAt(resumed, 500), 3);
  assert.equal(revealCountAt(next, 0), 0);
  assert.equal(next.key, 'draw-1/prize-2');
});
test('reduced motion shows only supplied confirmed winners; invalid cursors are bounded', () => {
  assert.equal(revealCountAt(createRevealSequence('a', 0, 4), 0, true), 4);
  assert.equal(revealCountAt(createRevealSequence('a', 99, 2), 0), 2);
  assert.equal(revealCountAt(createRevealSequence('a', -2, 2), -100), 0);
  assert.equal(revealCountAt(createRevealSequence('a', 0, 0), 10000, true), 0);
});

test('six-person pages follow the latest revealed name without exposing unrevealed names', async () => {
  const { winnerPage } = await import('../src/lottery-sequence.js');
  assert.deepEqual(winnerPage(0, 20), { page: 0, pageCount: 1, start: 0, end: 0 });
  assert.deepEqual(winnerPage(6, 20), { page: 0, pageCount: 1, start: 0, end: 6 });
  assert.deepEqual(winnerPage(7, 20), { page: 1, pageCount: 2, start: 6, end: 7 });
  assert.deepEqual(winnerPage(20, 20), { page: 3, pageCount: 4, start: 18, end: 20 });
  assert.deepEqual(winnerPage(20, 20, 1), { page: 0, pageCount: 4, start: 0, end: 6 });
  assert.deepEqual(winnerPage(20, 20, -1), { page: 2, pageCount: 4, start: 12, end: 18 });
  assert.equal(winnerPage(99, 20).end, 20);
});
test('ding accompanies each normal reveal; full fanfare triggers only on completion, never restore', async () => {
  const { revealSounds } = await import('../src/lottery-sequence.js');
  assert.deepEqual(revealSounds(0, 1, 20), { ball: true, complete: false });
  assert.deepEqual(revealSounds(19, 20, 20), { ball: true, complete: true });
  assert.deepEqual(revealSounds(20, 20, 20), { ball: false, complete: false });
  assert.deepEqual(revealSounds(0, 20, 20, true), { ball: false, complete: true });
  assert.deepEqual(revealSounds(0, 0, 0, true), { ball: false, complete: false });
});
