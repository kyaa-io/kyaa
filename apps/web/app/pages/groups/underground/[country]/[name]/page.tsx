import { FanHeading } from "@/components/fan-ui/fan-heading";
import Link from "@/components/fan-ui/hover-prefetch-link";
import Script from "next/script";
import { notFound } from "next/navigation";
import { loadServerEnv } from "@/server/config/env";
import { createClient } from "@/server/data/client";
import { parseAppLocale, type AppLocale } from "@/i18n/locales";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

// Legal review is required before this route can serve any survey record in production.
// Until then it opens only on the DEV deployment (APP_ENV=dev) and local development, for review.
function surveyPagesOpen() {
  return process.env.APP_ENV === "dev" || (process.env.APP_ENV === undefined && process.env.NODE_ENV === "development");
}

const calendar: Record<AppLocale, string> = {
  ko: "공연 일정", en: "Show calendar", ja: "ライブ予定", "zh-Hans": "演出日程", "zh-Hant": "演出日程",
  es: "Calendario de conciertos", id: "Jadwal konser", vi: "Lịch biểu diễn", th: "ปฏิทินการแสดง",
  pt: "Calendário de shows", fr: "Calendrier des concerts", ru: "Календарь концертов", mn: "Тоглолтын хуваарь",
};
const removal: Record<AppLocale, string> = {
  ko: "페이지 내림 요청", en: "Request removal", ja: "掲載取り下げのご依頼",
  "zh-Hans": "申请下架", "zh-Hant": "申請下架", es: "Solicitar retirada",
  id: "Minta penghapusan", vi: "Yêu cầu gỡ trang", th: "ขอให้นำหน้าออก",
  pt: "Solicitar remoção", fr: "Demander le retrait", ru: "Запросить удаление", mn: "Устгах хүсэлт",
};

export default async function Page({ params, searchParams }: {
  params: Promise<{ country: string; name: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  if (!surveyPagesOpen()) notFound();
  const { country, name: encodedName } = await params;
  // Dynamic segments arrive percent-encoded; most survey names are Japanese or Korean.
  const name = decodeURIComponent(encodedName);
  if (!["JP", "KR"].includes(country)) notFound();
  const locale = parseAppLocale((await searchParams).locale);
  const env = loadServerEnv();
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await db.from("unverified_idol_candidates")
    .select("official_name,official_x,schedule_celebrity_id,recent_show,next_show").eq("country", country).eq("official_name", name).maybeSingle();
  if (error) throw new Error("Survey page unavailable");
  if (!data) notFound();
  const handle = /^https:\/\/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/.exec(data.official_x ?? "")?.[1];
  const schedules = data.schedule_celebrity_id
    ? await db.from("celebrity_schedules").select("id,title_ko,title_en,starts_at,location")
        .eq("celebrity_id", data.schedule_celebrity_id).eq("status", "published").order("starts_at")
    : { data: [], error: null };
  if (schedules.error) throw new Error("Schedule unavailable");
  return <main>
    <FanHeading as="h1">{data.official_name}</FanHeading>
    {handle && <><Link className="twitter-timeline" data-tweet-limit="3" href={`https://x.com/${handle}`}>X · @{handle}</Link><Script src="https://platform.twitter.com/widgets.js" strategy="afterInteractive" /></>}
    {data.recent_show && <p>{data.recent_show}</p>}
    {data.next_show && <p>{data.next_show}</p>}
    {schedules.data?.map(show => <p key={show.id}><a href={`/live/calendar/schedules/${show.id}?locale=${locale}`}>
      {locale === "ko" ? show.title_ko : show.title_en}</a> · {new Date(show.starts_at).toLocaleDateString(locale, { timeZone: "Asia/Seoul" })} · {show.location}</p>)}
    <a href={`/live/calendar?locale=${locale}`}>{calendar[locale]}</a>
    <p><a href={`mailto:support@kyaa.io?subject=${encodeURIComponent(removal[locale] + " · " + name)}`}>{removal[locale]}</a></p>
  </main>;
}
