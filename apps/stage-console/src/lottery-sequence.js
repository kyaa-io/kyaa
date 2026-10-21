export const WINNER_REVEAL_INTERVAL_MS = 500;

export function createRevealSequence(key, revealedCount, winnerCount) {
  const total = Math.max(0, Math.trunc(winnerCount) || 0);
  return { key, total, initialCount: Math.min(total, Math.max(0, Math.trunc(revealedCount) || 0)) };
}

export function revealCountAt(sequence, elapsedMs, reducedMotion = false) {
  if (reducedMotion) return sequence.total;
  return Math.min(sequence.total, sequence.initialCount + Math.floor(Math.max(0, elapsedMs) / WINNER_REVEAL_INTERVAL_MS));
}

export const WINNERS_PER_PAGE = 6;
export const WINNER_PAGE_HOLD_MS = 8_000;

export function winnerPage(revealedCount, winnerCount, offset = 0) {
  const count = Math.min(Math.max(0, Math.trunc(revealedCount) || 0), Math.max(0, winnerCount));
  const pageCount = Math.max(1, Math.ceil(count / WINNERS_PER_PAGE));
  const latestPage = Math.max(0, Math.ceil(count / WINNERS_PER_PAGE) - 1);
  const page = ((latestPage + offset) % pageCount + pageCount) % pageCount;
  const start = page * WINNERS_PER_PAGE;
  return { page, pageCount, start, end: Math.min(count, start + WINNERS_PER_PAGE) };
}

export function revealSounds(previousCount, nextCount, winnerCount, reducedMotion = false) {
  const advanced = nextCount > previousCount;
  return { ball: advanced && !reducedMotion, complete: advanced && winnerCount > 0 && previousCount < winnerCount && nextCount >= winnerCount };
}
