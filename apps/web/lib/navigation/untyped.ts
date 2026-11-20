import { permanentRedirect, redirect, type RedirectType } from "next/navigation";

// next typedRoutes 의 router.push/replace/prefetch·redirect 는 제네릭이라 호출마다 전체 경로 유니언에 맞춰 추론하고,
// 경로가 늘면 이미지 빌드 typecheck 에서 TS2589(타입 깊이 초과)가 곳곳에서 난다. 일반 typecheck 에서는 제네릭이 아니라 형 인자를 쓸 수도 없다.
// 이미 Route 로 검증된 문자열을 넘기는 호출은 아래 비제네릭 별칭을 쓴다. 런타임 동작은 원래 함수와 같다.
type NavigateOptions = { scroll?: boolean };
export type UntypedRouter = {
  push(href: string, options?: NavigateOptions): void;
  replace(href: string, options?: NavigateOptions): void;
  prefetch(href: string, options?: object): void;
};

export function untypedRouter(router: unknown): UntypedRouter {
  return router as UntypedRouter;
}

export const redirectTo: (url: string, type?: RedirectType) => never = redirect as unknown as (url: string, type?: RedirectType) => never;
export const permanentRedirectTo: (url: string, type?: RedirectType) => never = permanentRedirect as unknown as (url: string, type?: RedirectType) => never;
