"use client";
import {DukjilProvider} from "@/features/dukjil/ui/dukjil-provider";
import {CreatorAttendanceEntry} from "@/features/dukjil/ui/creator-attendance-entry";
import {useSearchParams} from "next/navigation";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import {FanPostRow} from '@/components/fan-ui/fan-post-row';
import {FanSurface} from '@/components/fan-ui/fan-surface';
import {fanPostPageImage} from '@/components/fan-ui/fan-post-page-image';
import {FanSkeletonRows} from '@/components/fan-ui/fan-skeleton';
import {FanState} from '@/components/fan-ui/fan-state';
import {FanTabs,type FanTabItem} from '@/components/fan-ui/fan-tabs';
import {fanLoginHref} from '@/components/login-href';
import {EarnBadgeCorner} from '@/features/dukjil/ui/earn-badge';
import {CheckinCorner} from '@/features/dukjil/ui/checkin-corner';
import {FanMissions} from '@/features/dukjil/ui/fan-missions';
import {JjinfanGauge} from '@/features/rankings/ui/jjinfan-gauge';
import {GroupBrandHomeEvent} from './group-home-panels';
import {noPostsText,viewAllText} from '@/features/media/ui/gallery-copy';
import {useOptionalGroupPage} from './group-page-context';
import {useCompactHeader} from './group-page-menu';
import {useRef,useState} from 'react';
import type {MySummary} from '@/features/my/domain/my-summary';
import {CreatorBoardFooter} from './creator-board-footer';
import {CreatorScheduleCard} from './creator-schedule-card';
import {CreatorGroupHomeAside} from './creator-group-home-aside';
import {boardCopy} from './board-copy';
import {managementCopy} from './management-copy';
import type {Route} from 'next';
import {BookOpen,Pencil,ArrowRight,ChevronLeft,ChevronRight} from 'lucide-react';
// The section 전체 보기 arrow is the shared FanSectionHeader one (갤러리 above uses it), not lucide's heavier arrow.
import {FanAction} from '@/components/fan-ui/fan-action';
import {FanHeading} from '@/components/fan-ui/fan-heading';
import { FanSectionLink } from "@/components/fan-ui/fan-section-link";
import type {AppLocale} from '@/i18n/locales';
import {toContentLocale} from '@/i18n/locales';
import type {PublishedCelebrity} from '@/server/content/content-domain';
import {CreatorMediaPanel,type CreatorMediaSelection} from '@/features/media/ui/creator-media-panel';
import {useCommunityResource} from '@/features/fanpage/ui/use-community-resource';
import {feedPageSchema,type FeedItem} from '@/features/fan-posts/domain/feed';
import {boardHref} from '@/features/fanpage/domain/board-navigation';
import {feedCopy} from '@/i18n/catalogs/features__fan_posts__feed';
import {walletCopy} from '@/features/group-wallet/ui/copy';
import {groupsCopy} from './copy';
import {groupHomeCopy,fanStories} from './home-copy';
import {BannerSlot} from '@/components/banner-slot/banner-slot';
import styles from './groups.module.css';
import homeStyles from './creator-group-home.module.css';
const parse=(v:unknown)=>feedPageSchema.parse(v);
/** 첫 사진. 공개 글만 바로 읽을 수 있고, 그 밖의 글은 글 아이콘 칸을 둔다. */
const thumbnailOf=(item:FeedItem)=>item.kind==='fan_post'?(item.visibility==='public'&&item.assets?.[0]?`/api/content-assets/${item.assets[0].id}?size=thumbnail`:null):item.kind==='chzzk'?item.images[0]?.url??null:null;
export function CreatorGroupHome({celebrity,locale,channelId,passportId,owned,onVideoSelect,schedule}:{celebrity:PublishedCelebrity;locale:AppLocale;channelId:string|null;passportId?:string|null;owned?:MySummary['creators'][number];onVideoSelect?:(media:CreatorMediaSelection)=>void;schedule?:{label:string;note:string}}){
 const returnParam=useSearchParams()?.get('returnTo');
 const [attendanceOpen,setAttendanceOpen]=useState(false);
 const attendanceTrigger=useRef<HTMLElement|null>(null);
 const compact=useCompactHeader();
 const frame=useOptionalGroupPage(),groupPage=frame?.detail?.page,brand=celebrity.roles.includes('brand');
 const proofHref=groupPage&&!(groupPage.kind==='fan'&&groupPage.slug===celebrity.slug&&groupPage.celebrityId)?`/pages/groups/${groupPage.id}/missions?locale=${locale}`:`/${celebrity.slug}?tab=certifications&locale=${locale}${returnParam?`&returnTo=${encodeURIComponent(returnParam)}`:""}`,passportHref=passportId?`/passports/${passportId}?locale=${locale}`:`/${celebrity.slug}?locale=${locale}&tab=certifications`;
 const t=groupsCopy(locale),c=groupHomeCopy(locale),w=walletCopy(locale),b=boardCopy(locale),m=managementCopy(locale),[filter,setFilter]=useState<'all'|'notice'|'fans'>('all'),[cursors,setCursors]=useState<string[]>([]),[search,setSearch]=useState(''),query=new URLSearchParams({locale:toContentLocale(locale),source:filter==='notice'?'official':filter,limit:'20'});if(filter==='notice')query.set('news','notice');if(search)query.set('q',search);if(cursors.length)query.set('cursor',cursors[cursors.length-1]!);
 const feed=useCommunityResource(`/api/celebrities/${encodeURIComponent(celebrity.slug)}/feed?${query}`,parse,true,false,false,true),returnTo=boardHref(celebrity.slug,locale);
 const itemView=(item:FeedItem)=>{
  if(item.kind==='fan_post')return {title:item.body.split('\n')[0],name:item.author.nickname,artist:item.artist,date:item.createdAt,count:item.commentCount,href:`/c/${celebrity.slug}/community/${item.id}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`};
  if(item.kind==='notice')return {title:item.title,name:'kyaa',date:item.publishedAt,count:item.commentCount,href:`/c/${celebrity.slug}/notices/${item.slug}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`};
  if(item.kind==='chzzk')return {title:item.text,name:celebrity.name,date:item.date,count:0,href:`/c/${celebrity.slug}/updates/chzzk/${item.id}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`};
  return {title:item.body.split('\n')[0],name:item.nickname,artist:item.artist,date:item.createdAt,count:item.replyCount,href:`/c/${celebrity.slug}/community/${item.id}?source=cheer&locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`};
 };
 const rowPageImage=fanPostPageImage({slug:celebrity.slug,src:celebrity.image.url,photos:celebrity.image.photos,position:celebrity.image.position});
 const composeHref=String(boardHref(celebrity.slug,locale,{source:'fans',compose:true}));
 const writeHref:string=frame&&frame.ready&&!frame.authenticated?fanLoginHref(locale,composeHref):composeHref;
 const filters:FanTabItem[]=(['all','notice','fans'] as const).map(value=>({key:value,label:value==='all'?t.all:value==='notice'?b.notice:b.free,onSelect:()=>{setCursors([]);setFilter(value);}}));
 return <DukjilProvider slug={celebrity.slug} locale={locale}><div className={styles.creatorHomeLayout}><div className={`${styles.creatorHomeMain} ${homeStyles.main}`}>
  {brand&&groupPage&&<GroupBrandHomeEvent pageId={groupPage.id} locale={locale}/>}
  <CreatorMediaPanel onVideoSelect={onVideoSelect} slug={celebrity.slug} locale={locale} channelId={channelId} socialLinks={celebrity.socialLinks} preview/>
  {!brand&&<BannerSlot slot='fanpage_below_gallery' locale={locale}/>}
  <section className={homeStyles.stories}>
   <header className={homeStyles.storiesHeader}><FanHeading>{fanStories[locale]}</FanHeading><FanSectionLink href={returnTo}>{viewAllText(locale)}</FanSectionLink></header>
   <div className={homeStyles.toolbar}><FanTabs variant='chip' label={fanStories[locale]} current={filter} items={filters}/><EarnBadgeCorner action='post' locale={locale}><FanAction href={writeHref} variant='primary' trailingIcon={<Pencil/>}>{m.write}</FanAction></EarnBadgeCorner></div>
   {feed.state.status==='ready'?<>{feed.state.data.items.length?<FanSurface as='div' appearance='list' className={homeStyles.rows}>{[...feed.state.data.items.filter(item=>item.kind==='notice'),...feed.state.data.items.filter(item=>item.kind!=='notice')].slice(0,20).map(item=>{const row=itemView(item);return <FanPostRow key={`${item.kind}:${item.id}`} href={row.href} locale={locale} title={row.title||feedCopy(locale).readPost} thumbnail={thumbnailOf(item)} pageImage={rowPageImage} notice={item.kind==='notice'} commentCount={row.count} author={row.name} authorArtist={'artist' in row&&row.artist} time={row.date} density='home'/>;})}</FanSurface>:<FanState inline compact kind='empty' title={noPostsText(locale)}/>}{(feed.state.data.items.length>0||cursors.length>0||feed.state.data.nextCursor)&&<nav className={styles.creatorPagination} aria-label={t.more}><button type='button' aria-label={locale==='ko'?'이전 페이지':'Previous page'} disabled={!cursors.length} onClick={()=>setCursors(cursors.slice(0,-1))}><ChevronLeft size={18}/></button><button type='button' disabled={!cursors.length} onClick={()=>setCursors(cursors.slice(0,-1))}>{cursors.length||1}</button><span aria-current='page'>{cursors.length+1}</span>{feed.state.data.nextCursor&&<button type='button' onClick={()=>setCursors([...cursors,feed.state.status==='ready'?feed.state.data.nextCursor!: ''])}>{cursors.length+2}</button>}<button type='button' aria-label={locale==='ko'?'다음 페이지':'Next page'} disabled={!feed.state.data.nextCursor} onClick={()=>{if(feed.state.status==='ready'&&feed.state.data.nextCursor)setCursors([...cursors,feed.state.data.nextCursor]);}}><ChevronRight size={18}/></button></nav>}</>:feed.state.status==='error'?<FanState inline compact kind='error' title={t.error} actions={<FanAction variant='text' onClick={feed.retry}>{t.retry}</FanAction>}/>:<FanSkeletonRows rows={5} variant='post'/>}
   <CreatorBoardFooter searchLabel={t.search} onSearch={value=>{setCursors([]);setSearch(value.normalize('NFC'));}}/>
  </section>
  {!brand&&<BannerSlot slot='fanpage_second' locale={locale}/>}
  <div className={styles.mobileParticipation}>{compact&&<><JjinfanGauge slug={celebrity.slug} locale={locale}/><FanMissions locale={locale} slug={celebrity.slug} title={locale==='ko'?'팬 활동':t.activities} passportHref={passportHref} proofHref={proofHref} onAttendance={trigger=>{attendanceTrigger.current=trigger;setAttendanceOpen(true);}}/></>}<CreatorScheduleCard celebrity={celebrity} locale={locale} schedule={schedule}/></div>
  <nav className={styles.creatorShortcuts} aria-label={c.activity}><CheckinCorner locale={locale}><FanAction href={`/my/wallet?view=attendance&locale=${locale}`} onClick={event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.currentTarget.target||event.currentTarget.hasAttribute('download'))return;event.preventDefault();attendanceTrigger.current=event.currentTarget;setAttendanceOpen(true);}} leadingIcon={<span className={styles.shortcutStamp} data-art="stamp"/>}>{c.stamps}</FanAction></CheckinCorner><FanAction href={passportHref} leadingIcon={<BookOpen/>}>{w.passport}</FanAction></nav>
 </div>{attendanceOpen&&<CreatorAttendanceEntry slug={celebrity.slug} pageName={celebrity.name} locale={locale} reviewHref={`/c/${encodeURIComponent(celebrity.slug)}/verify?locale=${locale}`} onClose={()=>{setAttendanceOpen(false);requestAnimationFrame(()=>attendanceTrigger.current?.focus());}}/>}<CreatorGroupHomeAside celebrity={celebrity} schedule={schedule} slug={celebrity.slug} locale={locale} passportId={passportId} owned={owned}/></div></DukjilProvider>;
}

export function CreatorBrandNewsPreview({slug,locale}:{slug:string;locale:AppLocale}){const t=groupsCopy(locale),r=useCommunityResource(`/api/celebrities/${encodeURIComponent(slug)}/feed?locale=${toContentLocale(locale)}&source=official`,parse);return <section className={styles.brandCreatorNews}><h2>{t.news}</h2>{r.state.status==='ready'?r.state.data.items.slice(0,2).map(item=>{const href=item.kind==='notice'?`/c/${slug}/notices/${item.slug}?locale=${locale}`:item.kind==='chzzk'?`/c/${slug}/updates/chzzk/${item.id}?locale=${locale}`:boardHref(slug,locale,{source:'official'}),title=item.kind==='notice'?item.title:item.kind==='chzzk'?item.text:item.body;return <Link key={item.id} href={href as Route}><strong translate='no'>{title}</strong><ArrowRight size={16} aria-hidden='true'/></Link>;}):r.state.status==='error'?<div role='alert'><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></div>:<FanSkeletonRows rows={2} variant='plain'/>}</section>;}
