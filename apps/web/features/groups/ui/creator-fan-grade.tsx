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
import {groupsCopy} from './copy';
import {messages as localizedMessages} from '@/i18n/catalogs/components__celebrity-fan-page';
import {translate} from '@/i18n/messages';
import styles from './groups.module.css';
const parseSummary=(body:unknown)=>mySummarySchema.parse((body as {summary:unknown}).summary);
type SummaryResource={state:ReturnType<typeof useOwnedFanResource<ReturnType<typeof parseSummary>>>['state'];retry:()=>void};
/** 머리의 내 팬 등급. 패스포트가 있을 때만 그린다(없으면 별 버튼이 팬 인증으로 보낸다). 값이 없을 수 있는 칸이라 로딩 자리를 두지 않는다. */
export function CreatorFanGrade({slug,locale,resource:shared}:{slug:string;locale:AppLocale;resource?:SummaryResource}){
 const auth=useByUsAuth(),own=useOwnedFanResource(!shared&&auth.authenticated?`/api/me/summary?locale=${toContentLocale(locale)}&tierStages=1`:null,parseSummary,auth),resource=shared??own,t=groupsCopy(locale);
 if(!auth.ready||!auth.authenticated)return null;
 if(resource.state.status==='loading')return null;
 if(resource.state.status==='error')return <div className={styles.creatorFanGrade} role="alert"><span>{locale==='ko'?'내 팬 활동을 불러오지 못했어요.':translate(locale,localizedMessages.m0aea4924b59e,"Couldn't load your fan activity.")}</span><FanAction variant="text" onClick={resource.retry}>{t.retry}</FanAction></div>;
 const passport=resource.state.data.creators.find(item=>item.celebrity.slug===slug)?.passport;
 if(!passport)return null;
 const stage=passport.stageProgress?.current,label=stage?fanStageLabel(locale,stage):levelLabel(locale,passport.tier);
 return <Link className={styles.creatorFanGrade} href={`/passports/${passport.id}?locale=${locale}` as Route}><FanTierBadge tier={passport.tier} stageKey={stage?.key} locale={locale} size={24}/><span>{managementMembersCopy(locale).tier} · {label}</span></Link>;
}
