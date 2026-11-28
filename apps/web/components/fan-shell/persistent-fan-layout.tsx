"use client";

import { useRef, useState, type ReactNode } from "react";
import { usePathname, useSelectedLayoutSegments } from "next/navigation";
import { creatorSlugFromHomePath } from "@/features/creator/domain/creator-navigation";
import { useGroupsRelease } from "@/features/groups/ui/groups-release";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
import { useChemiRelease } from "@/features/chemi/ui/chemi-release";
import { usePageLocale } from "@/components/locale-provider";
import { FanAppBottomNavigation, FanAppHeader, FanSkipLink } from "./fan-app-shell";
import { FanHeaderActionContext, FanLayoutContext } from "./fan-layout-context";
import styles from "./fan-app-shell.module.css";

const sharedRoutes = [
  /^\/$/,
  /^\/(?:gallery|shorts|follow|onboarding|celebrities|events|benefits|notifications)$/,
  /^\/events\/(?:donation-vote|heart-donation)$/,
  /^\/guide(?:\/(?:chemi|jjinfan))?$/,
  /^\/passports(?:\/[^/]+)?$/,
  /^\/stamps\/[^/]+$/,
  /^\/benefits\/[^/]+$/,
  /^\/live(?:\/[^/]+(?:\/(?:survey|suggestions|missions))?)?$/,
  /^\/live\/calendar\/schedules\/[^/]+$/,
  new RegExp(`^/${WAVE_FANPAGE_SLUG}/programs/[^/]+$`),
  /^\/settings(?:\/kakao\/callback)?$/,
  /^\/pages\/live-dashboard$/,
  /^\/notices(?:\/[^/]+)?$/,
  /^\/s\/(?:x|raffle)$/,
  /^\/my(?:\/(?:birth|activity|raffles|requests|inquiries(?:\/[^/]+)?|rewards\/[^/]+\/recipient|gifts(?:\/[^/]+)?))?$/,
  /^\/c\/[^/]+\/(?:community\/[^/]+|notices\/[^/]+|updates\/chzzk\/[^/]+|proofs|certifications(?:\/[^/]+)?|lounge|tickets|schedule-suggestions|raffles(?:\/[^/]+)?|verify(?:\/(?:result|questions))?)$/,
];
const groupRoutes = [
  /^\/pages\/groups(?:\/(?:apply|[0-9a-f-]{36}(?:\/(?:manage|earnings(?:\/[^/]+)?|missions(?:\/[^/]+)?|raffles\/[^/]+|events\/[^/]+(?:\/support)?))?))?$/i,
  /^\/groups\/invitations\/[^/]+$/,
  /^\/my\/(?:wallet|friends|presence|invitations|capsules|groups\/reports)$/,
];
const chemiRoutes = /^\/chemi(?:\/(?:fortune(?:\/(?:deep|card))?|saju|star(?:\/match)?|tarot(?:\/spread)?|points\/topup|games\/match))?$/;
// These static routes also match the creator handle grammar.
const reservedStaticRoutes = new Set(["/about", "/account-deletion", "/chemi", "/email", "/i", "/pricing", "/refund", "/shorts"]);

function isCreatorHome(pathname: string) {
  return !reservedStaticRoutes.has(pathname) && creatorSlugFromHomePath(pathname) !== null;
}

export function usesPersistentFanLayout(pathname: string, groups: boolean, chemi: boolean) {
  return sharedRoutes.some((route) => route.test(pathname))
    || (groups && groupRoutes.some((route) => route.test(pathname)))
    || (chemi && chemiRoutes.test(pathname))
    || isCreatorHome(pathname);
}

export function PersistentFanLayout({ children }: { children: ReactNode }) {
  const urlPath = usePathname()?.replace(/\/$/, "") || "/";
  const segments = useSelectedLayoutSegments();
  const pathname = urlPath === "/login" && segments[0] !== "login" ? `/${segments.filter((segment) => !segment.startsWith("(")).join("/")}` : urlPath;
  const locale = usePageLocale();
  const groups = useGroupsRelease();
  const chemi = useChemiRelease();
  const active = usesPersistentFanLayout(pathname, groups, chemi);
  const content = useRef<HTMLDivElement>(null);
  const [actionContainer, setActionContainer] = useState<HTMLSpanElement | null>(null);
  if (!active) return children;

  const navigationPath = groups && (isCreatorHome(pathname) || /^\/c\/[^/]+\/community\//.test(pathname))
    ? "/pages/groups"
    : pathname;

  return (
    <div className={styles.persistentLayout} data-fan-surface lang={locale}>
      <FanSkipLink locale={locale} mainId="fan-route-content" onClick={(event) => {
        const main = content.current?.querySelector<HTMLElement>("main");
        if (!main) return;
        event.preventDefault();
        if (!main.hasAttribute("tabindex")) main.tabIndex = -1;
        main.focus();
      }} />
      <FanAppHeader
        locale={locale}
        currentPath={navigationPath}
        actions={pathname === "/notifications" ? <span ref={setActionContainer} className={styles.headerActionSlot} /> : undefined}
      />
      <div ref={content} id="fan-route-content" tabIndex={-1}>
        <FanLayoutContext.Provider value={true}>
          <FanHeaderActionContext.Provider value={actionContainer}>{children}</FanHeaderActionContext.Provider>
        </FanLayoutContext.Provider>
      </div>
      <FanAppBottomNavigation locale={locale} currentPath={navigationPath} />
    </div>
  );
}
