"use client";
import type { ReactNode } from 'react';
import { BookOpen, CalendarCheck, Coins, UsersRound } from 'lucide-react';
import { FanAppFrame, FanContentContainer } from '@/components/fan-shell/fan-app-shell';
import { FanAction } from '@/components/fan-ui/fan-action';
import type { AppLocale } from '@/i18n/locales';
import { groupDetailSchema, groupHref } from '../domain/contracts';
import { useGroupResource } from './use-group-resource';
import { GroupAvatar, GroupShell } from './group-shell';
import { groupsCopy } from './copy';
import { walletCopy } from '@/features/group-wallet/ui/copy';
import styles from './group-activity-frame.module.css';
const parse=(value:unknown)=>groupDetailSchema.parse(value);
export function GroupActivityFrame({pageId,locale,title,children,standalone=false}:{pageId?:string;locale:AppLocale;title:string;children:ReactNode;standalone?:boolean}){
 const detail=useGroupResource(pageId?`/api/groups/${pageId}`:null,parse),page=detail.data?.page,t=groupsCopy(locale),w=walletCopy(locale);
 const href=(tab:string)=>page?`${groupHref(page,locale)}&tab=${tab}`:`/pages/groups?locale=${locale}`;
 const content=<>{page&&<><header className={styles.identity}><GroupAvatar page={page} locale={locale}/><div><h1>{page.name}</h1><p>{t[page.kind]} · {page.memberCount.toLocaleString(locale)}</p></div><FanAction href={href('info')}>{t.info}</FanAction></header><nav className={styles.tabs} aria-label={page.name}>{(['home','board','rooms','activities'] as const).map(tab=><FanAction key={tab} href={href(tab)} aria-current={tab==='activities'?'page':undefined}>{t[tab]}</FanAction>)}</nav></>}{detail.error&&<FanAction onClick={detail.retry}>{t.retry}</FanAction>}<div className={styles.layout}><section className={styles.main}>{page?<h2>{title}</h2>:<h1>{title}</h1>}{children}</section><aside className={styles.aside}><h2>{t.activities}</h2><FanAction href={`/my/wallet?view=attendance&locale=${locale}`} leadingIcon={<CalendarCheck/>}>{w.attendance}</FanAction><FanAction href={`/passports?locale=${locale}`} leadingIcon={<BookOpen/>}>{w.passport}</FanAction><FanAction href={`/my/wallet?locale=${locale}`} leadingIcon={<Coins/>}>{w.wallet}</FanAction>{page&&<FanAction href={href('activities')} leadingIcon={<UsersRound/>}>{t.activities}</FanAction>}</aside></div></>;
 return standalone?<FanAppFrame locale={locale} currentPath="/pages/groups" groupsEnabled mainId="group-activity-main"><FanContentContainer as="main" id="group-activity-main" className={styles.page}>{content}</FanContentContainer></FanAppFrame>:<GroupShell locale={locale}>{content}</GroupShell>;
}
