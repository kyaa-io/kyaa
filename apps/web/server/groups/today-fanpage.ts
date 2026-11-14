import "server-only";
import { todayFanpageRowsSchema, type TodayFanpageRow } from "@/features/groups/domain/today-fanpage";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const kstDay = (now: number) => new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);

/** 모임 맨 위 크리에이터 배너의 순서. `read_today_fanpages`(활동 순위)의 slug 순서만 쓰고 공개 상세는 읽지 않는다.
 * 성공한 결과는 KST 하루 동안 같으므로 언어·날짜별로 한 번만 계산한다. 계산 중에 온 요청은 같은 계산을 기다린다.
 * 순위 조회가 실패하면 빈 목록(기본 순서)을 돌려주되 보관하지 않아 다음 요청이 바로 다시 시도한다. */
export function createTodayFanpageLoader(rpc: Rpc, limit: number, now: () => number = Date.now) {
  const cache = new Map<string, Promise<TodayFanpageRow[]>>();
  const compute = async (locale: "ko" | "en") =>
    todayFanpageRowsSchema.parse(await rpc("read_today_fanpages", { p_locale: locale, p_limit: limit }));
  return (locale: "ko" | "en"): Promise<TodayFanpageRow[]> => {
    const day = kstDay(now()), key = `${locale}:${day}`;
    let pending = cache.get(key);
    if (!pending) {
      for (const old of cache.keys()) if (!old.endsWith(day)) cache.delete(old);
      pending = compute(locale).catch(() => { cache.delete(key); return []; });
      cache.set(key, pending);
    }
    return pending;
  };
}
