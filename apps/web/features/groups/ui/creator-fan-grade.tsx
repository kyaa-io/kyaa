"use client";
import Link from 'next/link';
import type {Route} from 'next';
import {useByUsAuth} from '@/features/auth/client/cognito-auth';
import {useOwnedFanResource} from '@/components/fan-ui/use-owned-fan-resource';
import {mySummarySchema} from '@/features/my/domain/my-summary';
import {FanTierBadge} from '@/features/rewards/ui/fan-tier-badge';
import {fanStageLabel} from '@/features/rewards/domain/fan-stage';
import {levelLabel} from '@/features/passport/domain/passport-read-model';
import {toContentLocale,type AppLocale} from '@/i18n/locales';
import {FanAction} from '@/components/fan-ui/fan-action';
import {managementMembersCopy} from './management-members-copy';
import {interactionCopy} from './interaction-copy';
import {groupsCopy} from './copy';
import styles from './groups.module.css';
const parseSummary=(body:unknown)=>mySummarySchema.parse((body as {summary:unknown}).summary);
export function CreatorFanGrade({slug,locale}:{slug:string;locale:AppLocale}){
 const auth=useByUsAuth(),resource=useOwnedFanResource(auth.authenticated?`/api/me/summary?locale=${toContentLocale(locale)}&tierStages=1`:null,parseSummary,auth),t=groupsCopy(locale);
 if(!auth.ready||!auth.authenticated)return null;
 if(resource.state.status==='loading')return <div className={styles.creatorFanGrade} role="status">{t.loading}</div>;
 if(resource.state.status==='error')return <div className={styles.creatorFanGrade} role="alert"><span>{t.error}</span><FanAction variant="text" onClick={resource.retry}>{t.retry}</FanAction></div>;
 const passport=resource.state.data.creators.find(item=>item.celebrity.slug===slug)?.passport;
 if(!passport)return <div className={styles.creatorFanGrade}><FanAction variant="text" href={`/c/${slug}/verify?locale=${locale}`}>{interactionCopy(locale).verify}</FanAction></div>;
 const stage=passport.stageProgress?.current,label=stage?fanStageLabel(locale,stage):levelLabel(locale,passport.tier);
 return <Link className={styles.creatorFanGrade} href={`/passports/${passport.id}?locale=${locale}` as Route}><FanTierBadge tier={passport.tier} stageKey={stage?.key} locale={locale} size={24}/><span>{managementMembersCopy(locale).tier} · {label}</span></Link>;
}
