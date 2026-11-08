"use client";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useOptimistic, useRef, useState, startTransition, type ReactNode } from "react";
import { fanLoginHref } from "@/components/login-href";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import type { FanStarActionProps } from "@/components/fan-ui/fan-star-action";
import type { FanPageKind } from "@/components/fan-ui/fan-entity-card";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { mySummaryPath, mySummarySchema } from "@/features/my/domain/my-summary";
import { fanPageReturnPath, fanVerifyHref, sanitizeLiveReturnTo } from "@/features/quiz/domain/live-return-context";
import { useAppLocale } from "@/components/locale-provider";
import { parseAppLocale, toContentLocale, type AppLocale } from "@/i18n/locales";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import { groupDetailSchema, safeGroupReturnTo, type GroupDetail, type GroupPage } from "../domain/contracts";
import { GroupPresenceContext, useOwnGroupPresence, type GroupPresenceResult } from "./use-group-presence";
import { usePreloadGroupResource } from "./use-group-preload";
import { type GroupRequestError, useGroupResource } from "./use-group-resource";
import { useLinkedFanpage } from "./use-linked-fanpage";

const parseDetail = (value: unknown) => groupDetailSchema.parse(value);
const parseSummary = (body: unknown) => mySummarySchema.parse((body as { summary: unknown }).summary);

export type GroupPageSummary = ReturnType<typeof useOwnedFanResource<ReturnType<typeof parseSummary>>>;

export type GroupPageContextValue = {
  locale: AppLocale;
  /** `/pages/groups/{id}`로 들어왔으면 그 id, `/{slug}`로 들어왔으면 null. 링크가 들어온 주소 계열에 머문다. */
  routePageId: string | null;
  routeSlug: string | null;
  page: GroupPage | undefined;
  detail: GroupDetail | undefined;
  membership: GroupDetail["membership"] | null;
  /** 연결된 팬페이지·브랜드 크리에이터. 일반 모임은 undefined. */
  celebrity: PublishedCelebrity | undefined;
  celebrityFailed: boolean;
  retryCelebrity: () => void;
  kind: FanPageKind | undefined;
  authenticated: boolean;
  ready: boolean;
  ownerKey: string;
  loading: boolean;
  error: boolean;
  failure: GroupRequestError | undefined;
  /** 페이지 상세를 다시 읽는다(가입·메뉴 변경 뒤). */
  refresh: () => void;
  /** 들어온 주소 계열 안의 탭 주소. 본문은 주소를 직접 조립하지 않는다. */
  hrefFor: (tab: string, extra?: Readonly<Record<string, string | undefined>>) => Route;
  /** 주소의 탭. 누른 즉시 눌린 탭으로 먼저 바뀐다. */
  activeTab: string;
  selectTab: (tab: string) => void;
  preloadTab: (tab: string) => void;
  startJoin: () => void;
  joinPending: boolean;
  joinLabel: string;
  joinFormOpen: boolean;
  closeJoinForm: () => void;
  joinAnswer: string;
  setJoinAnswer: (value: string) => void;
  submitJoin: () => void;
  joinFailed: boolean;
  actionFailed: boolean;
  star: FanStarActionProps | undefined;
  /** 내 팬 등급의 출처. 비로그인이면 호출하지 않는다. */
  summary: GroupPageSummary;
  presence: GroupPresenceResult;
  /** 서버 상세로 그리는 동안 회원 메뉴 자리를 비워 둔다. */
  reserveMenu?: boolean;
  /** The server read the page's public posts and found none: the home gallery has nothing to hold space for and the story preview opens at its empty height. */
  publicPostsEmpty?: boolean;
};

const GroupPageContext = createContext<GroupPageContextValue | null>(null);
export const useOptionalGroupPage = () => useContext(GroupPageContext);
export function useGroupPage() {
  const value = useContext(GroupPageContext);
  if (!value) throw new Error("useGroupPage must be used inside GroupPageProvider");
  return value;
}

const TAB_KEYS: Readonly<Record<string, readonly string[]>> = {
  rooms: ["room"],
  calendar: ["month"],
  board: ["section", "source", "news", "media", "post", "category", "search", "sort", "cursor"],
  news: ["post", "category", "search", "sort", "cursor"],
};

