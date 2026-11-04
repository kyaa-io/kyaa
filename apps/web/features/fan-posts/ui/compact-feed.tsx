"use client";
import Link from 'next/link';
import type {Route} from 'next';
import {FileText} from 'lucide-react';
import type {AppLocale} from '@/i18n/locales';
import {boardCopy} from '@/features/groups/ui/board-copy';
import {managementCopy} from '@/features/groups/ui/management-copy';
import {creatorAsideCopy} from '@/features/groups/ui/creator-aside-copy';
import type {FeedItem} from '../domain/feed';
import {RelativeTime} from '@/components/relative-time';
import styles from './compact-feed.module.css';

const shortDate=(value:string,locale:AppLocale)=>new Date(value).toLocaleDateString(locale,{month:'2-digit',day:'2-digit'});
/** A notice kept outside the unified feed (the group's own board) that is listed above its rows with the same notice row. */
export type PinnedNotice={id:string;title:string;author:string;date:string;href:string;commentCount?:number};
type Props={items:FeedItem[];slug:string;locale:AppLocale;creatorName?:string;returnTo:string;onChanged:()=>void;officialPostLabel?:string;pinned?:PinnedNotice[]};
export function CompactFeed({items,slug,locale,creatorName,returnTo,onChanged,officialPostLabel,pinned=[]}:Props){
 const board=boardCopy(locale),head=creatorAsideCopy(locale),management=managementCopy(locale);
 return <div className={styles.table}><div className={styles.header} aria-hidden='true'><span>{management.title}</span><span>{head.author}</span><span>{head.date}</span><span>{board.like}</span></div><ul>{pinned.map(notice=><li key={`pinned:${notice.id}`} className={styles.notice}><Link className={styles.row} href={notice.href as Route}><span className={styles.title}><span className={styles.icon}><FileText size={18} aria-hidden='true'/></span><span className={styles.text}><strong>{board.notice} </strong>{notice.title}{(notice.commentCount??0)>0&&<span className={styles.commentCount}> ({notice.commentCount})</span>}</span></span><span><span className={styles.srOnly}>{head.author}: </span>{notice.author}</span><RelativeTime value={notice.date} locale={locale} absolute={shortDate}/><span><span className={styles.srOnly}>{board.like}: </span>—</span></Link></li>)}{items.map(item=>{
  const isNotice=item.kind==='notice',isCheer=item.kind==='cheer';
  const title=isNotice?item.title:item.kind==='chzzk'?item.text:item.body.split('\n')[0];
  const author=isNotice?'kyaa':item.kind==='chzzk'?creatorName??'':isCheer?item.nickname:item.author.nickname;
  const date=isNotice?item.publishedAt:item.kind==='chzzk'?item.date:item.createdAt;
  const count=isNotice||item.kind==='fan_post'?item.commentCount:isCheer?item.replyCount:0;
  const likes=item.kind==='fan_post'?item.likeCount:isCheer?item.clapCount:null;
  const href=isNotice?`/c/${slug}/notices/${item.slug}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`:item.kind==='fan_post'?`/c/${slug}/community/${item.id}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`:item.kind==='chzzk'?`/c/${slug}/updates/chzzk/${item.id}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`:`/c/${slug}/community/${item.id}?source=cheer&locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`;
  const row=<><span className={styles.title}><span className={styles.icon}><FileText size={18} aria-hidden='true'/></span><span className={styles.text}>{isNotice&&<strong>{board.notice} </strong>}{title}{count>0&&<span className={styles.commentCount}> ({count})</span>}</span></span><span><span className={styles.srOnly}>{head.author}: </span>{author}</span>{item.kind==='chzzk'?<time dateTime={date}>{shortDate(date,locale)}</time>:<RelativeTime value={date} locale={locale} absolute={shortDate}/>}<span><span className={styles.srOnly}>{board.like}: </span>{likes??'—'}</span></>;
  return <li id={isCheer?`cheer-row-${item.id}`:undefined} key={`${item.kind}:${item.id}`} className={isNotice?styles.notice:undefined}><Link className={styles.row} href={href as Route}>{row}</Link></li>;
 })}</ul></div>;
}
