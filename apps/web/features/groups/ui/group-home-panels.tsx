"use client";
import {CreatorAttendanceEntry} from "@/features/dukjil/ui/creator-attendance-entry";
import {useRef,useState} from 'react';
import {WalletAttendanceDialog} from '@/features/group-wallet/ui/wallet-screen';
import type {Route} from 'next';
import Link from 'next/link';
import {CalendarCheck,Coins,ArrowRight,Heart,Play} from 'lucide-react';
import {FanAction} from '@/components/fan-ui/fan-action';
import {FanSectionHeader} from '@/components/fan-ui/fan-heading';
import {FanSkeleton,FanSkeletonStatus} from '@/components/fan-ui/fan-skeleton';
import {galleryTitle,viewAllText} from '@/features/media/ui/gallery-copy';
import mediaStyles from '@/features/media/ui/creator-media-panel.module.css';
import {parseGroupPosts} from './group-board';
import {useOptionalGroupPage} from './group-page-context';
import type {AppLocale} from '@/i18n/locales';
import {groupEventsSchema} from '@/server/group-activities/domain';
import {walletCopy} from '@/features/group-wallet/ui/copy';
import {useGroupResource} from './use-group-resource';
import {GroupImage} from './group-image';
import {groupsCopy} from './copy';
import {groupHomeCopy} from './home-copy';
import {activityCardCopy} from './activity-card-copy';
import {type GroupPage} from '../domain/contracts';
import styles from './groups.module.css';
import homeStyles from './creator-group-home.module.css';
const parseEvents=(v:unknown)=>groupEventsSchema.parse(v);
export function GroupHomeInfo({page,locale}:{page:GroupPage;locale:AppLocale}){const c=groupHomeCopy(locale),ac=activityCardCopy[locale],w=walletCopy(locale),[attendanceOpen,setAttendanceOpen]=useState(false),attendanceTrigger=useRef<HTMLAnchorElement|null>(null);return <aside className={`${styles.homeInfo} ${homeStyles.infoAside}`}><section className={styles.sourceHomeCard}><h2>{ac.title}</h2><p>{ac.body}</p><FanAction href={`/pages/groups/${page.id}/missions?locale=${locale}`}>{ac.check}</FanAction></section><section><h2><CalendarCheck size={20} aria-hidden='true'/>{c.activity}</h2><FanAction href={`/my/wallet?locale=${locale}&view=attendance`} onClick={event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.currentTarget.target||event.currentTarget.hasAttribute('download'))return;event.preventDefault();attendanceTrigger.current=event.currentTarget;setAttendanceOpen(true);}} variant='text' leadingIcon={<CalendarCheck/>} trailingIcon={<ArrowRight/>}>{w.attendance}</FanAction><FanAction href={`/my/wallet?locale=${locale}`} variant='text' leadingIcon={<Coins/>} trailingIcon={<ArrowRight/>}>{w.wallet}</FanAction><FanAction href={`/benefits?locale=${locale}`} variant='text' leadingIcon={<Heart/>} trailingIcon={<ArrowRight/>}>{locale==='ko'?'덕질에서 혜택·응원':'Benefits and support'}</FanAction></section>{attendanceOpen&&(page.slug&&page.celebrityId?<CreatorAttendanceEntry slug={page.slug} pageName={page.name} locale={locale} reviewHref={`/${page.slug}?locale=${locale}&tab=certifications`} onClose={()=>{setAttendanceOpen(false);requestAnimationFrame(()=>attendanceTrigger.current?.focus());}}/>:<WalletAttendanceDialog locale={locale} open onClose={()=>{setAttendanceOpen(false);requestAnimationFrame(()=>attendanceTrigger.current?.focus());}}/>)}</aside>;}
export function GroupBrandHomeEvent({pageId,locale}:{pageId:string;locale:AppLocale}){const t=groupsCopy(locale),c=groupHomeCopy(locale),r=useGroupResource(`/api/groups/${pageId}/events`,parseEvents),event=r.data?.events[0];if(!event)return r.error?<section role='alert'><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></section>:r.loading?<FanSkeleton shape='block' width='100%' height={160}/>:null;return <section className={styles.brandEvent}><h2>{t.events}</h2><article>{event.imageUrl&&<GroupImage locale={locale} src={event.imageUrl} alt=''/>}<div><h3>{event.title}</h3><p>{event.description}</p><FanAction href={`/pages/groups/${pageId}/events/${event.id}?locale=${locale}`} trailingIcon={<ArrowRight/>}>{c.eventDetails}</FanAction></div></article></section>;}

/** 크리에이터가 연결되지 않은 모임·취미·브랜드의 갤러리. 공개 글에 올린 사진과 영상을 한 줄로 모은다. 없으면 구역을 그리지 않는다. */
export function GroupHomeGallery({pageId,locale}:{pageId:string;locale:AppLocale}){
 const g=useOptionalGroupPage(),r=useGroupResource(`/api/groups/${pageId}/posts?${new URLSearchParams({category:'all',search:'',sort:'recent',limit:'20'})}`,parseGroupPosts),[failed,setFailed]=useState<string[]>([]);
 const hrefOf=(extra:Record<string,string>):string=>g?String(g.hrefFor('board',extra)):`/pages/groups/${pageId}?${new URLSearchParams({locale,tab:'board',...extra})}`;
 const tiles=(r.data?.items??[]).filter(post=>post.visibility==='public').flatMap(post=>(post.assets??[]).map(asset=>({asset,post}))).filter(({asset})=>!failed.includes(asset.id)).slice(0,8);
 if(r.error||!r.loading&&!tiles.length)return null;
 const title=galleryTitle(locale);
 return <section className={mediaStyles.gallery} aria-label={title} aria-busy={r.loading||undefined}><div className={mediaStyles.previewHeading}><FanSectionHeader title={title} action={{label:viewAllText(locale),href:hrefOf({})}}/></div>{r.loading?<><ul className={mediaStyles.galleryRail} aria-hidden='true'>{[0,1,2,3].map(index=><li key={index}><FanSkeleton shape='block' width='100%' height='100%'/></li>)}</ul><FanSkeletonStatus locale={locale}/></>:<ul className={mediaStyles.galleryRail}>{tiles.map(({asset,post})=><li key={asset.id}><Link href={hrefOf({post:post.id}) as Route} scroll={false} aria-label={post.title}><img src={`/api/groups/media/${asset.id}?variant=thumbnail`} alt='' width={asset.width??240} height={asset.height??240} loading='lazy' decoding='async' onError={()=>setFailed(old=>[...old,asset.id])}/>{asset.kind==='video'&&<span className={mediaStyles.playIcon}><Play size={20} fill='currentColor' aria-hidden='true'/></span>}</Link></li>)}</ul>}</section>;
}
