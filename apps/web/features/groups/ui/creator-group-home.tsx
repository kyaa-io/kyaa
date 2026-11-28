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
import {noPostsText,viewAllText} from '@/features/media/ui/gallery-copy';
import {useOptionalGroupPage} from './group-page-context';
import {useCompactHeader} from './group-page-menu';
import {useRef,useState} from 'react';
import dynamic from 'next/dynamic';
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
import {EventLikeCard} from '@/features/reaction/ui/event-like-card';
import styles from './groups.module.css';
import homeStyles from './creator-group-home.module.css';
// 브랜드 페이지에만 있는 행사 칸. 그 안의 게시판 글 렌더러(Tiptap)를 팬페이지 홈 묶음에 넣지 않는다.
const GroupBrandHomeEvent=dynamic(()=>import('./group-home-panels').then(module=>module.GroupBrandHomeEvent));
const parse=(v:unknown)=>feedPageSchema.parse(v);
/** 첫 사진. 공개 글만 바로 읽을 수 있고, 그 밖의 글은 글 아이콘 칸을 둔다. */
export function CreatorGroupHome({celebrity,locale,channelId,passportId,owned,onVideoSelect,schedule}:{celebrity:PublishedCelebrity;locale:AppLocale;channelId:string|null;passportId?:string|null;owned?:MySummary['creators'][number];onVideoSelect?:(media:CreatorMediaSelection)=>void;schedule?:{label:string;note:string}}){
 const returnParam=useSearchParams()?.get('returnTo');
 const [attendanceOpen,setAttendanceOpen]=useState(false);
 const attendanceTrigger=useRef<HTMLElement|null>(null);
 const compact=useCompactHeader();
 const frame=useOptionalGroupPage(),groupPage=frame?.detail?.page,brand=celebrity.roles.includes('brand');
 const proofHref=groupPage&&!(groupPage.kind==='fan'&&groupPage.slug===celebrity.slug&&groupPage.celebrityId)?`/pages/groups/${groupPage.id}/missions?locale=${locale}`:`/${celebrity.slug}?tab=certifications&locale=${locale}${returnParam?`&returnTo=${encodeURIComponent(returnParam)}`:""}`,passportHref=passportId?`/passports/${passportId}?locale=${locale}`:`/${celebrity.slug}?locale=${locale}&tab=certifications`;
 const t=groupsCopy(locale),c=groupHomeCopy(locale),w=walletCopy(locale),b=boardCopy(locale),m=managementCopy(locale),[filter,setFilter]=useState<'all'|'notice'|'fans'>('all'),[cursors,setCursors]=useState<Array<readonly [string|null,string|null]>>([]),[search,setSearch]=useState('');
 // 한 쪽은 10개다. '전체'는 공식 글(공지·아티스트 소식) 최신 5개와 팬 글 최신 5개를 따로 읽고, 한쪽이 모자라도 다른 쪽으로 채우지 않는다(대표 11/17 00:29).
 // 다음 쪽도 각자 이어지는 5개씩이고, 먼저 끝난 쪽은 더 읽지 않는다.
 const page=cursors[cursors.length-1];
 const feedUrl=(lane:0|1)=>{
  if((filter!=='all'&&lane===1)||(page&&!page[lane]))return null;
  const notices=filter==='notice'||(filter==='all'&&lane===0);
  const limit=filter!=='all'?10:notices?3:7;
  const query=new URLSearchParams({locale:toContentLocale(locale),source:notices?'official':'fans',limit:String(limit)});
  if(notices)query.set('news','notice');
  if(search)query.set('q',search);
  if(page?.[lane])query.set('cursor',page[lane]!);
  return `/api/celebrities/${encodeURIComponent(celebrity.slug)}/feed?${query}`;
 };
 const urls=[feedUrl(0),feedUrl(1)] as const,lanes=[useCommunityResource(urls[0],parse,true,false,false,true),useCommunityResource(urls[1],parse,true,false,false,true)] as const,returnTo=boardHref(celebrity.slug,locale);
 const states=lanes.map((lane,index)=>urls[index]?lane.state:{status:'ready' as const,data:{items:[] as FeedItem[],nextCursor:null}}),failed=states.some(state=>state.status==='error');
 const feed=states[0]!.status==='ready'&&states[1]!.status==='ready'?{items:[...states[0]!.data.items,...states[1]!.data.items],next:[states[0]!.data.nextCursor,states[1]!.data.nextCursor] as const}:null,hasNext=Boolean(feed&&(feed.next[0]||feed.next[1]));
 // 공식 글은 바로 온다. 팬 글을 기다리는 동안 공식 글을 먼저 그리고 팬 글 자리만 골격으로 둔다. 순서는 다 온 뒤와 같다(공식 다음 팬).
 const officialFirst=!feed&&!failed&&states[0]!.status==='ready'&&states[0]!.data.items.length>0?states[0]!.data.items:null;
 const previous=()=>setCursors(cursors.slice(0,-1)),next=()=>{if(feed&&hasNext)setCursors([...cursors,feed.next]);};
 const itemView=(item:FeedItem)=>{
  if(item.kind==='fan_post')return {title:item.body.split('\n')[0],name:item.author.nickname,artist:item.artist,date:item.createdAt,count:item.commentCount,href:`/c/${celebrity.slug}/community/${item.id}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`};
  if(item.kind==='notice')return {title:item.title,name:'kyaa',date:item.publishedAt,count:item.commentCount,href:`/c/${celebrity.slug}/notices/${item.slug}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`};
  if(item.kind==='chzzk')return {title:item.text,name:celebrity.name,date:item.date,count:0,href:`/c/${celebrity.slug}/updates/chzzk/${item.id}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`};
  return {title:item.body.split('\n')[0],name:item.nickname,artist:item.artist,date:item.createdAt,count:item.replyCount,href:`/c/${celebrity.slug}/community/${item.id}?source=cheer&locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`};
 };
 const rowPageImage=fanPostPageImage({slug:celebrity.slug,src:celebrity.image.url,photos:celebrity.image.photos,position:celebrity.image.position});
 const postRows=(items:FeedItem[])=><FanSurface as='div' appearance='list' className={homeStyles.rows}>{[...items.filter(item=>item.kind==='notice'),...items.filter(item=>item.kind!=='notice')].map(item=>{const row=itemView(item);return <FanPostRow key={`${item.kind}:${item.id}`} href={row.href} locale={locale} title={row.title||feedCopy(locale).readPost} avatar={item.kind==='fan_post'?item.author.avatarUrl:item.kind==='cheer'?item.avatarUrl:undefined} avatarArtist={'artist' in row&&row.artist} pageImage={rowPageImage} notice={item.kind==='notice'} commentCount={row.count} likes={item.kind==='notice'?item.likeCount:undefined} views={item.kind==='notice'?item.viewCount:undefined} author={row.name} authorTier={item.kind === "fan_post" ? item.author.tier : undefined} authorArtist={'artist' in row&&row.artist} reactedBy={item.kind==='fan_post'&&item.artistReacted?celebrity.name:undefined} time={row.date} density='home'/>;})}</FanSurface>;
 const composeHref=String(boardHref(celebrity.slug,locale,{source:'fans',compose:true}));
 const writeHref:string=frame&&frame.ready&&!frame.authenticated?fanLoginHref(locale,composeHref):composeHref;
 const filters:FanTabItem[]=(['all','notice','fans'] as const).map(value=>({key:value,label:value==='all'?t.all:value==='notice'?b.notice:b.free,onSelect:()=>{setCursors([]);setFilter(value);}}));
 const shortcuts = <nav className={styles.creatorShortcuts} aria-label={c.activity}><CheckinCorner locale={locale}><FanAction href={`/my/wallet?view=attendance&locale=${locale}`} onClick={event=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.currentTarget.target||event.currentTarget.hasAttribute('download'))return;event.preventDefault();attendanceTrigger.current=event.currentTarget;setAttendanceOpen(true);}} leadingIcon={<span className={styles.shortcutStamp} data-art="stamp"/>}>{c.stamps}</FanAction></CheckinCorner><FanAction href={passportHref} leadingIcon={<BookOpen/>}>{w.passport}</FanAction></nav>;
 return <DukjilProvider slug={celebrity.slug} locale={locale}><div className={styles.creatorHomeLayout}><div className={`${styles.creatorHomeMain} ${homeStyles.main}`}>
  <EventLikeCard slug={celebrity.slug} locale={locale}/>
  {brand&&groupPage&&<GroupBrandHomeEvent pageId={groupPage.id} locale={locale}/>}
  <CreatorMediaPanel onVideoSelect={onVideoSelect} slug={celebrity.slug} locale={locale} channelId={channelId} socialLinks={celebrity.socialLinks} preview/>
  {!brand&&<BannerSlot slot='fanpage_below_gallery' locale={locale}/>}
  <section className={homeStyles.stories}>
   <header className={homeStyles.storiesHeader}><FanHeading>{fanStories[locale]}</FanHeading><FanSectionLink href={returnTo}>{viewAllText(locale)}</FanSectionLink></header>
   <div className={homeStyles.toolbar}><FanTabs variant='chip' label={fanStories[locale]} current={filter} items={filters}/><EarnBadgeCorner action='post' locale={locale}><FanAction href={writeHref} variant='primary' trailingIcon={<Pencil/>}>{m.write}</FanAction></EarnBadgeCorner></div>
   {feed?<>{feed.items.length?postRows(feed.items):<FanState inline compact kind='empty' title={noPostsText(locale)}/>}{(feed.items.length>0||cursors.length>0||hasNext)&&<nav className={styles.creatorPagination} aria-label={t.more}><button type='button' aria-label={locale==='ko'?'이전 페이지':'Previous page'} disabled={!cursors.length} onClick={previous}><ChevronLeft size={18}/></button><button type='button' disabled={!cursors.length} onClick={previous}>{cursors.length||1}</button><span aria-current='page'>{cursors.length+1}</span>{hasNext&&<button type='button' onClick={next}>{cursors.length+2}</button>}<button type='button' aria-label={locale==='ko'?'다음 페이지':'Next page'} disabled={!hasNext} onClick={next}><ChevronRight size={18}/></button></nav>}</>:failed?<FanState inline compact kind='error' title={t.error} actions={<FanAction variant='text' onClick={()=>lanes.forEach(lane=>lane.retry())}>{t.retry}</FanAction>}/>:officialFirst?<>{postRows(officialFirst)}<FanSkeletonRows rows={5} variant='post'/></>:<FanSkeletonRows rows={5} variant='post'/>}
   <CreatorBoardFooter searchLabel={t.search} onSearch={value=>{setCursors([]);setSearch(value.normalize('NFC'));}}/>
  </section>
  {!brand&&<BannerSlot slot='fanpage_second' locale={locale}/>}
  <div className={styles.mobileParticipation}>{compact&&<><JjinfanGauge slug={celebrity.slug} locale={locale}/><FanMissions preview={3} locale={locale} slug={celebrity.slug} title={locale==='ko'?'팬 활동':t.activities} passportHref={passportHref} proofHref={proofHref} onAttendance={trigger=>{attendanceTrigger.current=trigger;setAttendanceOpen(true);}}/></>}<CreatorScheduleCard celebrity={celebrity} locale={locale} schedule={schedule}/></div>
  {(compact || brand) && shortcuts}
 </div>{attendanceOpen&&<CreatorAttendanceEntry slug={celebrity.slug} pageName={celebrity.name} locale={locale} reviewHref={`/c/${encodeURIComponent(celebrity.slug)}/verify?locale=${locale}`} onClose={()=>{setAttendanceOpen(false);requestAnimationFrame(()=>attendanceTrigger.current?.focus());}}/>}<CreatorGroupHomeAside shortcuts={!compact && !brand ? shortcuts : undefined} celebrity={celebrity} schedule={schedule} slug={celebrity.slug} locale={locale} passportId={passportId} owned={owned}/></div></DukjilProvider>;
}

export function CreatorBrandNewsPreview({slug,locale}:{slug:string;locale:AppLocale}){const t=groupsCopy(locale),r=useCommunityResource(`/api/celebrities/${encodeURIComponent(slug)}/feed?locale=${toContentLocale(locale)}&source=official`,parse);return <section className={styles.brandCreatorNews}><h2>{t.news}</h2>{r.state.status==='ready'?r.state.data.items.slice(0,2).map(item=>{const href=item.kind==='notice'?`/c/${slug}/notices/${item.slug}?locale=${locale}`:item.kind==='chzzk'?`/c/${slug}/updates/chzzk/${item.id}?locale=${locale}`:boardHref(slug,locale,{source:'official'}),title=item.kind==='notice'?item.title:item.kind==='chzzk'?item.text:item.body;return <Link key={item.id} href={href as Route}><strong translate='no'>{title}</strong><ArrowRight size={16} aria-hidden='true'/></Link>;}):r.state.status==='error'?<div role='alert'><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></div>:<FanSkeletonRows rows={2} variant='plain'/>}</section>;}
