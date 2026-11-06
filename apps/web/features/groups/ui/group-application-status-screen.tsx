"use client";
import type {AppLocale} from '@/i18n/locales';
import {groupApplyText} from './group-apply-copy';
import {GroupApplicationHistory} from './group-application-history';
import {GroupShell} from './group-shell';
import styles from './group-application-status.module.css';
export function GroupApplicationStatusScreen({locale}:{locale:AppLocale}){
 return <GroupShell locale={locale}><div className={styles.screen}><h1>{groupApplyText(locale,'mineTitle')}</h1><GroupApplicationHistory locale={locale} standalone/></div></GroupShell>;
}
