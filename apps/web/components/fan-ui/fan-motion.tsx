"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";

type PopComponent = ComponentType<{ kind: "reward" | "complete"; children: ReactNode }>;
let popModule: Promise<PopComponent> | null = null;
const loadPop = () => (popModule ??= import("./fan-motion-pop").then((module) => module.default));

export type FanRewardPopProps = Readonly<{
  /** 이 값이 바뀔 때 한 번 연출한다(첫 마운트는 연출 없음). 보통 완료 여부나 지급 횟수. */
  trigger: string | number | boolean;
  /** `complete`: 미션 완료 스탬프 scale .6→1, `reward`: 포인트·출석 획득 표시가 아래에서 올라옴. 둘 다 600ms 1회. */
  kind?: "reward" | "complete";
  children: ReactNode;
}>;

/** 보상·미션 완료·출석 연출(S3). Motion은 값이 실제로 바뀐 뒤에만 내려받으므로 홈 첫 로드 JS에 포함되지 않는다.
 * 자리는 처음부터 차지하므로 레이아웃이 흔들리지 않는다(CLS 0). */
export function FanRewardPop({ trigger, kind = "complete", children }: FanRewardPopProps) {
  const first = useRef(trigger);
  const [run, setRun] = useState<{ Pop: PopComponent; key: number } | null>(null);
  useEffect(() => {
    if (Object.is(first.current, trigger)) return;
    first.current = trigger;
    let alive = true;
    void loadPop().then((Pop) => { if (alive) setRun((current) => ({ Pop, key: (current?.key ?? 0) + 1 })); }).catch(() => undefined);
    return () => { alive = false; };
  }, [trigger]);
  if (!run) return <>{children}</>;
  const { Pop } = run;
  return <Pop key={run.key} kind={kind}>{children}</Pop>;
}

const ROUTE_KEYFRAMES: Keyframe[] = [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }];

/** 페이지 전환(S3): 경로가 바뀔 때 본문만 opacity 0→1 + y 8→0, 240ms. 재마운트하지 않고(상태·스크롤 유지) Web Animations로 같은 요소에 한 번 건다.
 * 첫 로드에는 연출하지 않아 LCP에 영향이 없다. 머리·탭·헤더는 이 밖에 둔다. reduced-motion이면 없음. */
export function FanRouteTransition({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const node = ref.current;
    if (!node || typeof node.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const animation = node.animate(ROUTE_KEYFRAMES, { duration: 240, easing: "cubic-bezier(.2, 0, 0, 1)" });
    return () => animation.cancel();
  }, [pathname]);
  return <div ref={ref} className={className} data-fan-route-transition="">{children}</div>;
}
