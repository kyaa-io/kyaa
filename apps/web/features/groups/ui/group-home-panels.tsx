"use client";
import type {Route} from 'next';
import Link from 'next/link';
import {ArrowRight,Play} from 'lucide-react';
import {useState} from 'react';
import {FanAction} from '@/components/fan-ui/fan-action';
import {FanSectionHeader} from '@/components/fan-ui/fan-heading';
import {galleryTitle,viewAllText} from '@/features/media/ui/gallery-copy';
import mediaStyles from '@/features/media/ui/creator-media-panel.module.css';
import {parseGroupPosts} from './group-board';
import {useOptionalGroupPage} from './group-page-context';
import type {AppLocale} from '@/i18n/locales';
import {groupEventsSchema} from '@/server/group-activities/domain';
import {useGroupResource} from './use-group-resource';
import {GroupImage} from './group-image';
import {groupsCopy} from './copy';
import {groupHomeCopy} from './home-copy';
import styles from './groups.module.css';
import homeStyles from './creator-group-home.module.css';
const parseEvents=(v:unknown)=>groupEventsSchema.parse(v);
export function GroupBrandHomeEvent({pageId,locale}:{pageId:string;locale:AppLocale}){const t=groupsCopy(locale),c=groupHomeCopy(locale),r=useGroupResource(`/api/groups/${pageId}/events`,parseEvents),event=r.data?.events[0];if(!event)return r.error?<section role='alert'><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></section>:null;return <section className={`${styles.brandEvent} ${homeStyles.brandEventFlush}`}><h2>{t.events}</h2><article>{event.imageUrl&&<GroupImage locale={locale} src={event.imageUrl} alt=''/>}<div><h3>{event.title}</h3><p>{event.description}</p><FanAction href={`/pages/groups/${pageId}/events/${event.id}?locale=${locale}`} trailingIcon={<ArrowRight/>}>{c.eventDetails}</FanAction></div></article></section>;}

/** 크리에이터가 연결되지 않은 모임·취미·브랜드의 갤러리. 공개 글에 올린 사진과 영상을 한 줄로 모은다. 없으면 구역을 그리지 않는다. */
export function GroupHomeGallery({pageId,locale}:{pageId:string;locale:AppLocale}){
 const g=useOptionalGroupPage(),r=useGroupResource(`/api/groups/${pageId}/posts?${new URLSearchParams({category:'all',search:'',sort:'recent',limit:'20'})}`,parseGroupPosts),[failed,setFailed]=useState<string[]>([]);
 const hrefOf=(extra:Record<string,string>):string=>g?String(g.hrefFor('board',extra)):`/pages/groups/${pageId}?${new URLSearchParams({locale,tab:'board',...extra})}`;
 const tiles=(r.data?.items??[]).filter(post=>post.visibility==='public').flatMap(post=>(post.assets??[]).map(asset=>({asset,post}))).filter(({asset})=>!failed.includes(asset.id)).slice(0,8);
 // 값이 없으면 사라지는 구역이라 골격을 그리지 않는다. 값이 온 뒤에만 구역이 생긴다.
 if(r.error||!tiles.length)return null;
 const title=galleryTitle(locale);
 return <section className={mediaStyles.gallery} aria-label={title}><div className={mediaStyles.previewHeading}><FanSectionHeader title={title} action={{label:viewAllText(locale),href:hrefOf({})}}/></div><ul className={mediaStyles.galleryRail}>{tiles.map(({asset,post})=><li key={asset.id}><Link href={hrefOf({post:post.id}) as Route} scroll={false} aria-label={post.title}><img src={`/api/groups/media/${asset.id}?variant=thumbnail`} alt='' width={asset.width??240} height={asset.height??240} loading='lazy' decoding='async' onError={()=>setFailed(old=>[...old,asset.id])}/>{asset.kind==='video'&&<span className={mediaStyles.playIcon}><Play size={20} fill='currentColor' aria-hidden='true'/></span>}</Link></li>)}</ul></section>;
}
