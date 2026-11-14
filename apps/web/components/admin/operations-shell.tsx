"use client";

import {
  Activity, BadgeCheck, BarChart3, Bell, Blocks, ChevronRight,
  CalendarDays, Clapperboard, ExternalLink, Gift, Globe, Images, LayoutDashboard, Megaphone, Menu,
  MessageSquareText, ScrollText, ShieldCheck, Sparkles, UserCog, UsersRound, X, type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "../fan-ui/hover-prefetch-link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useGroupsRelease } from "@/features/groups/ui/groups-release";
import styles from "./operations.module.css";
import { ContentReportAlert } from "./content-report-alert";

export type AdminLocale = "ko" | "en";
type NavItem = { href: Route; icon: LucideIcon; label: string; exact?: boolean };
type RawItem = readonly [Route, string, LucideIcon, boolean?];

const copy = {
  ko: {
    menu: "관리자 메뉴", admin: "관리자", breadcrumb: "현재 위치",
    language: "English", environment: "운영", openService: "서비스 열기",
    groups: [
      { label: "서비스 현황", items: [["/admin", "서비스 현황", LayoutDashboard, true], ["/admin/traffic", "방문 통계", Globe], ["/admin/campaigns", "캠페인", ExternalLink], ["/admin/dashboard", "상세 통계", BarChart3]] },
      { label: "회원", items: [["/admin/inquiries", "CS 문의", MessageSquareText], ["/admin/fans", "회원 관리", UsersRound], ["/admin/certifications", "인증 심사", BadgeCheck], ["/admin/proof-review", "패스포트 인증 심사", BadgeCheck], ["/admin/fanpage-requests", "팬페이지 신청", UsersRound], ["/admin/content-reports", "신고 관리", ShieldCheck]] },
      { label: "콘텐츠", items: [["/admin/celebrities", "크리에이터 관리", Sparkles], ["/admin/lives", "LIVE 관리", Clapperboard], ["/admin/schedules", "일정 관리", CalendarDays], ["/admin/schedule-suggestions", "일정 제보", CalendarDays], ["/admin/home-banners", "홈 배너", Images], ["/admin/home-notices", "홈 공지", Megaphone], ["/admin/benefits", "혜택·경품", Gift], ["/admin/notice-comments", "공지 댓글", MessageSquareText], ["/admin/lounge-messages", "팬 라운지", MessageSquareText]] },
      { label: "운영 관리", items: [["/admin/byus-day-rsvps", "kyaa wave 참가 신청", CalendarDays], ["/admin/event-participants", "이벤트 참여자", UsersRound], ["/admin/kyaa-wave-draw", "kyaa wave 추첨", Gift], ["/admin/jjinfan-challenge", "찐팬 100명 게이지", Gift], ["/admin/wave-stage", "팬 이벤트 LIVE·추첨", Clapperboard], ["/admin/runmusic", "RUN&MUSIC 이벤트", Gift], ["/admin/system", "시스템 상태", Activity], ["/admin/blockchain-jobs", "디지털 발급 내역", Blocks], ["/admin/notifications", "알림 전송", Bell], ["/admin/audit", "관리자 활동 기록", ScrollText]] },
    ],
  },
  en: {
    menu: "Admin menu", admin: "Admin", breadcrumb: "Breadcrumb",
    language: "한국어", environment: "Operations", openService: "Open service",
    groups: [
      { label: "Service status", items: [["/admin", "Service status", LayoutDashboard, true], ["/admin/traffic", "Web traffic", Globe], ["/admin/campaigns", "Campaigns", ExternalLink], ["/admin/dashboard", "Detailed analytics", BarChart3]] },
      { label: "Members", items: [["/admin/inquiries", "Customer support", MessageSquareText], ["/admin/fans", "Member management", UsersRound], ["/admin/certifications", "Certification review", BadgeCheck], ["/admin/proof-review", "Passport proof review", BadgeCheck], ["/admin/fanpage-requests", "Fan page requests", UsersRound], ["/admin/content-reports", "Content reports", ShieldCheck]] },
      { label: "Content", items: [["/admin/celebrities", "Creator management", Sparkles], ["/admin/lives", "LIVE management", Clapperboard], ["/admin/schedules", "Schedules", CalendarDays], ["/admin/schedule-suggestions", "Schedule suggestions", CalendarDays], ["/admin/home-banners", "Home banners", Images], ["/admin/home-notices", "Home notices", Megaphone], ["/admin/benefits", "Benefits & prizes", Gift], ["/admin/notice-comments", "Notice comments", MessageSquareText], ["/admin/lounge-messages", "Fan lounge", MessageSquareText]] },
      { label: "Operations", items: [["/admin/byus-day-rsvps", "kyaa wave registrations", CalendarDays], ["/admin/event-participants", "Event participants", UsersRound], ["/admin/kyaa-wave-draw", "kyaa wave draw", Gift], ["/admin/jjinfan-challenge", "100 true fans gauge", Gift], ["/admin/wave-stage", "Fan event LIVE & draw", Clapperboard], ["/admin/runmusic", "RUN&MUSIC event", Gift], ["/admin/system", "System status", Activity], ["/admin/blockchain-jobs", "Issuance history", Blocks], ["/admin/notifications", "Notification delivery", Bell], ["/admin/audit", "Admin activity log", ScrollText]] },
    ],
  },
} as const;

export function AdminOperationsShell({ locale, children, adminRole }: { locale: AdminLocale; children: ReactNode; adminRole?: string }) {
  const groupsEnabled = useGroupsRelease();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavRef = useRef<HTMLDivElement>(null);
  const t = copy[locale];
  const groups: { label: string; items: NavItem[] }[] = t.groups.map((group) => ({
    label: group.label,
    items: (group.items as readonly RawItem[])
      .map(([href, label, icon, exact = false]) => ({ href, label, icon, exact }))
      .concat(group.label === (locale === "ko" ? "운영 관리" : "Operations") && adminRole === "admin"
        ? [{ href: "/admin/administrators" as Route, label: locale === "ko" ? "관리자 관리" : "Admin management", icon: ShieldCheck, exact: false }, { href: "/admin/operators" as Route, label: locale === "ko" ? "채널 운영자" : "Channel operators", icon: UserCog, exact: false }]
        : []),
  }));

  if (groupsEnabled) groups.splice(2, 0, { label: locale === "ko" ? "모임 운영" : "Groups", items: [
    { href: "/admin/groups/overview", icon: LayoutDashboard, label: locale === "ko" ? "모임 관리 홈" : "Group administration", exact: true },
    { href: "/admin/groups", icon: UsersRound, label: locale === "ko" ? "페이지 개설 신청" : "Page applications", exact: true },
    { href: "/admin/groups/artists", icon: BadgeCheck, label: locale === "ko" ? "아티스트 계정" : "Artist accounts" },
    { href: "/admin/groups/reports", icon: ShieldCheck, label: locale === "ko" ? "모임 신고 검토" : "Group reports" },
    { href: "/admin/groups/event-approvals", icon: CalendarDays, label: locale === "ko" ? "행사 승인" : "Event approvals" },
    { href: "/admin/groups/official-events", icon: CalendarDays, label: locale === "ko" ? "공식 행사 신청" : "Official events" },
    { href: "/admin/groups/event-support", icon: CalendarDays, label: locale === "ko" ? "행사 지원자료" : "Event support" },
    { href: "/admin/groups/missions", icon: BadgeCheck, label: locale === "ko" ? "미션 보상" : "Mission rewards" },
    { href: "/admin/group-capsules", icon: Gift, label: locale === "ko" ? "캡슐 뽑기" : "Capsule draws" },
  ] });

  useEffect(() => {
    if (!menuOpen) return;
    const currentLink = mobileNavRef.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const firstLink = mobileNavRef.current?.querySelector<HTMLElement>("a");
    (currentLink ?? firstLink)?.focus();
  }, [menuOpen]);

  function switchLocale() {
    const next = new URLSearchParams(searchParams.toString());
    next.set("lang", locale === "ko" ? "en" : "ko");
    router.replace(`${pathname}?${next.toString()}` as Route, { scroll: false });
  }
  function isActive(item: NavItem) {
    return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  }
  function localizedHref(href: Route) {
    return (locale === "en" ? href.concat("?lang=en") : href) as Route;
  }
  function handleMobileNavKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }

  const currentItem = groups.flatMap((group) => group.items).find(isActive);
  const nav = (
    <nav className={styles.adminNav} aria-label={t.menu}>
      {groups.map((group) => (
        <div className={styles.navGroup} key={group.label}>
          <p>{group.label}</p>
          {group.items.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            return (
              <Link key={item.href} className={active ? styles.activeNav : undefined}
                aria-current={active ? "page" : undefined} href={localizedHref(item.href)}>
                <Icon aria-hidden="true" /><span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className={styles.adminPage}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href={localizedHref("/admin")}>kyaa <span>Admin</span></Link>
        <div className={styles.topActions}>
          {adminRole && <ContentReportAlert locale={locale} />}
          <span className={styles.environment}>{t.environment}</span>
          <Link className={styles.serviceLink} href="/" target="_blank">{t.openService}<ExternalLink aria-hidden="true" /></Link>
          <button className={styles.languageButton} type="button" onClick={switchLocale}>{t.language}</button>
          <button ref={menuButtonRef} className={styles.menuButton} type="button" aria-label={t.menu}
            aria-expanded={menuOpen} aria-controls="admin-mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </header>
      {menuOpen && (
        <div ref={mobileNavRef} id="admin-mobile-navigation" className={styles.mobileNav}
          onKeyDown={handleMobileNavKeyDown} onClick={() => setMenuOpen(false)}>
          {nav}
        </div>
      )}
      <div className={styles.layout}>
        <aside className={styles.sidebar}>{nav}</aside>
        <main className={styles.workspace} id="main-content">
          {currentItem && (
            <nav className={styles.breadcrumb} aria-label={t.breadcrumb}>
              <Link href={localizedHref("/admin")}>{t.admin}</Link>
              <ChevronRight aria-hidden="true" />
              <span aria-current="page">{currentItem.label}</span>
            </nav>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
