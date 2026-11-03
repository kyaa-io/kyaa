"use client";
import type { ReactNode } from 'react';
import { ArrowRight, BookOpen, CalendarCheck, Coins, Gift } from 'lucide-react';
import { FanAction } from '@/components/fan-ui/fan-action';
import { FanSiteFooter } from '@/components/fan-shell/fan-site-footer';
import type { AppLocale } from '@/i18n/locales';
import { GroupShell } from './group-shell';
import { groupsCopy } from './copy';
import { walletCopy } from '@/features/group-wallet/ui/copy';
import { raffleCopy } from '@/features/group-raffle/copy';
import styles from './group-activity-frame.module.css';
export type GroupActivityPresentation={header:ReactNode;aside:ReactNode};
// pageId scopes an API request, not the global activity's navigation context.
export function GroupActivityFrame({locale,title,children,layoutClassName,hideTitle=false,localPresentation}:{pageId?:string;locale:AppLocale;title:string;children:ReactNode;standalone?:boolean;layoutClassName?:string;hideTitle?:boolean;localPresentation?:GroupActivityPresentation}){
 const t=groupsCopy(locale),w=walletCopy(locale);
 const aside=<aside className={styles.aside}><h2>{t.activities}</h2><FanAction href={`/my/wallet?view=attendance&locale=${locale}`} leadingIcon={<CalendarCheck/>} trailingIcon={<ArrowRight/>}>{w.attendance}</FanAction><FanAction href={`/passports?locale=${locale}`} leadingIcon={<BookOpen/>} trailingIcon={<ArrowRight/>}>{w.passport}</FanAction><FanAction href={`/my/wallet?locale=${locale}`} leadingIcon={<Coins/>} trailingIcon={<ArrowRight/>}>{w.wallet}</FanAction><FanAction href={`/benefits?locale=${locale}`} leadingIcon={<Gift/>} trailingIcon={<ArrowRight/>}>{raffleCopy(locale).title}</FanAction></aside>;
 return <><div className={styles.page}><GroupShell locale={locale} currentPath='/benefits'>{localPresentation?.header}<div className={[styles.layout,layoutClassName].filter(Boolean).join(' ')}><section className={styles.main}>{!hideTitle&&<h1>{title}</h1>}{children}</section>{localPresentation?localPresentation.aside:aside}</div></GroupShell></div><FanSiteFooter locale={locale}/></>;
}
