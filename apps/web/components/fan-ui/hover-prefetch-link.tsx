"use client";

import NextLink, { type LinkProps } from "next/link";
import { useState, type ComponentType, type RefAttributes, type AnchorHTMLAttributes } from "react";
import type { UrlObject } from "url";

// 이 래퍼를 제네릭으로 두면 호출마다 RouteType 을 전체 경로 유니언에 맞춰 추론해, 경로가 늘면 TS2589(타입 깊이 초과)가 곳곳에서 난다.
// 호출부는 이미 `as Route` 로 검증된 문자열을 넘기므로, 래퍼는 문자열·UrlObject href 를 받고 NextLink 는 한 번만 형 변환한다.
type BaseLinkProps = Omit<LinkProps<string>, "href"> & { href: string | UrlObject };
export type AppLinkProps = BaseLinkProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseLinkProps> & RefAttributes<HTMLAnchorElement>;
const UntypedNextLink = NextLink as unknown as ComponentType<AppLinkProps>;

/** 앱의 모든 링크가 쓰는 `Link`. `prefetch`를 정하지 않은 링크는 화면에 들어왔다는 이유로 미리 읽지 않고, 포인터·터치·포커스가 닿을 때부터 기본 prefetch를 켠다.
 * 기본(viewport) prefetch는 화면에 보이는 링크마다 동적 RSC 요청 둘 이상을 만들어, 목록 화면 하나가 idle 8초에 10~20건을 보냈다.
 * `prefetch`를 직접 넘기면 그 값 그대로 쓴다. 화면당 요청 수 한도는 `e2e/public/request-budget.spec.ts`가 고정한다. */
export default function Link({ prefetch, onMouseEnter, onTouchStart, onFocus, ...props }: AppLinkProps) {
  const [intent, setIntent] = useState(false);
  if (prefetch !== undefined) return <UntypedNextLink {...props} prefetch={prefetch} onMouseEnter={onMouseEnter} onTouchStart={onTouchStart} onFocus={onFocus} />;
  return (
    <UntypedNextLink
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={(event) => { setIntent(true); onMouseEnter?.(event); }}
      onTouchStart={(event) => { setIntent(true); onTouchStart?.(event); }}
      onFocus={(event) => { setIntent(true); onFocus?.(event); }}
    />
  );
}
