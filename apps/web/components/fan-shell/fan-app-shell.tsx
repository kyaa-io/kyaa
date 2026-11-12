"use client";
import { HeaderDmLink } from "@/features/group-social/header-dm-link";
import { GiftTabDot } from "@/features/gifts/ui/gift-tab-dot";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
import type { AppLocale } from "@/i18n/locales";
import { messages as localizedMessages } from "@/i18n/catalogs/components__fan-shell__fan-app-shell";
import { messages as footerMessages } from "@/i18n/catalogs/components__fan-shell__fan-site-footer";
import { translate } from "@/i18n/messages";
import { creatorSlugFromHomePath } from "@/features/creator/domain/creator-navigation";
import { useGroupsRelease } from "@/features/groups/ui/groups-release";
import { GroupHeaderAccount } from "@/features/groups/ui/group-header-account";
import { FanHeaderStatus } from "./fan-header-status";
import { SelectedBiasChip } from "@/features/selected-bias/ui/selected-bias-chip";
import { useGroupRequest } from "@/features/groups/ui/use-group-resource";
import { HeaderNotificationLink } from "@/features/notification/ui/header-notification-link";
import { groupsCopy } from "@/features/groups/ui/copy";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import { fanLoginHref } from "@/components/login-href";
import { groupBenefitsCopy } from "@/features/groups/ui/group-benefits-copy";
import { communityCopy } from "@/i18n/catalogs/features__community";


