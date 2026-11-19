"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAppLocale } from "@/components/locale-provider";
import { FanAction } from "@/components/fan-ui/fan-action";
import { PageNoticeDialog, pageNoticeBlocked } from "@/features/groups/ui/page-notice-modal";
import { useGroupRequest } from "@/features/groups/ui/use-group-resource";
import { isMemberEventHref, localizedBannerHref, type HomeBanner } from "@/features/home/domain/home-banner";
import { parseBannerSlots } from "./banner-slot-source";

const hideToday = {
  ko: "오늘 하루 안 보기", en: "Hide for today", ja: "今日は表示しない",
  "zh-Hans": "今天不再显示", "zh-Hant": "今天不再顯示", es: "No mostrar hoy",
  id: "Sembunyikan hari ini", vi: "Không hiển thị hôm nay", th: "ซ่อนสำหรับวันนี้",
  pt: "Não mostrar hoje", fr: "Masquer pour aujourd’hui", ru: "Скрыть на сегодня",
};

function nextKoreanMidnight(now: number) {
  const hour = 3_600_000;
  const day = 24 * hour;
  return (Math.floor((now + 9 * hour) / day) + 1) * day - 9 * hour;
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
  const eligible = ready && authenticated && !/^(pending|guest):/.test(ownerKey)
    && !/^\/(admin|operator|auth|login)(\/|$)/.test(pathname);
  const lookup = eligible ? JSON.stringify([ownerKey, locale, pathname]) : null;
  const [result, setResult] = useState<{ lookup: string; banner?: HomeBanner }>();
  const [openKey, setOpenKey] = useState<string>();
  const [expired, setExpired] = useState<string>();
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const banner = lookup && result?.lookup === lookup ? result.banner : undefined;
  const eventPath = banner && isMemberEventHref(banner.href) && pathname !== banner.href ? banner.href : null;
  const key = eventPath ? `kyaa:member-event-popup:${ownerKey.slice(0, ownerKey.lastIndexOf(":"))}:${eventPath}` : null;
  const end = Date.parse(banner?.endsAt ?? "");
  const instance = key && banner ? JSON.stringify([lookup, key, banner.id, end]) : null;

  useEffect(() => {
    if (!lookup) return;
    const requestLookup = lookup;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function refresh() {
      try {
        const value = await request(`/api/public/banner-slots?area=member-event&locale=${locale}`, { signal: controller.signal });
        if (!controller.signal.aborted) setResult({ lookup: requestLookup, banner: parseBannerSlots(value).member_event_popup });
      } catch {
        if (!controller.signal.aborted) setResult({ lookup: requestLookup });
      }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 15_000);
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [lookup, locale, request]);

  useEffect(() => {
    if (!key || !instance || !Number.isFinite(end) || closed.has(key)) return;
    const check = () => {
      if (Date.now() >= end) { setExpired(instance); return; }
      if (document.querySelector("[data-page-notice-priority]")) {
        setOpenKey(previous => previous === instance ? undefined : previous);
        return;
      }
      if (hiddenUntil(key) || document.visibilityState === "hidden" || pageNoticeBlocked()) return;
      setOpenKey(instance);
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    const frame = requestAnimationFrame(check);
    const interval = setInterval(check, 1000);
    const deadline = setTimeout(check, Math.max(0, Math.min(end - Date.now(), 2_147_483_647)));
    return () => { observer.disconnect(); cancelAnimationFrame(frame); clearInterval(interval); clearTimeout(deadline); };
  }, [key, end, instance, closed]);

  if (!banner || !eventPath || !key || !instance || expired === instance || openKey !== instance || closed.has(key)) return null;
  const close = () => setClosed(previous => new Set([...previous, key]));
  return <PageNoticeDialog open onClose={close} locale={locale} title={banner.title} description={banner.description}
    actionLabel={banner.ctaLabel} actionHref={localizedBannerHref(eventPath, locale)}
    secondary={<FanAction variant="text" onClick={() => {
      try {
        localStorage.setItem(key, String(nextKoreanMidnight(Date.now())));
        setOpenKey(undefined);
      } catch {
        close();
      }
    }}>{hideToday[locale]}</FanAction>}>
    <picture>
      {banner.mobileImage && <source media="(width < 48rem)" srcSet={banner.mobileImage.url} width={banner.mobileImage.width} height={banner.mobileImage.height} />}
      {/* The managed original defines the frame so embedded text and logos stay visible. */}
      <img src={banner.desktopImage.url} width={banner.desktopImage.width} height={banner.desktopImage.height} alt={banner.alt} />
    </picture>
  </PageNoticeDialog>;
}
