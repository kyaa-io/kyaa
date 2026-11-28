import { inRaffleWindow } from '../../features/benefit/domain/signup-event';
import { localSnapshotSchema, type LocalSnapshot } from './local';

/** 응모 직후 화면이 말하는 '오늘'과 '내일 다시 오면'의 재료: 이벤트 시간대(기본 한국 시간)의 날짜로 서버가 센 값. */
export type RaffleDaily = {
  /** 오늘 출석한 횟수(출석 기록 수). 0이면 오늘 아직 출석하지 않았다. */
  attendedToday: number;
  /** 이어서 출석한 날 수. 오늘 출석했으면 오늘까지, 아직이면 어제까지(오늘 출석하면 이어진다). 어제도 안 했으면 0. */
  streak: number;
  /** 다음 날이 시작되는 시각(밀리초). 출석이 다시 열리는 때. */
  nextDayAt: number;
  /** 응모한 날로부터 지난 날 수(오늘 응모하면 0). 응모하지 않았으면 없다. */
  daysSinceEntry?: number;
};

const dayOf = (time: number, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;

/** 지금 날짜가 바뀌는 첫 순간. 하루 안에서 이분 탐색한다(서머타임 시간대도 맞는다). */
function nextDayStart(now: number, timeZone: string) {
  const today = dayOf(now, timeZone);
  let low = now, high = now + 26 * 3_600_000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (dayOf(middle, timeZone) === today) low = middle; else high = middle;
  }
  return high;
}

export function raffleDaily(input: LocalSnapshot, userId: string, now = Date.now()): RaffleDaily {
  const snapshot = localSnapshotSchema.parse(input), { policy } = snapshot;
  const today = dayNumber(dayOf(now, policy.timeZone));
  const days = new Set<number>();
  let attendedToday = 0;
  const seen = new Set<string>();
  for (const action of snapshot.actions) {
    if (action.userId !== userId || action.kind !== 'attendance' || !inRaffleWindow(action.occurredAt, policy) || seen.has(action.sourceId)) continue;
    seen.add(action.sourceId);
    const day = dayNumber(dayOf(Date.parse(action.occurredAt), policy.timeZone));
    days.add(day);
    if (day === today) attendedToday++;
  }
  let streak = 0;
  for (let day = days.has(today) ? today : today - 1; days.has(day); day--) streak++;
  const enteredAt = snapshot.entries.filter(entry => entry.userId === userId).map(entry => Date.parse(entry.enteredAt)).sort((a, b) => a - b)[0];
  return {
    attendedToday, streak, nextDayAt: nextDayStart(now, policy.timeZone),
    ...(enteredAt === undefined ? {} : { daysSinceEntry: Math.max(0, today - dayNumber(dayOf(enteredAt, policy.timeZone))) }),
  };
}
