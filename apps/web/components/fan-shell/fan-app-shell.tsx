"use client";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
import type { AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/components__fan-shell__fan-app-shell";
import { messages as footerMessages } from "@/i18n/catalogs/components__fan-shell__fan-site-footer";
import { translate } from "@/i18n/messages";
import { creatorSlugFromHomePath } from "@/features/creator/domain/creator-navigation";
import { useGroupsRelease } from "@/features/groups/ui/groups-release";
import { GroupHeaderAccount } from "@/features/groups/ui/group-header-account";
import { useGroupRequest } from "@/features/groups/ui/use-group-resource";
import { fanLoginHref } from "@/components/login-href";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { HeaderNotificationLink } from "@/features/notification/ui/header-notification-link";
import { groupsCopy } from "@/features/groups/ui/copy";
import { groupBenefitsCopy } from "@/features/groups/ui/group-benefits-copy";
import { communityCopy } from "@/i18n/catalogs/features__community";
import { walletCopy } from "@/features/group-wallet/ui/copy";


import { useEffect, useState, type ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Bell, BookOpen, CircleUserRound, Heart, House, Home, UsersRound } from "@/components/fan-ui/fan-icons";
import { usePathname, useSearchParams } from "next/navigation";

import { FanHeader } from "./fan-header";
import { FanLanguageSwitch } from "./fan-language-switch";
import {
  FanBottomNavigation,
  FanPrimaryNavigation,
  type FanNavigationItem,
} from "./fan-navigation";
import { FanSiteFooter } from "./fan-site-footer";
import { FanWordmarkLink } from "./fan-wordmark-link";
import styles from "./fan-app-shell.module.css";

export type FanLocale = AppLocale;
export type FanSection = "home" | "community" | "favorites" | "my";

function useBrowserHash() {
  const [hash, setHash] = useState("");

  useEffect(() => {
    const updateHash = () => setHash(window.location.hash);
    updateHash();
    window.addEventListener("hashchange", updateHash);
    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  return hash;
}

export function localeSwitchHref(
  pathname: string,
  search: string,
  locale: FanLocale,
  hash = "",
): Route {
  const nextSearch = new URLSearchParams(search);
  nextSearch.set("locale", locale);
  const query = nextSearch.toString();
  const normalizedHash = hash && !hash.startsWith("#") ? `#${hash}` : hash;
  return `${pathname}${query ? `?${query}` : ""}${normalizedHash}` as Route;
}

export function activeFanSection(pathname: string): FanSection {
  if (pathname === "/pages/groups" || pathname.startsWith("/pages/groups/")) return "favorites";
  if (pathname === "/community" || pathname.startsWith("/community/")) return "community";
  if (pathname === "/live" || pathname.startsWith("/live/") || pathname === "/celebrities" || pathname === "/bias" || pathname.startsWith("/bias/") || pathname.startsWith("/c/") || creatorSlugFromHomePath(pathname) !== null || pathname.startsWith(`/${WAVE_FANPAGE_SLUG}/programs/`)) return "favorites";
  if (
    pathname === "/my" || pathname.startsWith("/my/") ||
    pathname.startsWith("/passports") ||
    pathname.startsWith("/stamps") ||
    pathname.startsWith("/benefits") ||
    pathname.startsWith("/notifications") ||
    pathname.startsWith("/settings")
  ) return "my";
  return "home";
}

export function fanNavigationItems(
  locale: FanLocale,
  pathname: string,
  groupsEnabled = false,
): readonly FanNavigationItem[] {
  const current = activeFanSection(pathname);
  const query = `?locale=${locale}`;
  const globalBenefits = pathname === '/benefits' || pathname.startsWith('/benefits/') || pathname === '/my/capsules' || pathname.startsWith('/my/capsules/');
  // 전체 랭킹은 덕질 탭과 안내에서 들어온다.
  const rankings = pathname === '/rankings' || pathname.startsWith('/rankings/');
  // 5차 셸: 위 탭은 글자만(아이콘 0), 390 하단 탭바만 lucide 24를 붙인다(FanAppBottomNavigation).
  if(groupsEnabled)return [
    {id:"home",href:`/${query}` as Route,label:"HOME",isCurrent:current==="home"&&!rankings},
    {id:"community",href:`/pages/groups${query}` as Route,label:groupsCopy(locale).groups,isCurrent:pathname.startsWith('/pages/groups')||current==='community'||(current==='favorites'&&!rankings)},
    {id:"favorites",href:`/benefits${query}` as Route,label:groupBenefitsCopy(locale).title,isCurrent:globalBenefits||rankings},
    {id:"my",href:`/my${query}` as Route,label:"MY",isCurrent:current==='my'&&!globalBenefits},
  ];
  return [
    { id: "home", href: `/${query}` as Route, label: "HOME", isCurrent: current === "home" },
    { id: "community", href: `/community${query}` as Route, label: communityCopy(locale).title, isCurrent: current === "community" },
    {
      id: "favorites",
      href: `${groupsEnabled ? "/pages/groups" : "/celebrities"}${query}` as Route,
      label: groupsEnabled ? groupsCopy(locale).groups : locale === "ko" ? "최애" : translate(locale, localizedMessages.m0f4f77a0db44, "FAVORITES"),
      isCurrent: current === "favorites",
    },
    { id: "my", href: `/my${query}` as Route, label: "MY", isCurrent: current === "my" },
  ];
}

const groupTabIcons: Record<string, ReactNode> = {
  home: <FanIcon icon={House} size={24} />,
  community: <FanIcon icon={UsersRound} size={24} />,
  favorites: <FanIcon icon={Heart} size={24} />,
  my: <FanIcon icon={CircleUserRound} size={24} />,
};

const icons: Record<FanSection, ReactNode> = {
  home: <Home aria-hidden="true" />,
  community: <UsersRound aria-hidden="true" />,
  favorites: <Heart aria-hidden="true" />,
  my: <BookOpen aria-hidden="true" />,
};

function mobileLabel(section: FanSection, locale: FanLocale, groupsEnabled = false) {
  if (section === "home") return locale === "ko" ? "홈" : translate(locale, localizedMessages.m8082d5c40271, "Home");
  if (section === "community") return communityCopy(locale).title;
  if (section === "favorites") return groupsEnabled ? groupsCopy(locale).groups : locale === "ko" ? "최애" : translate(locale, localizedMessages.m7a1e6f7131e7, "Favorites");
  return "MY";
}

/** 5차 헤더 위치명(R3): 지금 있는 1단계 자리. 팬페이지·모임 안에서는 화면이 준 이름(`locationName`)이 앞선다. */
export function shellLocationName(locale: FanLocale, pathname: string, groupsEnabled = true): string {
  if (pathname === "/notifications" || pathname.startsWith("/notifications/")) return locale === "ko" ? "알림" : translate(locale, footerMessages.m2c4e2b786e56, "Notifications");
  const item = fanNavigationItems(locale, pathname, groupsEnabled).find((candidate) => candidate.isCurrent);
  if (!item || item.id === "home") return locale === "ko" ? "홈" : translate(locale, localizedMessages.m8082d5c40271, "Home");
  return typeof item.label === "string" ? item.label : "";
}

/** 5차 헤더 오른쪽(R3·8장 ⑩): 알림 종(새 알림은 점) + 아바타 메뉴. 비로그인은 종(→ 로그인)과 `로그인` 글자 하나.
 * 등급·최애·하트·포인트는 헤더에 두지 않는다 — 아바타 메뉴 첫 행과 덕질 지갑에 있다. 로그인 여부를 모르는 동안은 아바타 자리를 비워 둔다. */
export function GroupHeaderActions({ locale, languageHref, notificationsLabel, actions, actionsAreIdentity }: {
  locale: FanLocale; languageHref: string; notificationsLabel: string; actions?: ReactNode; actionsAreIdentity?: boolean;
}) {
  const owner = useGroupRequest().ownerKey, guest = owner.startsWith("guest:"), pending = owner.startsWith("pending:");
  const pathname = usePathname() || "/", query = useSearchParams()?.toString();
  const login = fanLoginHref(locale, `${pathname}${query ? `?${query}` : ""}`);
  const loginLabel = walletCopy(locale).login;
  return <>
    {guest
      ? <Link className={styles.shellIcon} href={login as Route} aria-label={notificationsLabel} title={notificationsLabel}><FanIcon icon={Bell} size={24} /></Link>
      : <HeaderNotificationLink locale={locale} label={notificationsLabel} className={styles.shellIcon} />}
    {pending ? <span className={styles.shellAvatarPending} aria-hidden="true" />
      : guest ? <Link className={styles.shellLogin} href={login as Route}>{loginLabel}</Link>
      : <GroupHeaderAccount locale={locale} actions={actions} actionsAreIdentity={actionsAreIdentity} languageHref={languageHref} />}
  </>;
}

export function FanAppHeader({
  locale,
  actions,
  actionsAreIdentity,
  currentPath,
  groupsEnabled: explicitGroupsEnabled,
  locationName,
}: {
  locale: FanLocale;
  actions?: ReactNode;
  actionsAreIdentity?: boolean;
  currentPath?: string;
  groupsEnabled?: boolean;
  /** 팬페이지·모임 이름처럼 화면이 아는 위치명. 없으면 탭 이름(홈·모임·덕질·MY·알림). */
  locationName?: string;
}) {
  const released = useGroupsRelease();
  const groupsEnabled = explicitGroupsEnabled ?? released;
  const browserPathname = usePathname() || currentPath || "/";
  const searchParams = useSearchParams();
  const browserHash = useBrowserHash();
  const pathname = currentPath ?? browserPathname;
  const items = fanNavigationItems(locale, pathname, groupsEnabled);
  const notificationsLabel = locale === "ko" ? "알림" : translate(locale, footerMessages.m2c4e2b786e56, "Notifications");
  const nextLocale = locale === "ko" ? "en" : "ko";
  const languageHref = localeSwitchHref(
    browserPathname,
    searchParams?.toString() ?? "",
    nextLocale,
    browserHash,
  );

  if (groupsEnabled) {
    const place = locationName ?? shellLocationName(locale, pathname, true);
    return (
      <header className={styles.shellHeader} data-fan-header="">
        <div className={styles.shellInner}>
          <div className={styles.shellPlace}>
            <FanWordmarkLink ariaLabel={locale === "ko" ? "kyaa 홈" : translate(locale, localizedMessages.m84a200a175f6, "kyaa home")} className={styles.shellBrand} href={`/?locale=${locale}` as Route} />
            {place ? <span className={styles.shellLocation} data-shell-location="" data-named={locationName ? "" : undefined}>{place}</span> : null}
          </div>
          <FanPrimaryNavigation
            activeItemClassName={styles.shellTabActive}
            ariaLabel={locale === "ko" ? "주요 메뉴" : translate(locale, localizedMessages.m5cfebe367665, "Primary navigation")}
            className={styles.shellTabs}
            itemClassName={styles.shellTab}
            items={items}
            dataAttribute="data-shell-tabs"
          />
          <div className={styles.shellActions} data-actions="">
            <GroupHeaderActions locale={locale} languageHref={languageHref} notificationsLabel={notificationsLabel} actions={actions} actionsAreIdentity={actionsAreIdentity} />
          </div>
        </div>
      </header>
    );
  }

  return (
    <FanHeader
      className={styles.header}
      innerClassName={styles.headerInner}
      brandClassName={styles.brand}
      brandHref={`/?locale=${locale}` as Route}
      brandAriaLabel={locale === "ko" ? "kyaa 홈" : translate(locale, localizedMessages.m84a200a175f6, "kyaa home")}
    >
      <FanPrimaryNavigation
        activeItemClassName={styles.activeNav}
        ariaLabel={locale === "ko" ? "주요 메뉴" : translate(locale, localizedMessages.m5cfebe367665, "Primary navigation")}
        className={styles.desktopNav}
        itemClassName={styles.desktopNavItem}
        items={items}
      />
      <div className={styles.actions}>
        {actions}{pathname!=="/notifications"&&<Link className={styles.utilityLink} href={`/notifications?locale=${locale}` as Route} aria-label={notificationsLabel} title={notificationsLabel}><Bell aria-hidden="true"/></Link>}<FanLanguageSwitch locale={locale} href={languageHref}/>
      </div>
    </FanHeader>
  );
}

export { FanContentContainer } from "./fan-content-container";

export function FanAppBottomNavigation({ locale, currentPath, groupsEnabled: explicitGroupsEnabled }: { locale: FanLocale; currentPath?: string; groupsEnabled?: boolean }) {
  const released = useGroupsRelease();
  const groupsEnabled = explicitGroupsEnabled ?? released;
  const browserPathname = usePathname() || "/";
  const pathname = currentPath ?? browserPathname;
  const items = fanNavigationItems(locale, pathname, groupsEnabled).map((item) => ({
    ...item,
    icon: groupsEnabled ? groupTabIcons[item.id] : item.icon ?? icons[item.id as FanSection],
    label: <span>{groupsEnabled ? item.label : mobileLabel(item.id as FanSection, locale, groupsEnabled)}</span>,
  }));
  if (groupsEnabled) return (
    <FanBottomNavigation
      activeItemClassName={styles.tabbarActive}
      ariaLabel={locale === "ko" ? "모바일 주요 메뉴" : translate(locale, localizedMessages.ma253a156003b, "Mobile primary navigation")}
      className={styles.tabbar}
      itemClassName={styles.tabbarItem}
      items={items}
      dataAttribute="data-bottom-nav"
    />
  );
  return (
    <FanBottomNavigation
      activeItemClassName={styles.activeBottomItem}
      ariaLabel={locale === "ko" ? "모바일 주요 메뉴" : translate(locale, localizedMessages.ma253a156003b, "Mobile primary navigation")}
      className={[styles.bottomNavigation, groupsEnabled ? styles.groupsNavigation : ""].filter(Boolean).join(" ")}
      itemClassName={styles.bottomNavigationItem}
      items={items}
    />
  );
}

export function FanSkipLink({ locale, mainId }: { locale: FanLocale; mainId: string }) {
  return (
    <a className={styles.skipLink} href={`#${mainId}`}>
      {locale === "ko" ? "본문으로 바로가기" : translate(locale, localizedMessages.ma938d26ac3b9, "Skip to content")}
    </a>
  );
}

export function FanAppFrame({
  locale,
  children,
  actions,
  actionsAreIdentity,
  className,
  mainId,
  currentPath,
  groupsEnabled,
  locationName,
}: {
  locale: FanLocale;
  children: ReactNode;
  actions?: ReactNode;
  actionsAreIdentity?: boolean;
  className?: string;
  mainId?: string;
  currentPath?: string;
  groupsEnabled?: boolean;
  locationName?: string;
}) {
  const released = useGroupsRelease();
  const resolvedGroupsEnabled = groupsEnabled ?? released;
  return (
    <div
      className={[styles.frame, resolvedGroupsEnabled ? styles.groupsNavigation : "", className].filter(Boolean).join(" ")}
      data-fan-surface
      lang={locale}
    >
      {mainId ? (
        <a className={styles.skipLink} href={`#${mainId}`}>
          {locale === "ko" ? "본문으로 바로가기" : translate(locale, localizedMessages.ma938d26ac3b9, "Skip to content")}
        </a>
      ) : null}
      <FanAppHeader locale={locale} actions={actions} actionsAreIdentity={actionsAreIdentity} currentPath={currentPath} groupsEnabled={resolvedGroupsEnabled} locationName={locationName} />
      {children}
      <FanSiteFooter locale={locale} />
      <FanAppBottomNavigation locale={locale} currentPath={currentPath} groupsEnabled={resolvedGroupsEnabled} />
    </div>
  );
}
