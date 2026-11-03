"use client";
import {useEffect} from 'react';
import {useByUsAuth} from '@/features/auth/client/cognito-auth';
import {subscribeFanActivityUpdates} from '@/components/fan-ui/fan-activity-updates';
import {useFanpageResource} from '@/features/fanpage/ui/use-fanpage-resource';
import {earningStatusSchema,activitySourceSchema} from '@/server/mobile-fan-economy/domain';
import type {AppLocale} from '@/i18n/locales';
import {activityPointCopy} from './activity-point-copy';
import styles from './activity-point-hint.module.css';
const parseStatus=(value:unknown)=>earningStatusSchema.parse(value);
const parseSource=(value:unknown)=>activitySourceSchema.parse(value);

export function ActivityPointHint({slug,action,locale,postId}:{slug:string;action:'reaction'|'comment';locale:AppLocale;postId?:string}){
 const auth=useByUsAuth(),enabled=auth.ready&&auth.authenticated;
 const query=`celebritySlug=${encodeURIComponent(slug)}`;
 const policy=useFanpageResource(enabled?`/api/me/mobile-fan-economy/earning-status?${query}`:null,parseStatus);
 const source=useFanpageResource(enabled&&action==='reaction'&&postId?`/api/me/mobile-fan-economy/activities/source?${query}&sourceType=fan_post_likes&sourceKey=${encodeURIComponent(postId)}`:null,parseSource);
 const invalidatePolicy=policy.invalidate,invalidateSource=source.invalidate;
 useEffect(()=>subscribeFanActivityUpdates(auth.user?.id,()=>{invalidatePolicy();invalidateSource();},'community'),[auth.user?.id,invalidatePolicy,invalidateSource]);
 if(!enabled||policy.state.status!=='ready'||policy.state.data.policy.status!=='configured')return null;
 // A previous like remains a duplicate even after unlike/re-like.
 if(action==='reaction'&&(!postId||source.state.status!=='ready'||source.state.data.sourceId))return null;
 const rule=policy.state.data.actions.find(item=>item.key===action),c=activityPointCopy[locale];
 if(!rule||!rule.pointAmount||rule.status==='disabled'||rule.status==='not_eligible')return null;
 if(rule.status==='daily_limit'||rule.status==='lifetime_limit')return <span className={styles.hint}>{rule.status==='daily_limit'?c.dailyLimit:c.complete}</span>;
 return <span className={styles.hint}><strong>+{rule.pointAmount.toLocaleString(locale)} P</strong><span>{c.condition}{rule.remainingToday!==null&&` · ${c.remaining.replace('{n}',rule.remainingToday.toLocaleString(locale))}`}</span></span>;
}