import { useEffect, useState, type ReactNode } from "react";
import type { Route } from "next";
import Link from "../fan-ui/hover-prefetch-link";
import { Bell, BookOpen, Heart, Home, UsersRound } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import { PencilHeaderIcon } from "./pencil-header-icon";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeader } from "./fan-header";
import { FanLanguageSwitch } from "./fan-language-switch";
import {
  FanBottomNavigation,
  FanPrimaryNavigation,
  type FanNavigationItem,
} from "./fan-navigation";
import { FanSiteFooter } from "./fan-site-footer";
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
  if(groupsEnabled)return [
    {id:"home",href:`/${query}` as Route,label:"HOME",icon:<PencilHeaderIcon name="home"/>,isCurrent:current==="home"&&!rankings},
    {id:"community",href:`/pages/groups${query}` as Route,label:groupsCopy(locale).groups,icon:<PencilHeaderIcon name="groups"/>,isCurrent:pathname.startsWith('/pages/groups')||current==='community'},
    {id:"favorites",href:`/benefits${query}` as Route,label:groupBenefitsCopy(locale).title,icon:<PencilHeaderIcon name="favorites"/>,isCurrent:globalBenefits||rankings},
    {id:"my",href:`/my${query}` as Route,label:"MY",icon:<PencilHeaderIcon name="my"/>,isCurrent:current==='my'&&!globalBenefits},
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

/** The MY tab carries the new-gift dot, in the header and in the bottom bar. Only where the header already reads the shared summary (the groups shell), so the dot adds no request. */
function withGiftDot(items: readonly FanNavigationItem[], locale: FanLocale, groupsEnabled: boolean): readonly FanNavigationItem[] {
  return groupsEnabled ? items.map((item) => item.id === "my" ? { ...item, badge: <GiftTabDot locale={locale} /> } : item) : items;
}

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

/** Feedback F: signed in, the right side is three things — one collapsible status capsule (tier · ♥N · P N),
 * the bell, and the avatar that opens the account menu. The language moves into that menu from 768px; below 768px (no account menu) and
 * signed out it stays in the header. */
export function GroupHeaderActions({ locale, languageHref, notificationsLabel, actions, actionsAreIdentity }: {
  locale: FanLocale; languageHref: string; notificationsLabel: string; actions?: ReactNode; actionsAreIdentity?: boolean;
}) {
  const owner = useGroupRequest().ownerKey, guest = owner.startsWith("guest:");
  const pathname = usePathname() || "/", query = useSearchParams()?.toString();
  // Until sign-in is known (server HTML and the first client frames) the slot is held empty, not drawn as a blank capsule that then
  // turns into the guest chip or fills with values.
  const status = owner.startsWith("pending:") ? <span className={styles.statusPending} data-header-status-pending="" aria-hidden="true" />
    : guest ? <SelectedBiasChip locale={locale} />
    : <FanHeaderStatus locale={locale} />;
  return <>
    {status}
    <span className={styles.headerLanguage} data-signed-in={guest ? undefined : ""}><FanLanguageSwitch locale={locale} href={languageHref} compact /></span>
    <HeaderNotificationLink locale={locale} label={notificationsLabel} className={styles.utilityLink} />
    <HeaderDmLink locale={locale} className={styles.utilityLink} />
    {/* Below 768px the account menu is not drawn, so a signed-out viewer gets the way in here; from 768px the menu's last row is it. */}
    {guest && <FanAction variant="text" size="sm" className={styles.guestLogin} href={fanLoginHref(locale, `${pathname}${query ? `?${query}` : ""}`)}>{walletCopy(locale).login}</FanAction>}
    <div className={styles.groupDesktopAccount}><GroupHeaderAccount locale={locale} actions={actions} actionsAreIdentity={actionsAreIdentity} languageHref={languageHref} /></div>
  </>;
}

export function FanAppHeader({
  locale,
  actions,
  actionsAreIdentity,
  currentPath,
  groupsEnabled: explicitGroupsEnabled,
}: {
  locale: FanLocale;
  actions?: ReactNode;
  actionsAreIdentity?: boolean;
  currentPath?: string;
  groupsEnabled?: boolean;
}) {
  const released = useGroupsRelease();
  const groupsEnabled = explicitGroupsEnabled ?? released;
  const browserPathname = usePathname() || currentPath || "/";
  const searchParams = useSearchParams();
  const browserHash = useBrowserHash();
  const pathname = currentPath ?? browserPathname;
  const items = withGiftDot(fanNavigationItems(locale, pathname, groupsEnabled), locale, groupsEnabled);
  const notificationsLabel = locale === "ko" ? "알림" : translate(locale, footerMessages.m2c4e2b786e56, "Notifications");
  const nextLocale = locale === "ko" ? "en" : "ko";
  const languageHref = localeSwitchHref(
    browserPathname,
    searchParams?.toString() ?? "",
    nextLocale,
    browserHash,
  );

  return (
    <FanHeader
      className={[styles.header, groupsEnabled ? styles.groupsNavigation : ""].filter(Boolean).join(" ")}
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
        {groupsEnabled?<GroupHeaderActions locale={locale} languageHref={languageHref} notificationsLabel={notificationsLabel} actions={actions} actionsAreIdentity={actionsAreIdentity}/>:<>{actions}{pathname!=="/notifications"&&<Link className={styles.utilityLink} href={`/notifications?locale=${locale}` as Route} aria-label={notificationsLabel} title={notificationsLabel}><Bell aria-hidden="true"/></Link>}<FanLanguageSwitch locale={locale} href={languageHref}/></>}
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
  const items = withGiftDot(fanNavigationItems(locale, pathname, groupsEnabled), locale, groupsEnabled).map((item) => ({
    ...item,
    icon: item.icon ?? icons[item.id as FanSection],
    label: <span>{groupsEnabled ? item.label : mobileLabel(item.id as FanSection, locale, groupsEnabled)}</span>,
  }));
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
}: {
  locale: FanLocale;
  children: ReactNode;
  actions?: ReactNode;
  actionsAreIdentity?: boolean;
  className?: string;
  mainId?: string;
  currentPath?: string;
  groupsEnabled?: boolean;
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
      <FanAppHeader locale={locale} actions={actions} actionsAreIdentity={actionsAreIdentity} currentPath={currentPath} groupsEnabled={resolvedGroupsEnabled} />
      {children}
      <FanSiteFooter locale={locale} />
      <FanAppBottomNavigation locale={locale} currentPath={currentPath} groupsEnabled={resolvedGroupsEnabled} />
    </div>
  );
}
