"use client";
import { GroupImage } from "./group-image";
import { useContext, type ReactNode } from "react";
import { FanLayoutContext } from "@/components/fan-shell/fan-layout-context";
import { FanContentContainer } from "@/components/fan-shell/fan-content-container";
import { FanAppHeader, FanAppBottomNavigation, FanSkipLink } from "@/components/fan-shell/fan-app-shell";
import type { AppLocale } from "@/i18n/locales";
import type { GroupPage } from "../domain/contracts";
import styles from "./groups.module.css";

export function GroupShell({locale,children,currentPath="/pages/groups",hideBottomNavigation=false,fanpage=false}:{fanpage?:boolean;hideBottomNavigation?:boolean;locale:AppLocale;children:ReactNode;currentPath?:string}) {
  const persistent = useContext(FanLayoutContext);
  return <div className={styles.shell} data-fan-surface data-fan-bottom-navigation-hidden={hideBottomNavigation ? "" : undefined} lang={locale}>{!persistent && <><FanSkipLink locale={locale} mainId="groups-main"/><FanAppHeader locale={locale} currentPath={currentPath} groupsEnabled/></>}<FanContentContainer as="main" className={`${styles.page} ${fanpage?styles.creatorPage:""}`} id="groups-main">{children}</FanContentContainer>{!persistent && !hideBottomNavigation &&<FanAppBottomNavigation locale={locale} currentPath={currentPath} groupsEnabled/>}</div>;
}
/** 앞의 기호(`[`)를 뺀 첫 두 글자. */
const fallbackLetters=(name:string)=>Array.from(name.replace(/^[^\p{L}\p{N}]+/u,"")||name).slice(0,2).join("");
export function GroupAvatar({page,locale="ko"}:{page:GroupPage;locale?:AppLocale}) {
  return page.imageUrl ? <GroupImage locale={locale} src={page.imageUrl} className={styles.avatar} alt="" width={48} height={48}/> : <span className={`${styles.avatar} ${styles.fallback}`} aria-hidden="true">{fallbackLetters(page.name)}</span>;
}

export function GroupIdentityHeader({name,imageUrl,locale,meta,description,titleAction,actions}:{name:string;imageUrl?:string|null;locale:AppLocale;meta:ReactNode;description?:ReactNode;titleAction?:ReactNode;actions:ReactNode}) {
  return <header className={`${styles.identity} ${styles.nonFanIdentity} ${styles.groupIdentityHeader}`} data-layout-family="group">
    {imageUrl?<GroupImage locale={locale} src={imageUrl} className={styles.avatar} alt="" width={64} height={64}/>:<span className={`${styles.avatar} ${styles.fallback}`} aria-hidden="true">{fallbackLetters(name)}</span>}
    <div className={styles.identityCopy}><div className={styles.creatorTitleRow}><h1>{name}</h1>{titleAction}</div><p className={styles.meta}>{meta}</p>{description&&<p className={styles.meta}>{description}</p>}</div>
    <div className={styles.groupIdentityActions}>{actions}</div>
  </header>;
}
