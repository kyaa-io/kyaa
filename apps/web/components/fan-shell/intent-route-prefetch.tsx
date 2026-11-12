"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REPEAT_MS = 30_000;

/** 주 탭 링크에 포인터가 들어오거나 터치·포커스가 닿을 때만 그 화면을 전체(`full`) 미리 읽는다.
 * 첫 로드 뒤 모든 탭을 한꺼번에 읽으면 방문마다 동적 SSR(RSC)이 탭 수만큼 늘어난다. 탭 링크는 `data-fan-navigation-id`를 가진다. */
export function IntentRoutePrefetch({ hrefs }: { hrefs: readonly string[] }) {
  const router = useRouter();
  const key = hrefs.join("\n");
  useEffect(() => {
    const targets = new Set(key ? key.split("\n") : []);
    if (!targets.size || typeof router.prefetch !== "function") return;
    // `full`: 로딩 경계가 없는 동적 화면이라 기본(auto)으로는 아무것도 읽지 않는다.
    const prefetch = router.prefetch.bind(router) as unknown as (href: string, options: { kind: "full" }) => void;
    const last = new Map<string, number>();
    const onIntent = (event: Event) => {
      const link = event.target instanceof Element ? event.target.closest("a[data-fan-navigation-id]") : null;
      const href = link?.getAttribute("href");
      if (!href || !targets.has(href)) return;
      const now = Date.now();
      if (now - (last.get(href) ?? -REPEAT_MS) < REPEAT_MS) return;
      last.set(href, now);
      prefetch(href, { kind: "full" });
    };
    const events = ["pointerover", "touchstart", "focusin"] as const;
    const options = { passive: true, capture: true } as const;
    for (const name of events) document.addEventListener(name, onIntent, options);
    return () => { for (const name of events) document.removeEventListener(name, onIntent, options); };
  }, [key, router]);
  return null;
}
