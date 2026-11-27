"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { AppLocale } from "@/i18n/locales";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useOperatorChannels, type OperatorChannel } from "./use-operator-channels";
import styles from "./operator-entry-links.module.css";

const labels: Record<AppLocale | "ar", readonly [string, string]> = {
  ko: ["내 채널 운영", "운영하기"],
  en: ["Manage my channel", "Manage page"],
  ar: ["إدارة قناتي", "إدارة الصفحة"],
  ja: ["マイチャンネル運営", "ページを管理"],
  "zh-Hans": ["管理我的频道", "管理页面"],
  "zh-Hant": ["管理我的頻道", "管理頁面"],
  es: ["Gestionar mi canal", "Gestionar página"],
  id: ["Kelola kanal saya", "Kelola halaman"],
  vi: ["Quản lý kênh của tôi", "Quản lý trang"],
  th: ["จัดการช่องของฉัน", "จัดการเพจ"],
  pt: ["Gerir o meu canal", "Gerir página"],
  fr: ["Gérer ma chaîne", "Gérer la page"],
  ru: ["Управление моим каналом", "Управлять страницей"],
  mn: ["Сувгаа удирдах", "Хуудсыг удирдах"],
};

function operatorHref(channelId: string, locale: AppLocale | "ar") {
  const params = new URLSearchParams({ channel: channelId });
  if (locale !== "ko") params.set("lang", "en");
  return `/operator?${params}`;
}

function OperatorLink({ channel, locale, page }: {
  channel: OperatorChannel;
  locale: AppLocale;
  page?: boolean;
}) {
  const params = useSearchParams();
  // The rest of the app uses its supported locale fallback for Arabic URLs.
  const language = /^ar(?:[-_]|$)/i.test(params?.get("locale") ?? "") ? "ar" : locale;
  const [myLabel, pageLabel] = labels[language];
  return <FanAction href={operatorHref(channel.id, language)} variant="secondary">
    <span dir={language === "ar" ? "rtl" : undefined} lang={language}>
      {page ? pageLabel : <>{myLabel} · <bdi>{language === "ko" ? channel.nameKo : channel.nameEn}</bdi></>}
    </span>
  </FanAction>;
}

export function MyOperatorLinks({ locale }: { locale: AppLocale }) {
  const session = useOperatorChannels({ synchronizeSession: false });
  if (session.status !== "authorized" || session.kind !== "operator" || session.channels.length === 0) return null;
  return <ul className={styles.links} role="list">
    {session.channels.map((channel) => <li key={channel.id} data-row="">
      <Suspense><OperatorLink channel={channel} locale={locale} /></Suspense>
    </li>)}
  </ul>;
}

export function FanPageOperatorLink({ slug, locale }: { slug: string; locale: AppLocale }) {
  const session = useOperatorChannels({ synchronizeSession: false });
  const channel = session.status === "authorized" && session.kind === "operator"
    ? session.channels.find((item) => item.slug === slug)
    : undefined;
  return channel ? <Suspense><OperatorLink channel={channel} locale={locale} page /></Suspense> : null;
}
