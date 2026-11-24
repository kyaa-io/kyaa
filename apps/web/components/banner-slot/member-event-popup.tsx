"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAppLocale } from "@/components/locale-provider";
import { FanAction } from "@/components/fan-ui/fan-action";
import { PageNoticeDialog, pageNoticeBlocked } from "@/features/groups/ui/page-notice-modal";
import { useGroupRequest } from "@/features/groups/ui/use-group-resource";
import { isChemiPromoHref, isMemberEventHref, localizedBannerHref, type HomeBanner } from "@/features/home/domain/home-banner";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { parseBannerSlots } from "./banner-slot-source";

const hideToday = {
  ko: "오늘 하루 안 보기", get mn() { return this.en; }, en: "Hide for today", ja: "今日は表示しない",
  "zh-Hans": "今天不再显示", "zh-Hant": "今天不再顯示", es: "No mostrar hoy",
  id: "Sembunyikan hari ini", vi: "Không hiển thị hôm nay", th: "ซ่อนสำหรับวันนี้",
  pt: "Não mostrar hoje", fr: "Masquer pour aujourd’hui", ru: "Скрыть на сегодня",
};

const hideWeek: typeof hideToday = {
  ko: "일주일간 안 보기", get mn() { return this.en; }, en: "Hide for a week", ja: "1週間表示しない",
  "zh-Hans": "一周内不再显示", "zh-Hant": "一週內不再顯示", es: "No mostrar durante una semana",
  id: "Sembunyikan selama seminggu", vi: "Ẩn trong một tuần", th: "ซ่อนเป็นเวลาหนึ่งสัปดาห์",
  pt: "Não mostrar por uma semana", fr: "Masquer pendant une semaine", ru: "Скрыть на неделю",
};

const day = 86_400_000;
export function popupDismissalExpiry(now: number, duration: "today" | "week") {
  if (duration === "week") return now + 7 * day;
  const koreaOffset = 9 * 3_600_000;
  return (Math.floor((now + koreaOffset) / day) + 1) * day - koreaOffset;
}

function hiddenUntil(key: string) {
  try {
    const expiry = Number(localStorage.getItem(key));
    if (expiry > Date.now()) return expiry;
    localStorage.removeItem(key);
  } catch { /* The current visit can still dismiss the popup. */ }
  return 0;
}

export function MemberEventPopup() {
  const { locale } = useAppLocale();
  const { ready, authenticated, ownerKey, request } = useGroupRequest();
  const pathname = usePathname();
  const enabled = ready && !/^\/(admin|operator|auth|login)(\/|$)/.test(pathname);
  const member = authenticated && !/^(pending|guest):/.test(ownerKey);
  const promo = pathname === "/";
  const lookup = enabled && (member || promo) ? JSON.stringify([ownerKey, locale, pathname]) : null;
  const [result, setResult] = useState<{ lookup: string; candidates: HomeBanner[] }>();
  const [active, setActive] = useState<{ banner: HomeBanner; key: string; lookup: string }>();
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (!lookup) return;
    const requestLookup = lookup;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      const url = (area: string) => `/api/public/banner-slots?area=${area}&locale=${locale}`;
      const [event, chemi] = await Promise.allSettled([
        member && request(url("member-event"), { signal: controller.signal })
          .then(value => parseBannerSlots(value).member_event_popup),
        promo && withRequestDeadline(async signal => {
          const response = await fetch(url("chemi-promo"), { signal });
          if (!response.ok) return undefined;
          return parseBannerSlots(await response.json()).chemi_promo_popup;
        }, { signal: controller.signal, timeoutMs: 3000 }),
      ]);
      if (controller.signal.aborted) return;
      const candidates = [event, chemi].flatMap(item =>
        item.status === "fulfilled" && item.value ? [item.value] : []);
      setResult({ lookup: requestLookup, candidates });
      timer = setTimeout(refresh, 15_000);
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [lookup, locale, request, member, promo]);

  useEffect(() => {
    if (!lookup || result?.lookup !== lookup) return;
    const requestLookup = lookup;
    const candidates = result.candidates.flatMap(banner => {
      const chemi = banner.placement === "chemi_promo_popup";
      if (banner.href === pathname || !(chemi ? isChemiPromoHref : isMemberEventHref)(banner.href)) return [];
      const key = chemi ? `kyaa:chemi-promo:${banner.id}`
        : `kyaa:member-event-popup:${ownerKey.slice(0, ownerKey.lastIndexOf(":"))}:${banner.href}`;
      return [{ banner, key, lookup: requestLookup }];
    });
    const check = () => {
      if (document.querySelector("[data-page-notice-priority]")) {
        setActive(undefined);
        return;
      }
      const now = Date.now();
      // Member events have priority. Keep an open campaign in place until it closes
      // or expires so a background refresh cannot swap the dialog under the user.
      const available = candidates.filter(({ banner, key }) =>
        Date.parse(banner.endsAt ?? "") > now && !closed.has(key) && !hiddenUntil(key));
      const blocked = document.visibilityState === "hidden" || pageNoticeBlocked();
      setActive(previous => {
        const current = previous?.lookup === requestLookup
          ? available.find(candidate => candidate.key === previous.key)
          : undefined;
        const next = current ?? (blocked ? undefined : available[0]);
        return previous === next ? previous : next;
      });
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    const frame = requestAnimationFrame(check);
    const interval = setInterval(check, 1000);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); clearInterval(interval); };
  }, [lookup, result, pathname, ownerKey, closed]);

  if (!active || active.lookup !== lookup || closed.has(active.key)) return null;
  const { banner, key } = active;
  const close = () => setClosed(previous => new Set([...previous, key]));
  const dismiss = (duration: "today" | "week") => {
    try {
      localStorage.setItem(key, String(popupDismissalExpiry(Date.now(), duration)));
      setActive(undefined);
    } catch {
      close();
    }
  };
  return <PageNoticeDialog key={key} open onClose={close} locale={locale} title={banner.title} description={banner.description}
    actionLabel={banner.ctaLabel} actionHref={localizedBannerHref(banner.href, locale)}
    secondary={<>
      <FanAction variant="text" onClick={() => dismiss("today")}>{hideToday[locale]}</FanAction>
      {banner.placement === "chemi_promo_popup" &&
        <FanAction variant="text" onClick={() => dismiss("week")}>{hideWeek[locale]}</FanAction>}
    </>}>
    <picture>
      {banner.mobileImage && <source media="(width < 48rem)" srcSet={banner.mobileImage.url} width={banner.mobileImage.width} height={banner.mobileImage.height} />}
      {/* The managed original defines the frame so embedded text and logos stay visible. */}
      <img src={banner.desktopImage.url} width={banner.desktopImage.width} height={banner.desktopImage.height} alt={banner.alt} />
    </picture>
  </PageNoticeDialog>;
}
