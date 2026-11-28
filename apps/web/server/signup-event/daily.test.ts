import { describe, expect, it } from 'vitest';
import { localSnapshotSchema } from './local';
import { raffleDaily } from './daily';

const me = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002';
// 한국 시간 11/20 09:00 = 11/20 00:00 UTC
const now = Date.parse('2026-11-20T00:00:00Z');
const snapshot = (attendances: string[], enteredAt = '2026-11-18T02:00:00Z') => localSnapshotSchema.parse({
  users: [me, other].map(id => ({ id, createdAt: '2025-01-01T00:00:00Z' })),
  actions: attendances.map((occurredAt, index) => ({ userId: me, kind: 'attendance', sourceId: `a${index}`, occurredAt })),
  entries: [{ userId: me, enteredAt }],
});

describe('raffleDaily', () => {
  it('counts today and a streak that runs through today', () => {
    const daily = raffleDaily(snapshot(['2026-11-18T03:00:00Z', '2026-11-19T03:00:00Z', '2026-11-20T00:10:00Z']), me, now + 60_000);
    expect(daily).toMatchObject({ attendedToday: 1, streak: 3, daysSinceEntry: 2 });
  });
  it('keeps yesterday\'s streak alive until today ends, and drops it after a missed day', () => {
    expect(raffleDaily(snapshot(['2026-11-18T03:00:00Z', '2026-11-19T03:00:00Z']), me, now)).toMatchObject({ attendedToday: 0, streak: 2 });
    expect(raffleDaily(snapshot(['2026-11-17T03:00:00Z', '2026-11-18T03:00:00Z']), me, now)).toMatchObject({ attendedToday: 0, streak: 0 });
  });
  it('splits days at the event timezone, not at UTC', () => {
    // 11/19 23:30 KST = 11/19 14:30 UTC, 11/20 00:30 KST = 11/19 15:30 UTC: two different Korean days
    const daily = raffleDaily(snapshot(['2026-11-19T14:30:00Z', '2026-11-19T15:30:00Z']), me, Date.parse('2026-11-19T16:00:00Z'));
    expect(daily).toMatchObject({ attendedToday: 1, streak: 2 });
  });
  it('opens the next day at the next midnight of the event timezone', () => {
    expect(raffleDaily(snapshot([]), me, now).nextDayAt).toBe(Date.parse('2026-11-20T15:00:00Z'));
    expect(raffleDaily(snapshot([]), me, Date.parse('2026-11-20T14:59:59Z')).nextDayAt).toBe(Date.parse('2026-11-20T15:00:00Z'));
  });
  it('has no entry age for someone who has not entered, and ignores other members and duplicate rows', () => {
    expect(raffleDaily(snapshot([]), other, now).daysSinceEntry).toBeUndefined();
    const twice = localSnapshotSchema.parse({ ...snapshot(['2026-11-20T00:10:00Z']), actions: [
      { userId: me, kind: 'attendance', sourceId: 'same', occurredAt: '2026-11-20T00:10:00Z' },
      { userId: me, kind: 'attendance', sourceId: 'same', occurredAt: '2026-11-20T00:10:00Z' },
      { userId: other, kind: 'attendance', sourceId: 'x', occurredAt: '2026-11-20T00:10:00Z' },
    ] });
    expect(raffleDaily(twice, me, now + 60_000).attendedToday).toBe(1);
  });
});