/** 페이지 상세·연결 크리에이터·접속·팬 등급을 한 번만 읽고, 가입 상태를 소유한다. 탭 본문은 useGroupPage()로 읽는다. */
export function GroupPageProvider({ pageId, slug, celebrity: serverCelebrity, celebrityLocale, locale: localeProp, initialTab, initialDetail, reserveMenu = false, publicPostsEmpty = false, children }: {
  pageId?: string;
  /** 서버가 비로그인 독자로 읽은 상세. 이 사람의 상세가 처음 도착할 때까지 머리를 그린다. */
  initialDetail?: GroupDetail;
  /** 로그인한 브라우저: 서버 상세로 그리는 동안 회원 메뉴 자리를 비워 둔다. */
  reserveMenu?: boolean;
  publicPostsEmpty?: boolean;
  slug?: string;
  /** 서버가 읽은 크리에이터. `celebrityLocale`이 지금 언어와 다르면 다시 읽는다. */
  celebrity?: PublishedCelebrity;
  celebrityLocale?: string;
  locale?: AppLocale;
  /** 화면이 라우트 밖에서 쓰일 때 넘기는 탭. 없으면 주소의 `tab`을 읽는다. */
  initialTab?: string;
  children: ReactNode;
}) {
  const query = useSearchParams();
  const requested = query?.getAll("locale") ?? [];
  const { locale: appLocale } = useAppLocale();
  const locale = localeProp ?? (requested.length === 1 ? parseAppLocale(requested[0], appLocale) : appLocale);
  const url = pageId ? `/api/groups/${pageId}` : slug ? `/api/groups/resolve/${encodeURIComponent(slug)}` : null;
  const queryTab = initialTab ?? query?.get("tab") ?? "home";
  const viewerDetail = useGroupResource(url, parseDetail, { nameLocale: queryTab !== "manage" });
  // 서버 상세는 처음 읽는 동안만 쓴다. 가입·북마크 같은 이 사람의 값은 없으므로 그동안 행동 버튼은 기다린다.
  const provisional = !viewerDetail.data && viewerDetail.loading && !viewerDetail.error && initialDetail?.page.id === pageId ? initialDetail : undefined;
  const detail = provisional ? { ...viewerDetail, data: provisional } : viewerDetail;
  const page = detail.data?.page;
  const pageMatches = !pageId || page?.id === pageId;
  const serverCelebrityUsable = serverCelebrity && (!celebrityLocale || celebrityLocale === toContentLocale(locale) || serverCelebrity.roles.includes("brand"));
  const linked = useLinkedFanpage(!serverCelebrityUsable && !detail.error && pageMatches ? page : undefined, locale);
  const celebrity = (serverCelebrityUsable ? serverCelebrity : linked.data ?? serverCelebrity) as PublishedCelebrity | undefined;
  const membership = detail.data?.membership ?? null;
  const { retry: refresh, request, authenticated, ready, ownerKey } = detail;

  const presencePageId = page && pageMatches && !provisional ? page.id : null;
  const presence = useOwnGroupPresence(presencePageId, true, Boolean(membership));

  const auth = useByUsAuth();
  const summary = useOwnedFanResource(auth.authenticated ? mySummaryPath(toContentLocale(locale)) : null, parseSummary, auth);

  const [activeTab, setActiveTab] = useOptimistic(queryTab);
  const selectTab = useCallback((tab: string) => { startTransition(() => setActiveTab(tab)); }, [setActiveTab]);
  const preload = usePreloadGroupResource();
  const preloadTab = useCallback((tab: string) => {
    if (!presencePageId || !ready) return;
    if (tab === "rooms") preload(`/api/groups/${presencePageId}/${authenticated ? "rooms" : "public-rooms"}`);
  }, [authenticated, preload, presencePageId, ready]);

  const queryString = query?.toString() ?? "";
  const hrefFor = useCallback((tab: string, extra?: Readonly<Record<string, string | undefined>>) => {
    const current = new URLSearchParams(queryString);
    const next = new URLSearchParams({ locale, tab });
    for (const key of ["returnTo", ...(TAB_KEYS[tab] ?? [])]) { const value = current.get(key); if (value) next.set(key, value); }
    for (const [key, value] of Object.entries(extra ?? {})) { if (value) next.set(key, value); else next.delete(key); }
    const path = pageId ? `/pages/groups/${pageId}` : `/${slug ?? page?.slug ?? ""}`;
    return `${path}?${next}` as Route;
  }, [locale, page?.slug, pageId, queryString, slug]);

  const returnTo = safeGroupReturnTo(new URLSearchParams(queryString).get("returnTo") ?? undefined);
  const [answer, setAnswer] = useState(""), [pending, setPending] = useState(false), [actionFailed, setActionFailed] = useState(false), [joinFailed, setJoinFailed] = useState(false), [joinFormOpen, setJoinFormOpen] = useState(false), [joinedEarly, setJoinedEarly] = useState(false);
  const operation = useRef<{ body: string; requestId: string } | undefined>(undefined);
  const join = useCallback(async (input: { answer: string }) => {
    if (pending || !page) return;
    setPending(true); setActionFailed(false); setJoinFailed(false);
    if (!page.question) setJoinedEarly(true); // 질문 없는 페이지는 먼저 가입한 모양으로 바꾸고 실패하면 되돌린다.
    const body = JSON.stringify(["membership", "POST", input]);
    if (operation.current?.body !== body) operation.current = { body, requestId: crypto.randomUUID() };
    try {
      await request(`/api/groups/${page.id}/membership`, { method: "POST", body: JSON.stringify({ ...input, requestId: operation.current.requestId }) });
      operation.current = undefined;
      refresh();
      setJoinFormOpen(false);
      if (returnTo) window.location.assign(returnTo);
    } catch {
      setActionFailed(true); setJoinFailed(true); setJoinedEarly(false);
    } finally { setPending(false); }
  }, [page, pending, refresh, request, returnTo]);
  useEffect(() => { if (membership) setJoinedEarly(false); }, [membership]);
  const kind: FanPageKind | undefined = page?.kind ?? (celebrity ? celebrity.roles.includes("brand") ? "brand" : "fan" : undefined);
  // A fan page has no join step: the entry check is the join. It comes back to where the fan pressed, or to the page that sent them here.
  const here = fanPageReturnPath(pageId ? `/pages/groups/${pageId}` : `/${slug ?? page?.slug ?? ""}`, queryString, locale);
  const verifyTarget = celebrity?.slug ?? page?.slug;
  const verifyHref = verifyTarget ? fanVerifyHref(verifyTarget, locale, sanitizeLiveReturnTo(returnTo) ?? here) : undefined;
  const startJoin = useCallback(() => {
    if (!page) return;
    if (kind === "fan") { if (verifyHref) window.location.assign(verifyHref); return; }
    if (page.question) setJoinFormOpen(true); else void join({ answer: "" });
  }, [join, kind, page, verifyHref]);

  const passportId = summary.state.status === "ready" ? summary.state.data.creators.find((item) => item.celebrity.slug === (celebrity?.slug ?? page?.slug))?.passport?.id : undefined;
  const signedOut = ready && !authenticated;
  const star = useMemo<FanStarActionProps | undefined>(() => {
    if (!kind) return undefined;
    if (kind === "fan") {
      if (!verifyHref) return undefined;
      const verify = verifyHref;
      if (passportId) return { state: "filled", label: fanUiText(locale, "starVerified"), href: `/passports/${passportId}?locale=${locale}` };
      return { state: "empty", label: fanUiText(locale, "starVerify"), href: signedOut ? fanLoginHref(locale, verify) : verify };
    }
    if (provisional) return { state: "empty", label: fanUiText(locale, "starJoin"), onClick: startJoin, pending: true };
    if (membership || joinedEarly) return { state: "filled", label: fanUiText(locale, "starJoined"), pending };
    if (signedOut) return { state: "empty", label: fanUiText(locale, "starJoin"), href: fanLoginHref(locale, `${pageId ? `/pages/groups/${pageId}` : `/${slug ?? page?.slug ?? ""}`}${queryString ? `?${queryString}` : ""}`) };
    return { state: "empty", label: fanUiText(locale, "starJoin"), onClick: startJoin, pending };
  }, [joinedEarly, kind, locale, membership, page?.slug, pageId, passportId, pending, provisional, queryString, signedOut, slug, startJoin, verifyHref]);

  const value = useMemo<GroupPageContextValue>(() => ({
    locale, routePageId: pageId ?? null, routeSlug: slug ?? null, page: pageMatches ? page : undefined, detail: pageMatches ? viewerDetail.data : undefined, membership, celebrity,
    celebrityFailed: linked.error, retryCelebrity: linked.retry, kind, authenticated, ready, ownerKey, loading: detail.loading || !ready, error: detail.error || Boolean(page && !pageMatches), failure: detail.failure,
    refresh, hrefFor, activeTab, selectTab, preloadTab, startJoin, joinPending: pending, joinLabel: fanUiText(locale, kind === "fan" ? "starVerify" : "starJoin"), joinFormOpen, closeJoinForm: () => setJoinFormOpen(false), joinAnswer: answer, setJoinAnswer: setAnswer, submitJoin: () => void join({ answer }), joinFailed, actionFailed,
    star, summary, presence, reserveMenu: Boolean(provisional && reserveMenu), publicPostsEmpty,
  }), [activeTab, answer, authenticated, celebrity, viewerDetail.data, detail.error, detail.failure, detail.loading, hrefFor, join, joinFailed, actionFailed, joinFormOpen, kind, linked.error, linked.retry, locale, membership, ownerKey, page, pageId, pageMatches, pending, preloadTab, presence, provisional, publicPostsEmpty, ready, refresh, reserveMenu, selectTab, slug, star, startJoin, summary]);
  const presenceValue = useMemo(() => (presencePageId ? { pageId: presencePageId, result: presence } : null), [presence, presencePageId]);
  return <GroupPageContext.Provider value={value}><GroupPresenceContext.Provider value={presenceValue}>{children}</GroupPresenceContext.Provider></GroupPageContext.Provider>;
}
