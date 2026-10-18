"use client";
import { participationSummarySchema } from "@/server/live-participation/domain";
export { participationSummarySchema } from "@/server/live-participation/domain";
import { usePrivy } from "@privy-io/react-auth";
import Link from "next/link";
import type { Route } from "next";
import type { AppLocale } from "@/i18n/locales";
import { supportCopy } from "@/i18n/catalogs/features__support";
import { useOwnedFanResource } from "@/components/fan-ui/use-owned-fan-resource";
import { FanAction } from "@/components/fan-ui/fan-action";
import styles from "./support-screen.module.css";
export const parseParticipationSummary=(value:unknown)=>participationSummarySchema.parse(value);
export function CreatorBalance({slug,name,locale,compact=false}:{slug:string;name:string;locale:AppLocale;compact?:boolean}) {
 const auth=usePrivy();const t=supportCopy(locale);
 const resource=useOwnedFanResource(`/api/me/participation-summary?creator=${encodeURIComponent(slug)}`,parseParticipationSummary,auth);
 return <section className={`${styles.compactBalance} ${compact?styles.activityBalance:""}`} aria-label={`${name} · ${t.title}`}><div className={styles.balanceHeading}><strong>{name}</strong><Link href={`/support?locale=${locale}&creator=${encodeURIComponent(slug)}` as Route}>{t.title} →</Link></div>{resource.state.status==="ready"?<dl className={styles.balanceGrid}>{(compact?[[t.points,resource.state.data.availablePoints],[t.contribution,resource.state.data.contributionPoints]] as const:[[t.points,resource.state.data.availablePoints],[t.hearts,resource.state.data.hearts],[t.lifetime,resource.state.data.lifetimePoints],[t.contribution,resource.state.data.contributionPoints]] as const).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value.toLocaleString(locale)}</dd></div>)}</dl>:resource.state.status==="loading"?<p role="status">{t.loading}</p>:<div role="status"><p>{t.error}</p><FanAction onClick={resource.retry}>{t.retry}</FanAction></div>}{!compact&&resource.state.status==="ready"?<p className={styles.sentTotal}>{t.sent}: {resource.state.data.sentHearts.toLocaleString(locale)}</p>:null}{!compact&&<Link href={`/fandom?locale=${locale}&creator=${encodeURIComponent(slug)}` as Route}>{t.activity} →</Link>}</section>;
}
