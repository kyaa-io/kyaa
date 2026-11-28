import { FanText } from '@/components/fan-ui/fan-text';
import { fanUiText } from '@/components/fan-ui/fan-ui-copy';
import type { AppLocale } from '@/i18n/locales';
import styles from './group-presence.module.css';

export function FanProfileMetrics({fans,data,locale}:{fans?:number;data?:{onlineCount:number;todayCount:number};locale:AppLocale}) {
 const counts = {fanCount:fans, presenceNow:data?.onlineCount, presenceToday:data?.todayCount};
 return <dl className={styles.profileCounts}>{(Object.keys(counts) as Array<keyof typeof counts>).map(key => (
  <div key={key}><FanText as="dt" role="meta">{fanUiText(locale,key,['']).trim()}</FanText><FanText as="dd" role="item">{counts[key]?.toLocaleString(locale) ?? '–'}</FanText></div>
 ))}</dl>;
}
