"use client";
import {DukjilProvider} from "@/features/dukjil/ui/dukjil-provider";
import type { AppLocale } from '@/i18n/locales';
import type { PublishedCelebrity } from '@/server/content/content-domain';
import { FanSiteFooter } from '@/components/fan-shell/fan-site-footer';
import { FanPostDetail } from '@/features/fan-posts/ui/fan-post-detail';
import { CreatorGroupHeader } from './creator-group-header';
import { CreatorBoardAside,type CreatorBoardEvent } from './creator-board-aside';
import { GroupShell } from './group-shell';
import styles from './groups.module.css';

export function CreatorGroupPostPage({celebrity,postId,locale,boardEvent}:{celebrity:PublishedCelebrity;postId:string;locale:AppLocale;boardEvent?:CreatorBoardEvent}) {
 return <DukjilProvider slug={celebrity.slug} locale={locale}><GroupShell locale={locale} fanpage={!celebrity.roles.includes("brand")}><CreatorGroupHeader celebrity={celebrity} locale={locale} tab="board"/><div className={styles.creatorPostLayout}><div className={styles.creatorPostRead}><FanPostDetail expectedSlug={celebrity.slug} postId={postId} locale={locale} presentation="board"/></div><CreatorBoardAside event={boardEvent} slug={celebrity.slug} locale={locale}/></div></GroupShell><FanSiteFooter locale={locale}/></DukjilProvider>;
}
