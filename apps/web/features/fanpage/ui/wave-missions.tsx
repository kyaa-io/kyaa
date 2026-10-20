import { Check, Camera, Heart, PenLine, Users, MessageCircle, Radio, Mic, Trophy, Globe, Flag } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { waveProgramHref, WAVE_FANPAGE_SLUG } from "../domain/wave-programs";
import { waveSectionHref } from "./wave-navigation";
import { FanSectionHeader } from "@/components/fan-ui/fan-heading";
import type { AppLocale } from "@/i18n/locales";
import { waveMissionsCopy } from "@/i18n/catalogs/features__fanpage__wave-missions";
import { WAVE_MISSIONS, type WaveMissionProgress } from "../domain/wave-missions";
import styles from "./wave-missions.module.css";

const icons = [Flag, Camera, Heart, PenLine, Users, MessageCircle, Radio, Mic, Trophy, Globe];

export function WaveMissionsHome({ locale, progress = [] }: {
  locale: AppLocale;
  progress?: readonly WaveMissionProgress[];
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
          <strong className={styles.name} lang="ko">{href ? <Link className={styles.link} lang="ko" href={href as Route}>{mission.name}</Link> : mission.name}</strong>
          <p className={styles.description} lang="ko">{mission.description}</p>
          <span className={styles.state}>{copy[mission.status]}</span>
        </div>
      </li>; })}
    </ol>
  </section>;
}
