"use client";
import Link from 'next/link';
import {useState} from 'react';
import type {MySummary} from '@/features/my/domain/my-summary';
import {CreatorGroupHomeAside} from './creator-group-home-aside';
import {creatorAsideCopy} from './creator-aside-copy';
import {boardCopy} from './board-copy';
import {managementCopy} from './management-copy';
import type {Route} from 'next';
import {BookOpen,Stamp,MessageCircle,ArrowRight} from 'lucide-react';
import {FanAction} from '@/components/fan-ui/fan-action';
import type {AppLocale} from '@/i18n/locales';
import {toContentLocale} from '@/i18n/locales';
import type {PublishedCelebrity} from '@/server/content/content-domain';
import {CreatorMediaPanel} from '@/features/media/ui/creator-media-panel';
import {useCommunityResource} from '@/features/fanpage/ui/use-community-resource';
import {feedPageSchema,type FeedItem} from '@/features/fan-posts/domain/feed';
import {boardHref} from '@/features/fanpage/domain/board-navigation';
import {feedCopy} from '@/i18n/catalogs/features__fan_posts__feed';
import {walletCopy} from '@/features/group-wallet/ui/copy';
import {groupsCopy} from './copy';
import {groupHomeCopy,fanStories} from './home-copy';
import styles from './groups.module.css';
const parse=(v:unknown)=>feedPageSchema.parse(v);
export function CreatorGroupHome({celebrity,locale,channelId,passportId,owned}:{celebrity:PublishedCelebrity;locale:AppLocale;channelId:string|null;passportId?:string|null;owned?:MySummary['creators'][number]}){
 const t=groupsCopy(locale),c=groupHomeCopy(locale),w=walletCopy(locale),b=boardCopy(locale),m=managementCopy(locale),columns=creatorAsideCopy(locale),[filter,setFilter]=useState<'all'|'notice'|'fans'>('all'),query=new URLSearchParams({locale:toContentLocale(locale),source:filter==='notice'?'official':filter});if(filter==='notice')query.set('news','notice');
 const feed=useCommunityResource(`/api/celebrities/${encodeURIComponent(celebrity.slug)}/feed?${query}`,parse),returnTo=boardHref(celebrity.slug,locale);
 const itemView=(item:FeedItem)=>{
  if(item.kind==='fan_post')return {title:item.body.split('\n')[0],name:item.author.nickname,date:item.createdAt,count:item.commentCount,likes:item.likeCount??0,href:`/c/${celebrity.slug}/community/${item.id}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`};
  if(item.kind==='notice')return {title:item.title,name:'kyaa',date:item.publishedAt,count:item.commentCount,likes:item.likeCount??0,href:`/c/${celebrity.slug}/notices/${item.slug}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`};
  if(item.kind==='chzzk')return {title:item.text,name:celebrity.name,date:item.date,count:0,likes:null,href:`/c/${celebrity.slug}/updates/chzzk/${item.id}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`};
  return {title:item.body.split('\n')[0],name:item.nickname,date:item.createdAt,count:item.replyCount,likes:item.clapCount,href:returnTo};
 };
 return <div className={styles.creatorHomeLayout}><div className={styles.creatorHomeMain}><CreatorMediaPanel slug={celebrity.slug} locale={locale} channelId={channelId} socialLinks={celebrity.socialLinks} preview/><nav className={styles.creatorShortcuts} aria-label={c.activity}><FanAction href={`/my/wallet?view=attendance&locale=${locale}`} leadingIcon={<Stamp/>}>{c.stamps}</FanAction><FanAction href={passportId?`/passports/${passportId}?locale=${locale}`:`/${celebrity.slug}?locale=${locale}&tab=certifications`} leadingIcon={<BookOpen/>}>{w.passport}</FanAction></nav><section className={styles.creatorStories}><header className={styles.creatorStoriesHeader}><h2><MessageCircle size={24} aria-hidden='true'/>{fanStories[locale]}</h2><FanAction href={returnTo} variant='text' trailingIcon={<ArrowRight/>}>{t.more}</FanAction></header><div className={styles.creatorBoardToolbar}><div className={styles.filters}>{(['all','notice','fans'] as const).map(value=><button type='button' className={styles.chip} key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{value==='all'?t.all:value==='notice'?b.notice:b.free}</button>)}</div><FanAction href={boardHref(celebrity.slug,locale,{source:'fans'})} trailingIcon={<ArrowRight/>}>{m.write}</FanAction></div>{feed.state.status==='ready'?<><div className={styles.creatorDesktopBoard}><table><thead><tr>{[m.title,columns.author,columns.date,b.views,b.like].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{feed.state.data.items.slice(0,4).map(item=>{const row=itemView(item);return <tr key={`${item.kind}:${item.id}`}><td><Link href={row.href as Route}><strong translate='no'>{row.title||feedCopy(locale).readPost}{row.count?` (${row.count})`:''}</strong></Link></td><td>{row.name}</td><td><time dateTime={row.date}>{new Date(row.date).toLocaleDateString(locale,{month:'2-digit',day:'2-digit'})}</time></td><td>—</td><td>{row.likes===null?'—':row.likes.toLocaleString(locale)}</td></tr>;})}</tbody></table></div><div className={styles.creatorMobileStories}>{feed.state.data.items.slice(0,3).map(item=>{const row=itemView(item);return <Link className={styles.creatorStory} key={`${item.kind}:${item.id}`} href={row.href as Route}><strong translate='no'>{row.title||feedCopy(locale).readPost}{row.count?` (${row.count})`:''}</strong><span>{row.name} · <time dateTime={row.date}>{new Date(row.date).toLocaleDateString(locale,{month:'short',day:'numeric'})}</time></span></Link>;})}</div>{!feed.state.data.items.length&&<p>{t.empty}</p>}</>:feed.state.status==='error'?<div role='alert'><p>{t.error}</p><FanAction onClick={feed.retry}>{t.retry}</FanAction></div>:<p role='status'>{t.loading}</p>}<FanAction className={styles.creatorBoardAll} href={returnTo} fullWidth trailingIcon={<ArrowRight/>}>{c.boardAll}</FanAction></section></div><CreatorGroupHomeAside slug={celebrity.slug} locale={locale} passportId={passportId} owned={owned}/></div>;

}

export function CreatorBrandNewsPreview({slug,locale}:{slug:string;locale:AppLocale}){const t=groupsCopy(locale),r=useCommunityResource(`/api/celebrities/${encodeURIComponent(slug)}/feed?locale=${toContentLocale(locale)}&source=official`,parse);return <section className={styles.brandCreatorNews}><h2>{t.news}</h2>{r.state.status==='ready'?r.state.data.items.slice(0,2).map(item=>{const href=item.kind==='notice'?`/c/${slug}/notices/${item.slug}?locale=${locale}`:item.kind==='chzzk'?`/c/${slug}/updates/chzzk/${item.id}?locale=${locale}`:boardHref(slug,locale,{source:'official'}),title=item.kind==='notice'?item.title:item.kind==='chzzk'?item.text:item.body;return <Link key={item.id} href={href as Route}><strong translate='no'>{title}</strong><ArrowRight size={16} aria-hidden='true'/></Link>;}):r.state.status==='error'?<div role='alert'><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></div>:<p role='status'>{t.loading}</p>}</section>;}
