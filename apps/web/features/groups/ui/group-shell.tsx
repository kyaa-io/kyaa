"use client";
import { GroupImage } from "./group-image";
import type { ReactNode } from "react";
import { FanAppHeader, FanAppBottomNavigation } from "@/components/fan-shell/fan-app-shell";
import type { AppLocale } from "@/i18n/locales";
import type { GroupPage } from "../domain/contracts";
import styles from "./groups.module.css";

export function GroupShell({locale,children,currentPath="/pages/groups"}:{locale:AppLocale;children:ReactNode;currentPath?:string}) {
  return <div className={styles.shell} data-fan-surface lang={locale}><FanAppHeader locale={locale} currentPath={currentPath} groupsEnabled/><main className={styles.page} id="groups-main">{children}</main><FanAppBottomNavigation locale={locale} currentPath={currentPath} groupsEnabled/></div>;
}
export function GroupAvatar({page,locale="ko"}:{page:GroupPage;locale?:AppLocale}) {
  return page.imageUrl ? <GroupImage locale={locale} src={page.imageUrl} className={styles.avatar} alt="" width={48} height={48}/> : <span className={`${styles.avatar} ${styles.fallback}`} aria-hidden="true">{page.name.slice(0,2)}</span>;
}
