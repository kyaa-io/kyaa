"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Send } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import Link from "../../components/fan-ui/hover-prefetch-link";
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
 const [composerVisible,setComposerVisible]=useState(false);
 useEffect(()=>{
  if(!auth.authenticated)return;
  const visible = new Set<Element>();
  const observed = new Set<Element>();
  const intersection = new IntersectionObserver(entries=>{
   for(const entry of entries){
    if(!observed.has(entry.target))continue;
    if(entry.isIntersecting)visible.add(entry.target);
    else visible.delete(entry.target);
   }
   setComposerVisible(visible.size>0);
  });
  const sync = ()=>{
   for(const element of observed){
    if(element.isConnected)continue;
    intersection.unobserve(element);
    observed.delete(element);
    visible.delete(element);
   }
   for(const element of document.querySelectorAll('[data-floating-dm-avoid]')){
    if(observed.has(element))continue;
    observed.add(element);
    intersection.observe(element);
   }
   setComposerVisible(visible.size>0);
  };
  const observer = new MutationObserver(sync);
  observer.observe(document.body,{childList:true,subtree:true});
  sync();
  return()=>{observer.disconnect();intersection.disconnect();};
 },[auth.authenticated,pathname]);
 useEffect(()=>{
  let previous=window.scrollY;
  const update=()=>{const next=window.scrollY;setHidden(next>previous&&next>64);previous=next;};
  window.addEventListener('scroll',update,{passive:true});
  return()=>window.removeEventListener('scroll',update);
 },[]);
 if(!auth.authenticated)return null;
 const count=resource.data?.conversations.reduce((sum,c)=>sum+(c.unreadCount??0),0)??0;
 const label=count?`DM, ${count.toLocaleString(locale)}`:'DM';
 const content=<><FanIcon icon={Send} size={20} />{count>0&&<span className={badgeStyles.badge} aria-hidden="true">{unreadBadgeText(count)}</span>}</>;
 const href=`/my/friends?locale=${locale}` as const;
 const path=pathname??'';const suppressed=path.startsWith('/my/friends')||/\/(write|new|edit|compose)(\/|$)/.test(path);
 return <><Link href={href} className={`${iconStyles.button} ${className??''} ${badgeStyles.link}`} aria-label={label}>{content}</Link>{!suppressed&&<Link href={href} className={`${iconStyles.button} ${styles.floating}`} aria-label={label} hidden={hidden || composerVisible}>{content}</Link>}</>;
}
