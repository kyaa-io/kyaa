import "server-only";
import { todayFanpageRowsSchema, type TodayFanpage } from "@/features/groups/domain/today-fanpage";
import type { GroupDetail } from "@/features/groups/domain/contracts";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
type Detail = (slug: string, locale: "ko" | "en") => Promise<GroupDetail | null>;
const kstDay = (now: number) => new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);

/** 모임 맨 위 '오늘의 팬페이지'. 고르기는 `read_today_fanpages`, 사진·이름은 팬페이지 화면과 같은 공개 상세에서 읽는다.
 * 결과는 KST 하루 동안 같으므로 언어·날짜별로 한 번만 계산한다. 계산 중에 온 요청은 같은 계산을 기다린다(빈 캐시 동시 요청에도 1회).
 * 실패하면 빈 목록(모임 화면은 배너 없이 열린다)이고, 실패는 보관하지 않아 다음 요청이 다시 계산한다. */
export function createTodayFanpageLoader(rpc: Rpc, detail: Detail, limit: number, now: () => number = Date.now) {
  const cache = new Map<string, Promise<TodayFanpage[]>>();
  const compute = async (locale: "ko" | "en") => {
    const rows = todayFanpageRowsSchema.parse(await rpc("read_today_fanpages", { p_locale: locale, p_limit: limit }));
    const items = await Promise.all(rows.map(async (row) => {
      const page = (await detail(row.slug, locale))?.page;
      return page ? { ...row, name: page.name || row.name || row.slug, imageUrl: page.imageUrl } : null;
    }));
    return items.filter((item): item is TodayFanpage => item !== null);
  };
  return (locale: "ko" | "en"): Promise<TodayFanpage[]> => {
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
