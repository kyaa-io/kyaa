"use client";
import type {ReactNode} from 'react';
import {FanPostRow} from '@/components/fan-ui/fan-post-row';
import {FanSurface} from '@/components/fan-ui/fan-surface';
import type {AppLocale} from '@/i18n/locales';
import type {FeedItem} from '../domain/feed';
import styles from './compact-feed.module.css';
import {ProfileAuthor} from '@/features/group-social/profile-window';

/** A notice kept outside the unified feed (the group's own board) that is listed above its rows with the same notice row. */
export type PinnedNotice={id:string;title:string;author:string;date:string;href:string;commentCount?:number};
/** Only a public post's first photo is read directly; any other row keeps the post icon, never a broken-image mark. */
const thumbnailOf=(item:FeedItem)=>item.kind==='fan_post'?(item.visibility==='public'&&item.assets?.[0]?`/api/content-assets/${item.assets[0].id}?size=thumbnail`:null):item.kind==='chzzk'?item.images[0]?.url??null:null;
type Props={items:FeedItem[];slug:string;locale:AppLocale;creatorName?:string;returnTo:string;onChanged:()=>void;officialPostLabel?:string;pinned?:PinnedNotice[];pageImage?:ReactNode};
export function CompactFeed({items,slug,locale,creatorName,returnTo,pinned=[],pageImage}:Props){
 return <FanSurface as='div' appearance='list'><ul className={styles.table}>{pinned.map(notice=><li key={`pinned:${notice.id}`} data-notice=''><FanPostRow href={notice.href} locale={locale} title={notice.title} pageImage={pageImage} notice commentCount={notice.commentCount} author={notice.author} time={notice.date}/></li>)}{items.map(item=>{
  const isNotice=item.kind==='notice',isCheer=item.kind==='cheer';
  const title=isNotice?item.title:item.kind==='chzzk'?item.text:item.body.split('\n')[0];
  const author=isNotice?'kyaa':item.kind==='chzzk'?creatorName??'':isCheer?item.nickname:item.author.nickname;
  const authorNode=item.kind==='fan_post'?<ProfileAuthor contentRef={{kind:'fan_post',id:item.id}} nickname={item.author.nickname} avatarUrl={item.author.avatarUrl}>{author}</ProfileAuthor>:author;
  const date=isNotice?item.publishedAt:item.kind==='chzzk'?item.date:item.createdAt;
  const count=isNotice||item.kind==='fan_post'?item.commentCount:isCheer?item.replyCount:0;
  const likes=item.kind==='fan_post'?item.likeCount:isCheer?item.clapCount:undefined,views=item.kind==='fan_post'?item.viewCount:undefined;
  const href=isNotice?`/c/${slug}/notices/${item.slug}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`:item.kind==='fan_post'?`/c/${slug}/community/${item.id}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`:item.kind==='chzzk'?`/c/${slug}/updates/chzzk/${item.id}?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`:`/c/${slug}/community/${item.id}?source=cheer&locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`;
  return <li id={isCheer?`cheer-row-${item.id}`:undefined} key={`${item.kind}:${item.id}`} data-notice={isNotice?'':undefined}><FanPostRow href={href} locale={locale} title={title??''} thumbnail={thumbnailOf(item)} pageImage={pageImage} notice={isNotice} commentCount={count} author={authorNode} time={date} views={views} likes={likes}/></li>;
 })}</ul></FanSurface>;
}
