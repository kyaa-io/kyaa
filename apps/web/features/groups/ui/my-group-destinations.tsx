"use client";
import {useDukjilStatus} from "@/features/dukjil/ui/dukjil-provider";
import {dukjilText} from "@/features/dukjil/ui/dukjil-copy";
import Link from 'next/link';
import type { Route } from 'next';
import { z } from 'zod';
import { ArrowRight, CalendarCheck, CircleDot, Coins, MessageSquare, Radio, Ticket, UsersRound } from 'lucide-react';
import type { AppLocale } from '@/i18n/locales';
import { walletCopy } from '@/features/group-wallet/ui/copy';
import { socialCopy } from '@/features/group-social/copy';
import { capsuleCopy } from '@/features/group-capsule/copy';
import { useGroupsRelease } from './groups-release';
import { useGroupResource } from './use-group-resource';
import { groupsCopy } from './copy';
import { presenceCopy } from './presence-copy';
import { walletSchema } from '@/server/group-wallet/domain';
import { FanAction } from '@/components/fan-ui/fan-action';
import styles from './my-group-destinations.module.css';
const parseWallet=(v:unknown)=>walletSchema.parse(v);
const parse=(v:unknown)=>z.object({enabled:z.boolean(),canConfigure:z.boolean()}).parse(v);
const labels:Record<AppLocale,readonly[string,string]>={ko:['내 지갑','지갑 열기'],en:['My wallet','Open wallet'],ja:['マイウォレット','ウォレットを開く'],'zh-Hans':['我的钱包','打开钱包'],'zh-Hant':['我的錢包','開啟錢包'],es:['Mi cartera','Abrir cartera'],id:['Dompet saya','Buka dompet'],vi:['Ví của tôi','Mở ví'],th:['กระเป๋าของฉัน','เปิดกระเป๋า'],pt:['Minha carteira','Abrir carteira'],fr:['Mon portefeuille','Ouvrir le portefeuille'],ru:['Мой кошелёк','Открыть кошелёк']};
export function MyGroupDestinations({locale}:{locale:AppLocale}){
 const enabled=useGroupsRelease(),t=groupsCopy(locale),r=useGroupResource(enabled?'/api/groups/me/presence':null,parse),wallet=useGroupResource(enabled?'/api/me/wallet':null,parseWallet),w=walletCopy(locale),dukjilOn=useDukjilStatus(locale)==='on';
 if(!enabled)return null;
 return <><section className={styles.walletSummary}><header><h2>{labels[locale][0]}</h2><p>{w.wallet}</p></header><dl className={styles.balances}>{([['points',Coins],['tickets',Ticket]] as const).map(([key,Icon])=><div key={key}><dt><Icon aria-hidden='true'/><span>{w[key]}</span></dt><dd>{wallet.data?wallet.data[key].toLocaleString(locale):'—'}{wallet.data?key==='points'?' P':locale==='ko'?'장':'':''}</dd></div>)}</dl>{wallet.error&&<FanAction onClick={wallet.retry}>{w.retry}</FanAction>}<nav className={styles.primary} aria-label={w.wallet}>{[{path:'/my/wallet',label:w.wallet,description:w.history,Icon:Coins},{path:'/my/wallet?view=attendance',label:w.attendance,description:dukjilOn?dukjilText(locale,'dukjilListTitle'):w.bonus,Icon:CalendarCheck}].map(item=><Link key={item.path} href={`${item.path}${item.path.includes('?')?'&':'?'}locale=${locale}` as Route}><item.Icon aria-hidden='true'/><span><strong>{item.path==='/my/wallet'?<><span className={styles.desktopLabel}>{labels[locale][1]}</span><span className={styles.mobileLabel}>{labels[locale][0]}</span></>:item.label}</strong><small>{item.description}</small></span><ArrowRight aria-hidden='true'/></Link>)}</nav></section><details className={styles.other}><summary>{t.more}</summary><nav className={styles.myDestinations} aria-label={t.myPages}>{[
 {path:'/my/friends',label:socialCopy(locale).title,Icon:MessageSquare},
 {path:'/my/capsules',label:capsuleCopy(locale).title,Icon:CircleDot},
 {path:'/pages/groups',label:t.joinedPages,Icon:UsersRound,extra:'&mine=joined'},
 ...(r.data?.canConfigure?[{path:'/my/presence',label:presenceCopy(locale).setting,Icon:Radio}]:[]),
 ].map(item=><Link className={styles.card} key={item.path} href={`${item.path}?locale=${locale}${'extra' in item?item.extra:''}` as Route}><item.Icon size={24} aria-hidden='true'/><strong className={styles.cardCopy}>{item.label}</strong></Link>)}</nav></details></>;
}
