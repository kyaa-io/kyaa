"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { FanSheet, useFanWide } from "@/components/fan-ui/fan-dialog";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { mySummaryPath, mySummarySchema } from "@/features/my/domain/my-summary";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { NotificationInbox } from "./notification-inbox";
import { inboxCopy } from "./notification-inbox-copy";
import { useNotificationInbox } from "./use-notification-inbox";
import styles from "./notification-panel.module.css";

const parseSummary = (body: unknown) => mySummarySchema.parse((body as { summary?: unknown } | null)?.summary);

/** 최애 칩 이름: 헤더가 이미 읽는 MY 요약(같은 주소라 요청이 늘지 않는다). 없으면 `최애`. */
export function useFavoriteName(locale: AppLocale) {
  const auth = useByUsAuth();
  const summary = useOwnedFanResource(auth.authenticated ? mySummaryPath(toContentLocale(locale)) : null, parseSummary, auth);
  return summary.state.status === "ready" ? summary.state.data.favorite?.name?.trim() || null : null;
}

export type NotificationPanelProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: AppLocale;
  /** 헤더 종. 1024 이상 팝오버를 그 아래 오른쪽 끝에 맞추고, 닫히면 포커스를 돌려준다. */
  anchorRef: RefObject<HTMLElement | null>;
}>;

/** 알림함 패널(plan-ux r6 6.5): 1024 이상은 종 아래 팝오버(폭 400·최대 70vh), 그보다 좁으면 전체 시트(`FanSheet` full).
 * 헤더 종 연결은 셸 담당이 한다: 종 버튼 `onClick={() => setOpen(true)}` + `<NotificationPanel open anchorRef={bellRef} …/>`. */
export function NotificationPanel({ open, onOpenChange, locale, anchorRef }: NotificationPanelProps) {
  const wide = useFanWide();
  const inbox = useNotificationInbox(locale, open);
  const favoriteName = useFavoriteName(locale);
  const pathname = usePathname();
  const search = useSearchParams();
  const returnTo = `${pathname}${search.size ? `?${search.toString()}` : ""}`;
  const c = inboxCopy(locale);
  const close = () => onOpenChange(false);
  if (!wide) return <FanSheet open={open} onOpenChange={onOpenChange} title={c.title} closeLabel={c.close} side="bottom" snap="full" handle={false} className={styles.sheet}>
    <NotificationInbox locale={locale} inbox={inbox} favoriteName={favoriteName} showTitle={false} onNavigate={close} returnTo={returnTo} />
  </FanSheet>;
  return open ? <Popover anchorRef={anchorRef} onClose={close} label={c.title}>
    <NotificationInbox locale={locale} inbox={inbox} favoriteName={favoriteName} onNavigate={close} returnTo={returnTo} />
  </Popover> : null;
}

function Popover({ anchorRef, onClose, label, children }: { anchorRef: RefObject<HTMLElement | null>; onClose: () => void; label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      setPlace(rect ? { top: rect.bottom + 8, right: Math.max(16, window.innerWidth - rect.right) } : { top: 64, right: 16 });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [anchorRef]);
  // 검토 VISUAL-K ①: 자리가 정해져 보이게 된 뒤(숨김 상태에서는 focus가 무시된다) 첫 조작 요소(모두 읽음·설정·칩·로그인)로 포커스를 한 번 옮긴다. 없으면 창 자체.
  const placed = place !== null, focused = useRef(false);
  useEffect(() => {
    if (!placed || focused.current) return;
    focused.current = true;
    const first = ref.current?.querySelector<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])");
    (first ?? ref.current)?.focus({ preventScroll: true });
  }, [placed]);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const anchor = anchorRef.current;
    const onClose = () => closeRef.current();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || anchor?.contains(target)) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      anchor?.focus({ preventScroll: true });
    };
  }, [anchorRef]);
  return <div ref={ref} className={styles.popover} style={place ? { top: place.top, right: place.right } : { visibility: "hidden" }} aria-label={label} role="region" tabIndex={-1} data-notification-panel="popover">
    {children}
  </div>;
}
