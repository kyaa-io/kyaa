"use client";
import { useDukjilStatus } from '@/features/dukjil/ui/dukjil-provider';
import { dukjilText } from '@/features/dukjil/ui/dukjil-copy';
import { useSelectedBias } from '@/features/selected-bias/ui/use-selected-bias';
import { POINT_COIN_SRC } from '@/features/dukjil/ui/earn-badge';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from "../../../components/fan-ui/hover-prefetch-link";
import { usePathname, useSearchParams } from 'next/navigation';
import { RotateCw } from 'lucide-react';
import { fanLoginHref } from '@/components/login-href';
import { FanAction } from '@/components/fan-ui/fan-action';
import { Menu } from '@base-ui/react/menu';
import { PencilHeaderIcon } from "@/components/fan-shell/pencil-header-icon";
import type { Route } from 'next';
import { APP_LOCALE_NATIVE_NAMES, type AppLocale } from '@/i18n/locales';
import {GroupLanguageDialog} from './group-language-dialog';
import { rememberOverlayTrigger } from '@/components/ui/overlay/focus-return';
import { walletSchema } from '@/server/group-wallet/domain';
import { z } from 'zod';
import { useAvatar } from '@/features/profile/ui/use-avatar';
import { Avatar, AvatarPlaceholder } from '@/features/profile/ui/avatar';
import { GROUP_WALLET_CHANGED_EVENT, useGroupRequest, useGroupResource } from './use-group-resource';
import { walletCopy } from '@/features/group-wallet/ui/copy';
import { groupsCopy } from './copy';
import { ProfileConnectionPanel } from '@/features/group-social/profile-connection';
import { profileConnectionCopy } from '@/features/group-social/profile-copy';
import { LogoutConfirmDialog, logoutCopy } from '@/features/my/ui/my-logout';
import styles from './group-header-account.module.css';
const parse=(value:unknown)=>walletSchema.parse(value);
const parseProfile=(value:unknown)=>z.object({profile:z.object({nickname:z.string().nullable()})}).parse(value);
export function GroupHeaderAccount({locale,actions,actionsAreIdentity=false,languageHref}:{locale:AppLocale;actions?:ReactNode;actionsAreIdentity?:boolean;languageHref:string}){
 const auth=useGroupRequest(),wallet=useGroupResource(auth.authenticated?'/api/me/wallet':null,parse),avatar=useAvatar();
 const profile=useGroupResource(auth.authenticated?'/api/me/profile':null,parseProfile);
 const [languageOpen,setLanguageOpen]=useState(false),[logoutOpen,setLogoutOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null);
 const [profileOwner,setProfileOwner]=useState<string|null>(null);
 const openProfile=()=>{if(trigger.current)rememberOverlayTrigger(trigger.current);setProfileOwner(auth.ownerKey);};
 const profileLabel=profileConnectionCopy(locale).profile;
 const identity=<>{avatar.state.status==='ready'?<Avatar avatar={avatar.state.avatar} imageUrl={avatar.state.imageUrl} label='' size={48}/>:<AvatarPlaceholder size={48}/>}<span dir="auto" className={styles.menuName}>{profile.data?.profile.nickname ?? profileLabel}</span></>;
 const refreshWallet=wallet.retry;
 const ko=locale==='ko',dukjilStatus=useDukjilStatus(locale),dukjilOn=dukjilStatus==='on';
 // The attendance item names the fan's own favorite page ("{page} 출석체크"), or the plain 출석체크 without one — never a fixed page.
 const favorite=useSelectedBias(locale).selected,attendanceLabel=favorite?dukjilText(locale,'dukjilPageTitle',[favorite.name]):dukjilText(locale,'dukjilTitle');
 useEffect(()=>{const refresh=()=>refreshWallet();window.addEventListener(GROUP_WALLET_CHANGED_EVENT,refresh);return()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,refresh);},[refreshWallet]);
 const pathname=usePathname()||'/',query=useSearchParams()?.toString(),loginHref=fanLoginHref(locale,`${pathname}${query?`?${query}`:''}`);
 const links=[{href:'/my',label:ko?'MY · 패스포트':'MY · Passport',icon:'my' as const},{href:'/my/friends',label:ko?'친구·메시지':'Friends · Messages',icon:'message' as const},{href:'/settings',label:ko?'개인 설정':'Settings',icon:'settings' as const}];
 // Only while dukjil is off; the amount is the server's to say, so the label names no number. Hidden once today's share is received.
 const attendance=auth.authenticated?wallet.data?.attendance:undefined,canCheckIn=Boolean(attendance&&!attendance.checkedIn&&!wallet.data?.writeFenced&&!(wallet.data?.rewardsStartOn&&attendance.date<wallet.data.rewardsStartOn));
 return <>
  {auth.authenticated&&!actionsAreIdentity&&actions}
  {/* Feedback F: signed in, the avatar is the menu trigger (one control, not avatar + ☰); signed out it is ☰. */}
  <Menu.Root><Menu.Trigger ref={trigger} className={`${styles.menuTrigger} ${auth.authenticated?styles.avatarTrigger:''}`} data-account-trigger={auth.authenticated?'avatar':'menu'} aria-label={ko?'계정 메뉴':'Account menu'}>{auth.authenticated?(avatar.state.status==='ready'?<Avatar avatar={avatar.state.avatar} imageUrl={avatar.state.imageUrl} label='' size={44}/>:<AvatarPlaceholder size={44}/>):<PencilHeaderIcon name="menu" size={20}/>}</Menu.Trigger><Menu.Portal><Menu.Positioner className={styles.positioner} sideOffset={8} align='end'><Menu.Popup className={styles.menu}>
  {auth.authenticated&&<Menu.Item className={styles.menuIdentity} aria-label={profile.data?.profile.nickname ? `${profileLabel} · ${profile.data.profile.nickname}` : profileLabel} onClick={openProfile}>{identity}</Menu.Item>}
  {auth.authenticated&&dukjilOn&&<Menu.Item className={styles.menuItem} data-earn='attendance' render={<Link href={`/my/wallet?view=attendance&locale=${locale}` as Route}/>}><PencilHeaderIcon name='points' size={20}/>{attendanceLabel}</Menu.Item>}
  {dukjilStatus==='off'&&canCheckIn&&<Menu.Item className={styles.menuItem} data-earn='attendance' render={<Link href={`/my/wallet?view=attendance&locale=${locale}` as Route}/>}><PencilHeaderIcon name='points' size={20}/>{walletCopy(locale).checkIn}</Menu.Item>}
  {links.map(({href,label,icon},i)=><Menu.Item key={href} className={`${styles.menuItem} ${href==='/settings'?styles.divided:''}`} render={<Link href={`${href}?locale=${locale}` as Route}/>}><PencilHeaderIcon name={icon} size={20}/>{label}</Menu.Item>)}
  <Menu.Item className={styles.menuItem} onClick={()=>{if(trigger.current)rememberOverlayTrigger(trigger.current);setLanguageOpen(true);}}><PencilHeaderIcon name="languages" size={20}/><span>{ko?'언어 설정':'Language'}</span><small>{APP_LOCALE_NATIVE_NAMES[locale]}</small></Menu.Item>
  <Menu.Item className={`${styles.menuItem} ${styles.divided}`} render={<Link href={`/pages/groups/apply?locale=${locale}`}/>}><PencilHeaderIcon name="groups" size={20}/>{groupsCopy(locale).apply}</Menu.Item>
  {auth.authenticated
   ?<Menu.Item className={`${styles.menuItem} ${styles.divided}`} data-account-action='logout' onClick={()=>{if(trigger.current)rememberOverlayTrigger(trigger.current);setLogoutOpen(true);}}><PencilHeaderIcon name="logout" size={20}/>{logoutCopy(locale).logout}</Menu.Item>
   :<Menu.Item className={`${styles.menuItem} ${styles.divided}`} data-account-action='login' render={<Link href={loginHref}/>}><PencilHeaderIcon name="login" size={20}/>{walletCopy(locale).login}</Menu.Item>}
  </Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>
  {auth.authenticated&&profileOwner===auth.ownerKey&&<ProfileConnectionPanel key={auth.ownerKey} locale={locale} identity={identity} onClose={()=>setProfileOwner(null)}/>}
  {logoutOpen&&auth.authenticated&&<LogoutConfirmDialog locale={locale} onClose={()=>setLogoutOpen(false)}/>}
  {languageOpen&&<GroupLanguageDialog locale={locale} href={languageHref} onClose={()=>setLanguageOpen(false)}/>}
 </>;
}

