import type {ReactNode} from 'react';
import type {AppLocale} from '@/i18n/locales';
import {ArrowLeft,ArrowUpRight} from 'lucide-react';
import {FanAction} from '@/components/fan-ui/fan-action';
import {contentCopy} from '@/i18n/catalogs/features__fan_posts__ui';
import styles from './creator-video-detail.module.css';

export type CreatorVideoDetailProps={
 locale:AppLocale;
 title:string;
 source:string;
 originalHref:string;
 originalLabel:string;
 backHref:string;
 backLabel?:string;
 player:ReactNode;
 commentCount:number;
 comments:ReactNode;
 related?:ReactNode;
};
// Media providers have distinct read and comment contracts; callers retain their own player and comment state.
export function CreatorVideoDetail({locale,title,source,originalHref,originalLabel,backHref,backLabel,player,commentCount,comments,related}:CreatorVideoDetailProps){
 const copy=contentCopy(locale);
 return <article className={styles.detail}>
  <FanAction variant='text' href={backHref} leadingIcon={<ArrowLeft/>}>{backLabel??copy.back}</FanAction>
  <div className={styles.player}>{player}</div>
  <h1>{title}</h1>
  <div className={styles.source}><span>{source}</span><FanAction href={originalHref} variant='text' trailingIcon={<ArrowUpRight/>}>{originalLabel}</FanAction></div>
  <section className={styles.comments} aria-labelledby='creator-video-comments'><h2 id='creator-video-comments'>{copy.comments} {commentCount.toLocaleString(locale)}</h2>{comments}</section>
  {related&&<div className={styles.related}>{related}</div>}
 </article>;
}
