"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAppLocale } from "@/components/locale-provider";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanText } from "@/components/fan-ui/fan-text";
import { PageNoticeDialog, pageNoticeBlocked } from "@/features/groups/ui/page-notice-modal";
import { useGroupRequest } from "@/features/groups/ui/use-group-resource";
import { isChemiPromoHref, isMemberEventHref, localizedBannerHref, type HomeBanner } from "@/features/home/domain/home-banner";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { signupRaffleHomeBanner } from "@/features/home/domain/signup-raffle-home-banner";
import { parseBannerSlots } from "./banner-slot-source";

import styles from "./banner-slot.module.css";

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

const durationLabel: typeof hideToday = {
  ko: "숨길 기간 (최대 하나 선택)", en: "Hide duration (choose at most one)", get mn() { return this.en; },
  ja: "非表示期間（選択は1つまで）", "zh-Hans": "隐藏时长（最多选一项）", "zh-Hant": "隱藏時間（最多選一項）",
  es: "Duración (elige como máximo una opción)", id: "Durasi (pilih maksimal satu)",
  vi: "Thời gian ẩn (chọn tối đa một)", th: "ระยะเวลาที่ซ่อน (เลือกได้ไม่เกินหนึ่งข้อ)",
  pt: "Duração (escolha no máximo uma opção)", fr: "Durée (un choix maximum)", ru: "Срок (не более одного варианта)",
};

const hideRaffle: typeof hideToday = {
  ko: "다시 보지 않기", en: "Don’t show again", ja: "今後表示しない", "zh-Hans": "不再显示", "zh-Hant": "不再顯示",
  es: "No volver a mostrar", id: "Jangan tampilkan lagi", vi: "Không hiển thị lại", th: "ไม่ต้องแสดงอีก",
  pt: "Não mostrar novamente", fr: "Ne plus afficher", ru: "Больше не показывать", mn: "Дахин бүү харуул",
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
  const attempted = useRef<string | undefined>(undefined);
  const [raffle, setRaffle] = useState<string>();
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

  useEffect(() => {
    if (!member || !lookup || result?.lookup !== lookup || active || (pathname !== "/" && pathname !== "/groups")) return;
    const check = () => {
      if (attempted.current === ownerKey || document.visibilityState === "hidden" || pageNoticeBlocked()) return;
      attempted.current = ownerKey;
      void request("/api/signup-event/popup", { method: "POST" }).then(value => {
        if (value?.show === true && !pageNoticeBlocked()) setRaffle(lookup);
      }).catch(() => {});
    };
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [lookup, member, ownerKey, active, pathname, request, result]);
  useEffect(() => { setRaffle(undefined); }, [lookup]);
  if (raffle && raffle === lookup && !active) {
    const banner = signupRaffleHomeBanner(locale);
    const close = () => setRaffle(undefined);
    return <PageNoticeDialog open onClose={close} locale={locale} title={banner.title} description={banner.description}
      actionLabel={banner.ctaLabel} actionHref={localizedBannerHref("/s/raffle?enter=1", locale)}
      secondary={<FanAction variant="text" onClick={close}>{hideRaffle[locale]}</FanAction>} />;
  }
  if (!active || active.lookup !== lookup || closed.has(active.key)) return null;
  const { banner, key } = active;
  return <PopupContent key={active.lookup + key} banner={banner} storageKey={key} locale={locale}
    close={() => setClosed(previous => new Set([...previous, key]))} hide={() => setActive(undefined)} />;
}

function PopupContent({ banner, storageKey, locale, close, hide }: {
  banner: HomeBanner; storageKey: string; locale: keyof typeof hideToday; close: () => void; hide: () => void;
}) {
  const [duration, setDuration] = useState<"today" | "week">();
  const dismiss = (duration: "today" | "week") => {
    try {
      localStorage.setItem(storageKey, String(popupDismissalExpiry(Date.now(), duration)));
      hide();
    } catch {
      close();
    }
  };
  return <PageNoticeDialog open onClose={() => duration ? dismiss(duration) : close()} locale={locale} title={banner.title} description={banner.description}
    actionLabel={banner.ctaLabel} actionHref={localizedBannerHref(banner.href, locale)}
    secondary={banner.placement === "chemi_promo_popup" ?
      <div role="group" aria-label={durationLabel[locale]} className={styles.durationOptions}>
        {(["today", "week"] as const).map(option => <label key={option}>
          <input type="checkbox" checked={duration === option}
            onChange={event => setDuration(event.target.checked ? option : undefined)} />
          <FanText role="meta">{(option === "today" ? hideToday : hideWeek)[locale]}</FanText>
        </label>)}
      </div> : <FanAction variant="text" onClick={() => dismiss("today")}>{hideToday[locale]}</FanAction>}>
    <picture>
      {banner.mobileImage && <source media="(width < 48rem)" srcSet={banner.mobileImage.url} width={banner.mobileImage.width} height={banner.mobileImage.height} />}
      {/* The managed original defines the frame so embedded text and logos stay visible. */}
      <img src={banner.desktopImage.url} width={banner.desktopImage.width} height={banner.desktopImage.height} alt={banner.alt} />
    </picture>
  </PageNoticeDialog>;
}
