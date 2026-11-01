"use client";
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
export function CreatorGroupHomeAside({slug,locale,owned,passportId}:{slug:string;locale:AppLocale;owned?:MySummary['creators'][number];passportId?:string|null}){
 const t=groupsCopy(locale),c=creatorAsideCopy(locale),w=walletCopy(locale),group=useGroupResource(`/api/groups/resolve/${encodeURIComponent(slug)}`,parseGroup),r=useGroupResource(owned?.passport?`/api/passports/${owned.passport.id}?locale=${toContentLocale(locale)}&tierStages=1`:null,parse),community=useCommunityStamps(),records=community.state.status==='ready'?community.state.data.stamps.filter(stamp=>stamp.kind==='welcome'||['first_comment','daily_checkin'].includes(stamp.kind)&&stamp.celebritySlug===slug):[],milestones=['welcome','first_comment','daily_checkin'].flatMap(kind=>{const list=records.filter(stamp=>stamp.kind===kind).sort((a,b)=>b.issuedAt.localeCompare(a.issuedAt));return list[0]?[list[0]]:[];}),legacy=r.data?passportStampDisplay({...r.data,stamps:r.data.stamps.map(stamp=>({...stamp,points:r.data!.activities.find(item=>item.stampId===stamp.id)?.points}))}):{stamps:[],totalCount:0},passportHref=passportId?`/passports/${passportId}?locale=${locale}`:`/${slug}?locale=${locale}&tab=certifications`;
 return <aside className={styles.creatorHomeAside}><section className={styles.creatorPassportCard}>{owned?.passport&&r.data?<div className={styles.asidePassportBook}><PassportIdentityArtwork celebrity={owned.celebrity} level={owned.passport.tier} stamps={[]} totalCount={legacy.totalCount+milestones.length} locale={locale}/><ul className={styles.asidePassportStamps}>{milestones.map(stamp=><li key={stamp.id}><CommunityStampArtwork kind={stamp.kind} locale={locale} size={48} decorative/></li>)}{legacy.stamps.slice(0,Math.max(0,9-milestones.length)).map(stamp=><li key={stamp.id}><StampArtwork type={stamp.type} locale={locale} celebrityName={owned.celebrity.name} issuedAt={stamp.issuedAt} points={stamp.points} compact/></li>)}</ul></div>:<BookOpen size={40} aria-hidden='true'/>}<h2>{c.passport}</h2>{r.error&&<FanAction onClick={r.retry}>{t.retry}</FanAction>}<FanAction href={passportHref} trailingIcon={<BookOpen/>}>{c.open}</FanAction></section><FanAction href={`/my/wallet?view=attendance&locale=${locale}`} leadingIcon={<Stamp/>} trailingIcon={<ArrowRight/>}>{w.attendance}</FanAction><div className={styles.creatorAsideTiles}><FanAction href={passportHref} leadingIcon={<Medal/>}>{managementMembersCopy(locale).tier}{owned?.passport&&<small>{owned.passport.tier}</small>}</FanAction><FanAction href={`/${slug}?locale=${locale}&tab=events`} leadingIcon={<Ticket/>}>{raffleCopy(locale).title}</FanAction></div><FanAction href={`/my/wallet?view=support&creator=${encodeURIComponent(slug)}&locale=${locale}`} leadingIcon={<Heart/>} trailingIcon={<ArrowRight/>}>{c.hearts}</FanAction><FanAction href={`/my/capsules?locale=${locale}${group.data?'&pageId='+group.data.page.id:''}`} leadingIcon={<Gift/>} trailingIcon={<ArrowRight/>}>{capsuleCopy(locale).title}</FanAction></aside>;
}
