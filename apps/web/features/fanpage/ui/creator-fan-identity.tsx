import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { translate } from "@/i18n/messages";
import { messages } from "@/i18n/catalogs/components__celebrity-fan-page";
import { creatorIdentity } from "../domain/creator-identities";
import { creatorName } from "../domain/creator-names";
import styles from "./fanpage.module.css";

const fandomLabels: Record<AppLocale, string> = {
  ko: "팬덤", en: "Fandom", ja: "ファンダム", "zh-Hans": "粉丝名", "zh-Hant": "粉絲名",
  es: "Fandom", id: "Fandom", vi: "Cộng đồng fan", th: "แฟนด้อม", pt: "Fandom", fr: "Fandom",
  ru: "Фандом",

};

export function CreatorFanIdentity({ slug, name, locale }: { slug: string; name: string; locale: AppLocale }) {
  const identity = creatorIdentity(slug);
  if (!identity) return <h1 id="celebrity-heading">{name}</h1>;
  const primary = identity.logo || locale !== "ko" ? identity.en : identity.ko;
  // 한국어 화면은 한글·영문을 함께, 다른 언어 화면은 공식 영문 아래에 그 언어 표기만 둔다(한글을 보이지 않음).
  const local = creatorName(slug, locale);
  const secondary = locale === "ko" ? (primary === identity.ko ? identity.en : identity.ko) : local.toLowerCase() !== primary.toLowerCase() && /[^\p{Script=Latin}\s\p{P}]/u.test(local) ? local : null;
  return <div className={styles.artistIdentity}>
    <div className={styles.artistName}>
      {identity.logo && <Image className={styles.artistLogo} src={identity.logo} alt="" width={80} height={80} />}
      <h1 id="celebrity-heading">{primary}{secondary && <span>{secondary}</span>}</h1>
    </div>
    {identity.fandom && <dl className={styles.fandom}>
      <dt>{fandomLabels[locale]}</dt>
      <dd><a href={identity.fandom.source} target="_blank" rel="noopener noreferrer" data-outbound-kind="external" aria-label={`${fandomLabels[locale]} · ${identity.fandom.name} · ${identity.fandom.ko}, ${locale === "ko" ? "새 창" : translate(locale, messages.me1f5c62bd1d6, "new window")}`}>
        {identity.fandom.mark && <svg className={styles.fandomMark} viewBox="550 350 770 260" aria-hidden="true"><image href={identity.fandom.mark} width="1664" height="1368" /></svg>}
        <span>{identity.fandom.name}<span className={styles.fandomKorean}>{identity.fandom.ko}</span></span>
        <ArrowUpRight className={styles.fandomExternal} aria-hidden="true" />
      </a></dd>
    </dl>}
  </div>;
}
