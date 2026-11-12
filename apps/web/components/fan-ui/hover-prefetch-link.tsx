"use client";

import NextLink, { type LinkProps } from "next/link";
import { useState, type RefAttributes, type AnchorHTMLAttributes } from "react";

/** 앱의 모든 링크가 쓰는 `Link`. `prefetch`를 정하지 않은 링크는 화면에 들어왔다는 이유로 미리 읽지 않고, 포인터·터치·포커스가 닿을 때부터 기본 prefetch를 켠다.
 * 기본(viewport) prefetch는 화면에 보이는 링크마다 동적 RSC 요청 둘 이상을 만들어, 목록 화면 하나가 idle 8초에 10~20건을 보냈다.
 * `prefetch`를 직접 넘기면 그 값 그대로 쓴다. 화면당 요청 수 한도는 `e2e/public/request-budget.spec.ts`가 고정한다. */
export default function Link<RouteType>({ prefetch, onMouseEnter, onTouchStart, onFocus, ...props }: LinkProps<RouteType> & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps<RouteType>> & RefAttributes<HTMLAnchorElement>) {
  const [intent, setIntent] = useState(false);
  if (prefetch !== undefined) return <NextLink {...props} prefetch={prefetch} onMouseEnter={onMouseEnter} onTouchStart={onTouchStart} onFocus={onFocus} />;
  return (
    <NextLink
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={(event) => { setIntent(true); onMouseEnter?.(event); }}
      onTouchStart={(event) => { setIntent(true); onTouchStart?.(event); }}
      onFocus={(event) => { setIntent(true); onFocus?.(event); }}
    />
  );
}
