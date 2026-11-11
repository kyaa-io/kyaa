"use client";
import {DukjilProvider} from "@/features/dukjil/ui/dukjil-provider";
import type { AppLocale } from '@/i18n/locales';
import type { PublishedCelebrity } from '@/server/content/content-domain';
import { FanSiteFooter } from '@/components/fan-shell/fan-site-footer';
import { FanPostDetail } from '@/features/fan-posts/ui/fan-post-detail';
import { CreatorGroupHeader } from './creator-group-header';
import { GroupShell } from './group-shell';
import { PostDetailMore } from '@/features/fan-posts/ui/post-detail-more';
import { fanPostPageImage } from '@/components/fan-ui/fan-post-page-image';
import styles from './groups.module.css';

/** 글 상세: 본문 열 + 이 페이지의 다른 글과 배너 레일(1024 미만에서는 본문 아래). */
export function CreatorGroupPostPage({celebrity,postId,locale}:{celebrity:PublishedCelebrity;postId:string;locale:AppLocale}) {
 const brand=celebrity.roles.includes("brand"),pageImage=fanPostPageImage({slug:celebrity.slug,src:celebrity.image.url,photos:celebrity.image.photos,position:celebrity.image.position});
 return <DukjilProvider slug={celebrity.slug} locale={locale}><GroupShell locale={locale} fanpage={!brand}><CreatorGroupHeader celebrity={celebrity} locale={locale} tab="board"/><div className={`${styles.creatorPostLayout} ${styles.creatorPostDetailLayout}`}><div className={styles.creatorPostRead}><FanPostDetail expectedSlug={celebrity.slug} postId={postId} locale={locale} presentation="board"/></div><PostDetailMore slug={celebrity.slug} postId={postId} locale={locale} pageImage={pageImage} banner={!brand}/></div></GroupShell><FanSiteFooter locale={locale}/></DukjilProvider>;
}