/** The header's point balance: coin and number, every width. Pressing it opens the 덕질 tab (tab 1 item 1). Signed out there is no balance and no slot. */
export function GroupHeaderPoints({locale}:{locale:AppLocale}){
 const auth=useGroupRequest(),wallet=useGroupResource(auth.authenticated?'/api/me/wallet':null,parse);
 const refreshWallet=wallet.retry;
 useEffect(()=>{const refresh=()=>refreshWallet();window.addEventListener(GROUP_WALLET_CHANGED_EVENT,refresh);return()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,refresh);},[refreshWallet]);
 const pathname=usePathname()||'/',query=useSearchParams()?.toString();
 if(!auth.authenticated)return null;
 const w=walletCopy(locale);
 // An expired session answers 401/403 while the browser still holds a user: the slot turns into the way back in, not an endless dash.
 if(wallet.failure&&(wallet.failure.status===401||wallet.failure.status===403))return <Link className={styles.points} data-points='signin' href={fanLoginHref(locale,`${pathname}${query?`?${query}`:''}`) as Route}><strong>{w.login}</strong></Link>;
 if(wallet.error&&wallet.data===undefined)return <FanAction variant='text' className={`${styles.points} ${styles.pointsRetry}`} onClick={wallet.retry} ariaLabel={`${w.points} · ${w.retry}`} leadingIcon={<img src={POINT_COIN_SRC} width={20} height={20} alt=""/>}><RotateCw size={16} aria-hidden="true"/></FanAction>;
 return <Link className={styles.points} href={`/benefits?locale=${locale}`} aria-label={`${walletCopy(locale).points} ${wallet.data?.points??'—'}`}><img src={POINT_COIN_SRC} width={20} height={20} alt="" aria-hidden="true"/><strong>{wallet.data?.points.toLocaleString(locale)??'—'}</strong></Link>;
}
