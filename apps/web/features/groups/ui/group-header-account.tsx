"use client";
import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { Coins } from 'lucide-react';
import type { AppLocale } from '@/i18n/locales';
import { walletSchema } from '@/server/group-wallet/domain';
import { useAvatar } from '@/features/profile/ui/use-avatar';
import { Avatar, AvatarPlaceholder } from '@/features/profile/ui/avatar';
import { GROUP_WALLET_CHANGED_EVENT, useGroupRequest, useGroupResource } from './use-group-resource';
import { walletCopy } from '@/features/group-wallet/ui/copy';
import styles from './group-header-account.module.css';
const parse=(value:unknown)=>walletSchema.parse(value);
export function GroupHeaderAccount({locale,children,actions}:{locale:AppLocale;children:ReactNode;actions?:ReactNode}){
 const auth=useGroupRequest(),wallet=useGroupResource(auth.authenticated?'/api/me/wallet':null,parse),avatar=useAvatar();
 const refreshWallet=wallet.retry;
 useEffect(()=>{const refresh=()=>refreshWallet();window.addEventListener(GROUP_WALLET_CHANGED_EVENT,refresh);return()=>window.removeEventListener(GROUP_WALLET_CHANGED_EVENT,refresh);},[refreshWallet]);
 if(!auth.authenticated)return <>{children}{actions}</>;
 return <><Link className={styles.points} href={`/my/wallet?locale=${locale}`} aria-label={`${walletCopy(locale).points} ${wallet.data?.points??'—'}`}><Coins aria-hidden='true' size={18}/><strong>{wallet.data?.points.toLocaleString(locale)??'—'}</strong></Link>{children}{actions??<Link className={styles.profile} href={`/my?locale=${locale}`} aria-label='MY'>{avatar.state.status==='ready'?<Avatar avatar={avatar.state.avatar} imageUrl={avatar.state.imageUrl} label='MY' size={36}/>:<AvatarPlaceholder size={36}/>}</Link>}</>;
}
