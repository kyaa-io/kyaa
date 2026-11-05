"use client";
import { useDukjilStatus } from '@/features/dukjil/ui/dukjil-provider';
import { dukjilText } from '@/features/dukjil/ui/dukjil-copy';
import { useEffect, useRef, useState, isValidElement, type ReactNode, type ReactElement } from 'react';
import Link from 'next/link';
import { Menu } from '@base-ui/react/menu';
import { PencilHeaderIcon } from "@/components/fan-shell/pencil-header-icon";
import type { Route } from 'next';
import { APP_LOCALE_NATIVE_NAMES, type AppLocale } from '@/i18n/locales';
import {GroupLanguageDialog} from './group-language-dialog';
import { rememberOverlayTrigger } from '@/components/ui/overlay/focus-return';
import { walletSchema } from '@/server/group-wallet/domain';
import { useAvatar } from '@/features/profile/ui/use-avatar';
import { Avatar, AvatarPlaceholder } from '@/features/profile/ui/avatar';
import { GROUP_WALLET_CHANGED_EVENT, useGroupRequest, useGroupResource } from './use-group-resource';
import { walletCopy } from '@/features/group-wallet/ui/copy';
import { groupsCopy } from './copy';
import { ProfileConnectionPanel } from '@/features/group-social/profile-connection';
import { profileConnectionCopy } from '@/features/group-social/profile-copy';
import styles from './group-header-account.module.css';
const parse=(value:unknown)=>walletSchema.parse(value);
export function GroupHeaderAccount({locale,actions,actionsAreIdentity=false,languageHref}:{locale:AppLocale;actions?:ReactNode;actionsAreIdentity?:boolean;languageHref:string}){
 const auth=useGroupRequest(),wallet=useGroupResource(auth.authenticated?'/api/me/wallet':null,parse),avatar=useAvatar();
 const [languageOpen,setLanguageOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null);
 const [profileOwner,setProfileOwner]=useState<string|null>(null);
 const openProfile=()=>{if(trigger.current)rememberOverlayTrigger(trigger.current);setProfileOwner(auth.ownerKey);};
 const profileLabel=profileConnectionCopy(locale).profile;
 const identity=actionsAreIdentity&&isValidElement(actions)?(actions as ReactElement<{children?:ReactNode}>).props.children:<>{avatar.state.status==='ready'?<Avatar avatar={avatar.state.avatar} imageUrl={avatar.state.imageUrl} label='' size={48}/>:<AvatarPlaceholder size={48}/>}<span>{profileLabel}</span></>;
 const refreshWallet=wallet.retry;
 const ko=locale==='ko',dukjilStatus=useDukjilStatus(locale),dukjilOn=dukjilStatus==='on';
 useEffect(()=>{const refresh=()=>refreshWallet();window.addEventListener(GROUP_WALLET_CHANGED_EVENT,refresh);return()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,refresh);},[refreshWallet]);
 const links=[{href:'/my',label:ko?'MY · 패스포트':'MY · Passport',icon:'my' as const},{href:'/my/friends',label:ko?'친구·메시지':'Friends · Messages',icon:'message' as const},{href:'/notifications',label:ko?'알림':'Notifications',icon:'bell' as const},{href:'/settings',label:ko?'개인 설정':'Settings',icon:'settings' as const}];
 // Existing payout rule only: 10P per check-in, 30P on the 7th day (same values the attendance screen shows). Hidden once today's share is received.
 const attendance=auth.authenticated?wallet.data?.attendance:undefined,earnable=attendance&&!attendance.checkedIn&&!wallet.data?.writeFenced&&!(wallet.data?.rewardsStartOn&&attendance.date<wallet.data.rewardsStartOn)?(attendance.nextBonusIn===1?30:10):0;
 return <>
  {auth.authenticated&&<><Link className={styles.points} href={`/benefits?locale=${locale}`} aria-label={`${walletCopy(locale).points} ${wallet.data?.points??'—'}`}><PencilHeaderIcon name="points" size={20}/><strong>{wallet.data?.points.toLocaleString(locale)??'—'}</strong></Link>{(!actionsAreIdentity&&actions)||<button className={styles.profile} onClick={event=>{rememberOverlayTrigger(event.currentTarget);setProfileOwner(auth.ownerKey);}} aria-label={profileLabel} aria-haspopup='dialog'>{avatar.state.status==='ready'?<Avatar avatar={avatar.state.avatar} imageUrl={avatar.state.imageUrl} label='' size={44}/>:<AvatarPlaceholder size={44}/>}</button>}</>}
  <Menu.Root><Menu.Trigger ref={trigger} className={styles.menuTrigger} aria-label={ko?'계정 메뉴':'Account menu'}><PencilHeaderIcon name="menu" size={20}/></Menu.Trigger><Menu.Portal><Menu.Positioner className={styles.positioner} sideOffset={8} align='end'><Menu.Popup className={styles.menu}>
  {auth.authenticated&&actionsAreIdentity&&isValidElement(actions)&&<Menu.Item className={styles.menuIdentity} onClick={openProfile}>{identity}</Menu.Item>}
  {auth.authenticated&&!actionsAreIdentity&&<Menu.Item className={styles.menuItem} onClick={openProfile}><PencilHeaderIcon name='my' size={20}/>{profileLabel}</Menu.Item>}
  {auth.authenticated&&dukjilOn&&<Menu.Item className={styles.menuItem} data-earn='attendance' render={<Link href={`/my/wallet?view=attendance&locale=${locale}` as Route}/>}><PencilHeaderIcon name='points' size={20}/>{dukjilText(locale,'dukjilTitle')}</Menu.Item>}
  {dukjilStatus==='off'&&earnable>0&&<Menu.Item className={styles.menuItem} data-earn='attendance' render={<Link href={`/my/wallet?view=attendance&locale=${locale}` as Route}/>}><PencilHeaderIcon name='points' size={20}/>{ko?`출석하고 ${earnable}P 받기`:`Check in for ${earnable} P`}</Menu.Item>}
  {links.map(({href,label,icon},i)=><Menu.Item key={href} className={`${styles.menuItem} ${i===3?styles.divided:''}`} render={<Link href={`${href}?locale=${locale}` as Route}/>}><PencilHeaderIcon name={icon} size={20}/>{label}</Menu.Item>)}
  <Menu.Item className={styles.menuItem} onClick={()=>{if(trigger.current)rememberOverlayTrigger(trigger.current);setLanguageOpen(true);}}><PencilHeaderIcon name="languages" size={20}/><span>{ko?'언어 설정':'Language'}</span><small>{APP_LOCALE_NATIVE_NAMES[locale]}</small></Menu.Item>
  <Menu.Item className={`${styles.menuItem} ${styles.divided}`} render={<Link href={`/pages/groups/apply?locale=${locale}`}/>}><PencilHeaderIcon name="groups" size={20}/>{groupsCopy(locale).apply}</Menu.Item>
  </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>
  {auth.authenticated&&profileOwner===auth.ownerKey&&<ProfileConnectionPanel key={auth.ownerKey} locale={locale} identity={identity} onClose={()=>setProfileOwner(null)}/>}
  {languageOpen&&<GroupLanguageDialog locale={locale} href={languageHref} onClose={()=>setLanguageOpen(false)}/>}
 </>;
}
