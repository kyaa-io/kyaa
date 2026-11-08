"use client";
import {DukjilProvider} from "@/features/dukjil/ui/dukjil-provider";
import type { AppLocale } from '@/i18n/locales';
import type { PublishedCelebrity } from '@/server/content/content-domain';
import { FanSiteFooter } from '@/components/fan-shell/fan-site-footer';
import { FanPostDetail } from '@/features/fan-posts/ui/fan-post-detail';
import { CreatorGroupHeader } from './creator-group-header';
import { CreatorBoardAside,type CreatorBoardEvent } from './creator-board-aside';
import { GroupShell } from './group-shell';
import { useByUsAuth } from '@/features/auth/client/cognito-auth';
import { useOwnedFanResource } from '@/components/fan-ui/use-owned-fan-resource';
import { mySummaryPath, mySummarySchema } from '@/features/my/domain/my-summary';
import { toContentLocale } from '@/i18n/locales';
import { useOptionalGroupPage } from './group-page-context';
import styles from './groups.module.css';

const parseSummary=(body:unknown)=>mySummarySchema.parse((body as {summary:unknown}).summary);

/** 글 상세 옆 칸. 로그인한 팬의 패스포트와 등급을 읽어 넘겨, 등급 카드가 잠금 상태로 남지 않게 한다. */
function CreatorPostAside({celebrity,locale,boardEvent}:{celebrity:PublishedCelebrity;locale:AppLocale;boardEvent?:CreatorBoardEvent}){
 const frame=useOptionalGroupPage(),auth=useByUsAuth(),own=useOwnedFanResource(frame?.summary?null:mySummaryPath(toContentLocale(locale)),parseSummary,auth),my=frame?.summary??own;
 const owned=my.state.status==='ready'?my.state.data.creators.find(item=>item.celebrity.slug===celebrity.slug):undefined;
 return <CreatorBoardAside event={boardEvent} slug={celebrity.slug} locale={locale} owned={owned} passportId={owned?.passport?.id}/>;
}

export function CreatorGroupPostPage({celebrity,postId,locale,boardEvent}:{celebrity:PublishedCelebrity;postId:string;locale:AppLocale;boardEvent?:CreatorBoardEvent}) {
 return <DukjilProvider slug={celebrity.slug} locale={locale}><GroupShell locale={locale} fanpage={!celebrity.roles.includes("brand")}><CreatorGroupHeader celebrity={celebrity} locale={locale} tab="board"/><div className={styles.creatorPostLayout}><div className={styles.creatorPostRead}><FanPostDetail expectedSlug={celebrity.slug} postId={postId} locale={locale} presentation="board"/></div><CreatorPostAside celebrity={celebrity} locale={locale} boardEvent={boardEvent}/></div></GroupShell><FanSiteFooter locale={locale}/></DukjilProvider>;
}
