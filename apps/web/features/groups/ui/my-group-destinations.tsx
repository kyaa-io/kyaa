"use client";
import Link from 'next/link';
import type { Route } from 'next';
import { z } from 'zod';
import { ArrowRight, CalendarCheck, CircleDot, Coins, Heart, MessageSquare, Radio, Ticket, UsersRound } from 'lucide-react';
import type { AppLocale } from '@/i18n/locales';
import { walletCopy } from '@/features/group-wallet/ui/copy';
import { socialCopy } from '@/features/group-social/copy';
import { capsuleCopy } from '@/features/group-capsule/copy';
import { useGroupsRelease } from './groups-release';
import { useGroupResource } from './use-group-resource';
import { groupsCopy } from './copy';
import { presenceCopy } from './presence-copy';
import { walletSchema } from '@/server/group-wallet/domain';
import styles from './my-group-destinations.module.css';
const parseWallet=(v:unknown)=>walletSchema.parse(v);
const parse=(v:unknown)=>z.object({enabled:z.boolean(),canConfigure:z.boolean()}).parse(v);
export function MyGroupDestinations({locale}:{locale:AppLocale}){
 const enabled=useGroupsRelease(),t=groupsCopy(locale),r=useGroupResource(enabled?'/api/groups/me/presence':null,parse),wallet=useGroupResource(enabled?'/api/me/wallet':null,parseWallet),w=walletCopy(locale);
 if(!enabled)return null;
 return <><dl className={styles.balances}>{([['points',Coins],['hearts',Heart],['tickets',Ticket]] as const).map(([key,Icon])=><div key={key}><dt><Icon aria-hidden='true'/><span>{w[key]}</span></dt><dd>{wallet.data?wallet.data[key].toLocaleString(locale):'—'}{key==='points'&&wallet.data?' P':''}</dd></div>)}</dl>{wallet.error&&<button type='button' onClick={wallet.retry}>{w.retry}</button>}<nav className={styles.primary} aria-label={w.wallet}>{[{path:'/my/wallet',label:w.wallet,description:w.history,Icon:Coins},{path:'/my/wallet?view=attendance',label:w.attendance,description:w.bonus,Icon:CalendarCheck}].map(item=><Link key={item.path} href={`${item.path}${item.path.includes('?')?'&':'?'}locale=${locale}` as Route}><item.Icon aria-hidden='true'/><span><strong>{item.label}</strong><small>{item.description}</small></span><ArrowRight aria-hidden='true'/></Link>)}</nav><details className={styles.other}><summary>{t.more}</summary><nav className={styles.myDestinations} aria-label={t.myPages}>{[
 {path:'/my/friends',label:socialCopy(locale).title,Icon:MessageSquare},
 {path:'/my/capsules',label:capsuleCopy(locale).title,Icon:CircleDot},
 {path:'/pages/groups',label:t.joinedPages,Icon:UsersRound,extra:'&mine=joined'},
 ...(r.data?.canConfigure?[{path:'/my/presence',label:presenceCopy(locale).setting,Icon:Radio}]:[]),
 ].map(item=><Link className={styles.card} key={item.path} href={`${item.path}?locale=${locale}${'extra' in item?item.extra:''}` as Route}><item.Icon size={24} aria-hidden='true'/><strong className={styles.cardCopy}>{item.label}</strong></Link>)}</nav></details></>;
}
