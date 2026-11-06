"use client";
import {CreatorAttendanceDialog} from "@/features/dukjil/ui/creator-attendance-dialog";
import {WalletAttendanceDialog} from "@/features/group-wallet/ui/wallet-screen";
import {DukjilProvider} from "@/features/dukjil/ui/dukjil-provider";
import {EarnBadge} from "@/features/dukjil/ui/earn-badge";
import {TodayTiles} from "@/features/dukjil/ui/today-tiles";
import {useDukjil} from "@/features/dukjil/ui/dukjil-provider";
import {checkinNumbers} from "@/features/dukjil/domain/dukjil-ui";
import {useRef,useState} from "react";
import {useSearchParams} from "next/navigation";
import {CreatorScheduleCard} from './creator-schedule-card';
import {creatorHomeCardCopy} from './creator-home-card-copy';
import type {PublishedCelebrity} from '@/server/content/content-domain';
import {z} from 'zod';
import {BookOpen,Stamp,Medal,Ticket,Heart,Gift,ArrowRight} from 'lucide-react';
import {FanAction} from '@/components/fan-ui/fan-action';
import {PassportIdentityArtwork} from '@/features/passport/ui/passport-identity-artwork';
import {StampArtwork} from '@/features/passport/ui/passport-stamp-artwork';
import {stampTypeSchema} from '@/features/passport/domain/passport-read-model';
import {firstReactionStampSchema,passportStampDisplay} from '@/features/passport/domain/first-like-stamp';
import {CommunityStampArtwork} from '@/features/community-stamps/ui/community-stamp-artwork';
import {useCommunityStamps} from '@/features/community-stamps/ui/use-community-stamps';
import type {MySummary} from '@/features/my/domain/my-summary';
import type {AppLocale} from '@/i18n/locales';
import {toContentLocale} from '@/i18n/locales';
import {walletCopy} from '@/features/group-wallet/ui/copy';
import {capsuleCopy} from '@/features/group-capsule/copy';
import {raffleCopy} from '@/features/group-raffle/copy';
import {useGroupResource} from './use-group-resource';
import {groupDetailSchema} from '../domain/contracts';
import {groupsCopy} from './copy';
import {managementMembersCopy} from './management-members-copy';
import {creatorAsideCopy} from './creator-aside-copy';
import styles from './groups.module.css';
const schema=z.object({passport:z.object({id:z.uuid(),stamps:z.array(z.object({id:z.uuid(),type:stampTypeSchema,issuedAt:z.string()})),activities:z.array(z.object({stampId:z.uuid().nullable(),points:z.number().int()})),stampSummary:z.object({total:z.number().int().nonnegative()}),firstReaction:firstReactionStampSchema.nullable().optional()})}),parse=(v:unknown)=>schema.parse(v).passport,parseGroup=(v:unknown)=>groupDetailSchema.parse(v);
export function CreatorGroupHomeAside(props:Parameters<typeof CreatorGroupHomeAsideBody>[0]){return <DukjilProvider slug={props.slug} locale={props.locale} hasPassport={props.owned?Boolean(props.owned.passport):undefined}><CreatorGroupHomeAsideBody {...props}/></DukjilProvider>;}
function AttendanceBadge({locale}:{locale:AppLocale}){const d=useDukjil();if(!d?.authenticated)return null;if(d.status!=="on"||!d.attendanceKnown)return null;if(d.attendance?.attendedToday)return <EarnBadge variant="done" locale={locale}/>;const n=checkinNumbers(d.catalog);return n.points===undefined?null:<EarnBadge variant="inline" locale={locale} points={n.points} stamp/>;}
function CreatorGroupHomeAsideBody({slug,locale,owned,passportId,compact=false,schedule,celebrity}:{slug:string;locale:AppLocale;celebrity?:PublishedCelebrity;compact?:boolean;schedule?:{label:string;note:string};owned?:MySummary['creators'][number];passportId?:string|null}){
 const returnParam=useSearchParams()?.get('returnTo'),dukjil=useDukjil();
 const [attendanceOpen,setAttendanceOpen]=useState(false);
 const attendanceTrigger=useRef<HTMLAnchorElement|null>(null);
 const closeAttendance=()=>{setAttendanceOpen(false);requestAnimationFrame(()=>attendanceTrigger.current?.focus());};
 const card=creatorHomeCardCopy(locale),t=groupsCopy(locale),c=creatorAsideCopy(locale),w=walletCopy(locale),group=useGroupResource(`/api/groups/resolve/${encodeURIComponent(slug)}`,parseGroup),r=useGroupResource(owned?.passport?`/api/passports/${owned.passport.id}?locale=${toContentLocale(locale)}&tierStages=1`:null,parse),community=useCommunityStamps(),records=community.state.status==='ready'?community.state.data.stamps.filter(stamp=>stamp.kind==='welcome'||['first_comment','daily_checkin'].includes(stamp.kind)&&stamp.celebritySlug===slug):[],milestones=['welcome','first_comment','daily_checkin'].flatMap(kind=>{const list=records.filter(stamp=>stamp.kind===kind).sort((a,b)=>b.issuedAt.localeCompare(a.issuedAt));return list[0]?[list[0]]:[];}),legacy=r.data?passportStampDisplay({...r.data,stamps:r.data.stamps.map(stamp=>({...stamp,points:r.data!.activities.find(item=>item.stampId===stamp.id)?.points}))}):{stamps:[],totalCount:0},passportHref=passportId?`/passports/${passportId}?locale=${locale}`:`/${slug}?locale=${locale}&tab=certifications`;
 return <aside className={`${styles.creatorHomeAside} ${compact?styles.creatorPostAside:""}`}>{!compact&&celebrity&&<CreatorScheduleCard celebrity={celebrity} locale={locale} schedule={schedule}/>}{!compact&&<section className={styles.sourceHomeCard}><h2>{card.verification}</h2><p>{card.description}</p><FanAction href={group.data&&!(group.data.page.kind==='fan'&&group.data.page.slug===slug&&group.data.page.celebrityId)?`/pages/groups/${group.data.page.id}/missions?locale=${locale}`:`/${slug}?tab=certifications&locale=${locale}${returnParam?`&returnTo=${encodeURIComponent(returnParam)}`:""}`}>{card.requirements}</FanAction></section>}{!compact&&<section className={styles.creatorPassportCard}><h2>{c.passport}</h2>{owned?.passport&&r.data?<div className={styles.asidePassportBook}><PassportIdentityArtwork celebrity={owned.celebrity} level={owned.passport.tier} stamps={[]} totalCount={legacy.totalCount+milestones.length} locale={locale}/><ul className={styles.asidePassportStamps}>{milestones.map(stamp=><li key={stamp.id}><CommunityStampArtwork kind={stamp.kind} locale={locale} size={48} decorative/></li>)}{legacy.stamps.slice(0,Math.max(0,9-milestones.length)).map(stamp=><li key={stamp.id}><StampArtwork type={stamp.type} locale={locale} celebrityName={owned.celebrity.name} issuedAt={stamp.issuedAt} points={stamp.points} compact/></li>)}</ul></div>:<BookOpen size={40} aria-hidden='true'/>}{r.error&&<FanAction onClick={r.retry}>{t.retry}</FanAction>}<FanAction variant="text" href={passportHref} trailingIcon={<ArrowRight/>}>{c.open}</FanAction></section>}{!compact&&<TodayTiles locale={locale} slug={slug} passportHref={passportHref} proofHref={group.data&&!(group.data.page.kind==='fan'&&group.data.page.slug===slug&&group.data.page.celebrityId)?`/pages/groups/${group.data.page.id}/missions?locale=${locale}`:`/${slug}?tab=certifications&locale=${locale}${returnParam?`&returnTo=${encodeURIComponent(returnParam)}`:""}`} onAttendance={()=>setAttendanceOpen(true)}/>}<section className={styles.creatorAsideGroup}><h2>{locale==='ko'?'팬 활동':t.activities}</h2><FanAction variant="text" href={`/${slug}?locale=${locale}`} onClick={event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.currentTarget.target||event.currentTarget.hasAttribute('download'))return;event.preventDefault();attendanceTrigger.current=event.currentTarget;setAttendanceOpen(true);}} leadingIcon={<Stamp/>} trailingIcon={<ArrowRight/>}>{locale==='ko'?'오늘의 출석':w.attendance}<AttendanceBadge locale={locale}/></FanAction><FanAction variant="text" href={passportHref} leadingIcon={<Medal/>} trailingIcon={<ArrowRight/>}>{managementMembersCopy(locale).tier}{owned?.passport&&<small>{owned.passport.tier}</small>}</FanAction></section><section className={styles.creatorAsideGroup}><h2>{locale==='ko'?'모은 포인트 사용하기':w.points}</h2><FanAction variant="text" href={`/benefits?locale=${locale}`} leadingIcon={<Heart/>} trailingIcon={<ArrowRight/>}>{locale==='ko'?'덕질에서 혜택·응원':t.events}</FanAction></section>{attendanceOpen&&(dukjil?.status==='on'?<CreatorAttendanceDialog pageName={celebrity?.name} reviewHref={passportHref} open onClose={closeAttendance}/>:<WalletAttendanceDialog locale={locale} open onClose={closeAttendance}/>)}</aside>;
}
