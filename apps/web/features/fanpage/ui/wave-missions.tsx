import { TranslatedText } from "@/features/content-safety/ui/use-automatic-translation";
import { Check, Camera, Heart, PenLine, Users, MessageCircle, Radio, Mic, Trophy, Globe, Flag } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { waveProgramHref, WAVE_FANPAGE_SLUG } from "../domain/wave-programs";
import { waveSectionHref } from "./wave-navigation";
import { FanSectionHeader } from "@/components/fan-ui/fan-heading";
import type { AppLocale } from "@/i18n/locales";
import { waveMissionsCopy } from "@/i18n/catalogs/features__fanpage__wave-missions";
import { WAVE_MISSIONS, type WaveMissionProgress, type WaveMissionStamp } from "../domain/wave-missions";
import { mintStatusLabel } from "@/features/passport/domain/passport-read-model";
import styles from "./wave-missions.module.css";

const icons = [Flag, Camera, Heart, PenLine, Users, MessageCircle, Radio, Mic, Trophy, Globe];

export function WaveMissionsHome({ locale, progress = [], stamps = [] }: {
  locale: AppLocale;
  progress?: readonly WaveMissionProgress[];
  stamps?: readonly WaveMissionStamp[];
}) {
  const destinations = {
    "event-photo": waveSectionHref("media", locale),
    "fanpage-like": `/${WAVE_FANPAGE_SLUG}?locale=${locale}#first-reaction`,
    introduction: waveSectionHref("introductions", locale),
    friendship: waveSectionHref("friends", locale),
    "dm-greeting": waveSectionHref("friends", locale),
    "live-cheer": waveSectionHref("live", locale),
    "insight-review": waveSectionHref("insight", locale),
    "quiz-correct": waveProgramHref("wave-quiz", locale),
    "website-cheer": `/${WAVE_FANPAGE_SLUG}?locale=${locale}#wave-home-cheer`,
  };
  const copy = waveMissionsCopy(locale);
  const missions = WAVE_MISSIONS.map(mission => ({ ...mission, status: progress.find(item => item.key === mission.key)?.status ?? "unverified" }));
  const completed = missions.filter(mission => mission.status === "completed").length;
  const summary = `${completed} / ${WAVE_MISSIONS.length} · ${copy.completed}`;

  const stampLabel = (stamp: WaveMissionStamp) => stamp.status === "waiting_wallet" ? waitingWallet[locale] : mintStatusLabel(locale, stamp.status === "preparing" ? "queued" : stamp.status);
  return <section className={styles.section} aria-label={copy.title}>
    <FanSectionHeader title={copy.title} description={<>{copy.description}<br />{copy.help}</>} />
    <div className={styles.summary}>
      <p className={styles.count} role="status">{summary}</p>
      <progress className={styles.progress} max={WAVE_MISSIONS.length} value={completed} aria-label={copy.title}>{summary}</progress>
    </div>
    <ol className={styles.list}>
      {missions.map((mission, index) => {
        const Icon = icons[index];
        const href = mission.status === "completed" || mission.key === "checkin" ? null : destinations[mission.key];
        return <li className={styles.mission} key={mission.key} data-status={mission.status}>
        <span className={styles.number}>{index === 0 ? "START" : String(index).padStart(2, "0")}</span>
        <span className={styles.marker} aria-hidden="true"><Icon size={30} strokeWidth={1.6} />{mission.status === "completed" && <span className={styles.check}><Check size={16} strokeWidth={3} /></span>}</span>
        <div className={styles.content}>
          <strong className={styles.name}>{href ? <Link className={styles.link} href={href as Route}><TranslatedText text={mission.name} locale={locale} controls={false}><span lang="ko">{mission.name}</span></TranslatedText></Link> : <TranslatedText text={mission.name} locale={locale} controls={false}><span lang="ko">{mission.name}</span></TranslatedText>}</strong>
          <TranslatedText as="p" className={styles.description} text={mission.description} locale={locale}><span lang="ko">{mission.description}</span></TranslatedText>
          <span className={styles.state}>{copy[mission.status]}</span>
          {stamps.filter(stamp => stamp.key === mission.key).map(stamp => <p className={styles.description} key={stamp.key}>{stampTitle[locale]} · {stampLabel(stamp)}</p>)}
        </div>
      </li>; })}
    </ol>
    {stamps.filter(stamp => stamp.key === "bingo").map(stamp => <p className={styles.description} key={stamp.key}>BINGO · {stampTitle[locale]} · {stampLabel(stamp)}</p>)}
  </section>;
}

const stampTitle: Record<AppLocale, string> = { ko: "미션 도장", en: "Mission stamp", ja: "ミッションスタンプ", "zh-Hans": "任务印章", "zh-Hant": "任務印章", es: "Sello de misión", id: "Stempel misi", vi: "Dấu nhiệm vụ", th: "แสตมป์ภารกิจ", pt: "Selo de missão", fr: "Tampon de mission",
  ru: "Почтовая марка миссии"
 };
const waitingWallet: Record<AppLocale, string> = { ko: "지갑 준비 대기", en: "Waiting for wallet", ja: "ウォレット準備待ち", "zh-Hans": "等待钱包就绪", "zh-Hant": "等待錢包就緒", es: "Esperando la cartera", id: "Menunggu dompet", vi: "Đang chờ ví", th: "รอกระเป๋าเงินพร้อม", pt: "Aguardando carteira", fr: "En attente du portefeuille",
  ru: "В ожидании кошелька"
 };
