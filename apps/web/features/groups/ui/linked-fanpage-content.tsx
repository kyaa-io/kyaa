"use client";
import type {PublishedCelebrity} from '@/server/content/content-domain';
import {toContentLocale,type AppLocale} from '@/i18n/locales';
import {useByUsAuth} from '@/features/auth/client/cognito-auth';
import {useOwnedFanResource} from '@/components/fan-ui/use-owned-fan-resource';
import {mySummarySchema} from '@/features/my/domain/my-summary';
import {chzzkChannelId} from '@/features/fanpage/domain/chzzk-posts';
import type {Route} from 'next';
import type {BoardFeedSource} from '@/features/fanpage/domain/board-navigation';
import {FanPostFeed} from '@/features/fan-posts/ui/fan-post-feed';
import {useGroupBoardNotices} from './group-board-notices';
import {useOptionalGroupPage} from './group-page-context';
import homeStyles from './creator-group-home.module.css';
import {CreatorGroupHome} from './creator-group-home';
import {CreatorBoardAside} from './creator-board-aside';
import {PopularPosts} from './popular-posts';
import {fanStories} from './home-copy';
import styles from './groups.module.css';
const parseSummary=(body:unknown)=>mySummarySchema.parse((body as {summary:unknown}).summary);
export function LinkedFanpageContent({celebrity,locale,view,returnTo,pageId,source='all'}:{celebrity:PublishedCelebrity;locale:AppLocale;view:'home'|'board'|'aside';returnTo:string;pageId?:string;source?:BoardFeedSource}){
 const notices=useGroupBoardNotices(view==='board'&&source!=='fans'?pageId:undefined,locale,{all:source==='all',keepSource:source==='official'});
 const frame=useOptionalGroupPage(),auth=useByUsAuth(),ownSummary=useOwnedFanResource(frame?null:`/api/me/summary?locale=${toContentLocale(locale)}&tierStages=1`,parseSummary,auth),my=frame?.summary??ownSummary;
 const owned=my.state.status==='ready'?my.state.data.creators.find(item=>item.celebrity.slug===celebrity.slug):undefined;
 const aside=<CreatorBoardAside slug={celebrity.slug} locale={locale} owned={owned} passportId={owned?.passport?.id}/>;
 const filterHref=(value:BoardFeedSource)=>`/pages/groups/${pageId}?${new URLSearchParams({locale,tab:'board',...(value==='all'?{}:{source:value})})}` as Route;
 if(view==='aside')return aside;
 if(view==='home')return <CreatorGroupHome celebrity={celebrity} locale={locale} channelId={chzzkChannelId(celebrity.socialLinks)} owned={owned} passportId={owned?.passport?.id}/>;
 return <div className={`${styles.creatorPostLayout} ${homeStyles.noTopGap}`}><FanPostFeed slug={celebrity.slug} creatorName={celebrity.name} locale={locale} source={source} newsFilter={source==='official'?'notice':'all'} returnTo={returnTo} compact headingTitle={fanStories[locale]} beforeFeed={<PopularPosts slug={celebrity.slug} locale={locale}/>} intro='' allowMembers pinnedNotices={notices.items} pinnedPending={notices.pending} filterHref={filterHref}/>{aside}</div>;
}
