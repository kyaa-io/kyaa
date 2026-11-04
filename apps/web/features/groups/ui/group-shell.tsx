"use client";
import { GroupImage } from "./group-image";
import type { ReactNode } from "react";
import { FanContentContainer } from "@/components/fan-shell/fan-content-container";
import { FanAppHeader, FanAppBottomNavigation, FanSkipLink } from "@/components/fan-shell/fan-app-shell";
import type { AppLocale } from "@/i18n/locales";
import type { GroupPage } from "../domain/contracts";
import styles from "./groups.module.css";

export function GroupShell({locale,children,currentPath="/pages/groups",hideBottomNavigation=false,fanpage=false}:{fanpage?:boolean;hideBottomNavigation?:boolean;locale:AppLocale;children:ReactNode;currentPath?:string}) {
  return <div className={styles.shell} data-fan-surface lang={locale}><FanSkipLink locale={locale} mainId="groups-main"/><FanAppHeader locale={locale} currentPath={currentPath} groupsEnabled/><FanContentContainer as="main" className={`${styles.page} ${fanpage?styles.creatorPage:""}`} id="groups-main">{children}</FanContentContainer>{!hideBottomNavigation&&<FanAppBottomNavigation locale={locale} currentPath={currentPath} groupsEnabled/>}</div>;
}
export function GroupAvatar({page,locale="ko"}:{page:GroupPage;locale?:AppLocale}) {
  return page.imageUrl ? <GroupImage locale={locale} src={page.imageUrl} className={styles.avatar} alt="" width={48} height={48}/> : <span className={`${styles.avatar} ${styles.fallback}`} aria-hidden="true">{page.name.slice(0,2)}</span>;
}

export function GroupIdentityHeader({name,imageUrl,locale,meta,description,titleAction,actions}:{name:string;imageUrl?:string|null;locale:AppLocale;meta:ReactNode;description?:ReactNode;titleAction?:ReactNode;actions:ReactNode}) {
  return <header className={`${styles.identity} ${styles.nonFanIdentity} ${styles.groupIdentityHeader}`} data-layout-family="group">
    {imageUrl?<GroupImage locale={locale} src={imageUrl} className={styles.avatar} alt="" width={64} height={64}/>:<span className={`${styles.avatar} ${styles.fallback}`} aria-hidden="true">{name.slice(0,2)}</span>}
    <div className={styles.identityCopy}><div className={styles.creatorTitleRow}><h1>{name}</h1>{titleAction}</div><p className={styles.meta}>{meta}</p>{description&&<p className={styles.meta}>{description}</p>}</div>
    <div className={styles.groupIdentityActions}>{actions}</div>
  </header>;
}
