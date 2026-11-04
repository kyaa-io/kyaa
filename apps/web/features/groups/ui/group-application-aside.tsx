"use client";
import {LayoutDashboard,CalendarCheck,Coins,ArrowRight} from 'lucide-react';
import {FanAction} from '@/components/fan-ui/fan-action';
import type {AppLocale} from '@/i18n/locales';
import {walletCopy} from '@/features/group-wallet/ui/copy';
import {groupHref,groupListSchema} from '../domain/contracts';
import {useGroupResource} from './use-group-resource';
import {GroupAvatar} from './group-shell';
import {groupsCopy} from './copy';
import {applicationCopy} from './application-copy';
import styles from './groups.module.css';
import {seeAllLabel} from './group-directory';
import headStyles from './group-directory-loading.module.css';
const parse=(v:unknown)=>groupListSchema.parse(v);
export function GroupApplicationAside({locale,authenticated}:{locale:AppLocale;authenticated:boolean}){const t=groupsCopy(locale),c=applicationCopy(locale),w=walletCopy(locale),r=useGroupResource(authenticated?'/api/groups?mine=joined&limit=2':null,parse);return <aside className={styles.applicationAside}><section><header className={headStyles.head}><h2><LayoutDashboard size={20} aria-hidden='true'/>{t.myPages}</h2><FanAction href={`/pages/groups?locale=${locale}&mine=joined`} variant='text' className={headStyles.all} ariaLabel={locale==='ko'?'내 페이지 전체 보기':`${seeAllLabel[locale]} · ${t.myPages}`}>{seeAllLabel[locale]}</FanAction></header>{r.data?.items.map(page=><FanAction key={page.id} href={groupHref(page,locale)} variant='text' leadingIcon={<GroupAvatar page={page} locale={locale}/>}>{page.name}</FanAction>)}{r.error&&<FanAction onClick={r.retry}>{t.retry}</FanAction>}</section><section><h2><CalendarCheck size={20} aria-hidden='true'/>{c.activity}</h2><FanAction href={`/my/wallet?view=attendance&locale=${locale}`} variant='text' leadingIcon={<CalendarCheck/>} trailingIcon={<ArrowRight/>}>{w.attendance}</FanAction><FanAction href={`/my/wallet?locale=${locale}`} variant='text' leadingIcon={<Coins/>} trailingIcon={<ArrowRight/>}>{w.wallet}</FanAction></section></aside>;}
