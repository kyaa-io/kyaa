"use client";
import { useEffect, useState } from "react";
import { z } from "zod";

const answer = z.object({ online: z.array(z.string()) });

/** 랭킹에 보이는 크리에이터 중 지금 자기 팬페이지에 들어와 있는 사람(공개 동의한 확인된 본인만, 대표 11/19 20:35).
 * 보이는 동안 30초마다 다시 읽는다. 실패하면 표시만 빠지고 순위·값은 그대로다. */
export function useOnlineCreators(slugs: readonly string[]): ReadonlySet<string> {
  const key = [...slugs].sort().slice(0, 50).join(",");
  const [online, setOnline] = useState<{ key: string; slugs: ReadonlySet<string> }>();
  useEffect(() => {
    if (!key) return;
    let active = true, controller: AbortController | undefined;
    const load = async () => {
      if (document.visibilityState === "hidden" || controller) return;
      const current = new AbortController(); controller = current;
      try {
        const response = await fetch(`/api/groups/online-creators?slugs=${encodeURIComponent(key)}`, { signal: current.signal });
        if (!response.ok) throw new Error(String(response.status));
        const parsed = answer.parse(await response.json());
        if (active) setOnline({ key, slugs: new Set(parsed.online) });
      } catch { if (active && !current.signal.aborted) setOnline({ key, slugs: new Set() }); }
      finally { if (controller === current) controller = undefined; }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const visible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; controller?.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [key]);
  return online?.key === key ? online.slugs : EMPTY;
}
const EMPTY: ReadonlySet<string> = new Set();
