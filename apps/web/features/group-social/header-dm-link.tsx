"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Send } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import Link from "next/link";
import iconStyles from "@/components/fan-ui/fan-icon-button.module.css";
import { useGroupRequest, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { parseConversations } from "./conversation";
import { unreadBadgeText } from "@/features/notification/ui/header-notification-link";
import type { AppLocale } from "@/i18n/locales";
import styles from "./header-dm-link.module.css";
import badgeStyles from "@/features/notification/ui/header-notification-link.module.css";

export function HeaderDmLink({locale,className}:{locale:AppLocale;className?:string}) {
 const auth=useGroupRequest(),pathname=usePathname();
 const resource=useGroupResource(auth.authenticated?'/api/me/social/conversations':null,parseConversations);
 const [hidden,setHidden]=useState(false);
 useEffect(()=>{
  let previous=window.scrollY;
  const update=()=>{const next=window.scrollY;setHidden(next>previous&&next>64);previous=next;};
  window.addEventListener('scroll',update,{passive:true});
  return()=>window.removeEventListener('scroll',update);
 },[]);
 if(!auth.authenticated)return null;
 const count=resource.data?.conversations.reduce((sum,c)=>sum+(c.unreadCount??0),0)??0;
 const label=count?`DM, ${count.toLocaleString(locale)}`:'DM';
 const content=<><FanIcon icon={Send} size={20}/>{count>0&&<span className={badgeStyles.badge} aria-hidden="true">{unreadBadgeText(count)}</span>}</>;
 const href=`/my/friends?locale=${locale}` as const;
 const suppressed=pathname.startsWith('/my/friends')||/\/(write|new|edit|compose)(\/|$)/.test(pathname);
 return <><Link href={href} className={`${iconStyles.button} ${className??''} ${badgeStyles.link}`} aria-label={label}>{content}</Link>{!suppressed&&<Link href={href} className={`${iconStyles.button} ${styles.floating}`} aria-label={label} hidden={hidden}>{content}</Link>}</>;
}
