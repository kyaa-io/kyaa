"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 주 탭의 다른 화면을 첫 로드가 끝난 뒤 한가할 때 미리 읽는다.
 * 뷰포트 진입 즉시 전체를 읽으면(`prefetch`) 탭 화면의 JS·RSC가 첫 화면의 그림·스크립트와 같은 대역을 나눠 LCP와 hydration을 늦춘다. */
export function IdleRoutePrefetch({ hrefs }: { hrefs: readonly string[] }) {
  const router = useRouter();
  const key = hrefs.join("\n");
  useEffect(() => {
    const targets = key ? key.split("\n") : [];
    if (!targets.length) return;
    let timer: ReturnType<typeof setTimeout> | undefined, idle: number | undefined;
    // `full`: 로딩 경계가 없는 동적 화면이라 기본(auto)으로는 아무것도 읽지 않는다.
    if (typeof router.prefetch !== "function") return;
    const prefetch = router.prefetch.bind(router) as unknown as (href: string, options: { kind: "full" }) => void;
    const run = () => { for (const href of targets) prefetch(href, { kind: "full" }); };
    const schedule = () => {
      timer = setTimeout(() => {
        if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(run, { timeout: 4000 });
        else run();
      }, 3000);
    };
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });
    return () => {
      window.removeEventListener("load", schedule);
      clearTimeout(timer);
      if (idle !== undefined && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
    };
  }, [key, router]);
  return null;
}
