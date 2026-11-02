"use client";
import type { AppLocale } from '@/i18n/locales';
import type { PublishedCelebrity } from '@/server/content/content-domain';
import { FanSiteFooter } from '@/components/fan-shell/fan-site-footer';
import { FanPostDetail,type BoardDetailPreview } from '@/features/fan-posts/ui/fan-post-detail';
import { CreatorGroupHeader } from './creator-group-header';
import { CreatorBoardAside,type CreatorBoardEvent } from './creator-board-aside';
import { GroupShell } from './group-shell';
import styles from './groups.module.css';

export function CreatorGroupPostPage({celebrity,postId,locale,boardEvent,boardPreview}:{celebrity:PublishedCelebrity;postId:string;locale:AppLocale;boardEvent?:CreatorBoardEvent;boardPreview?:BoardDetailPreview}) {
 return <><GroupShell locale={locale}><CreatorGroupHeader celebrity={celebrity} locale={locale} tab="board"/><div className={styles.creatorPostLayout}><FanPostDetail postId={postId} locale={locale} presentation="board" boardPreview={boardPreview}/><CreatorBoardAside event={boardEvent} slug={celebrity.slug} locale={locale}/></div></GroupShell><FanSiteFooter locale={locale}/></>;
}
