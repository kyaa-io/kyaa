'use client';
import {CircleAlert} from 'lucide-react';
import {FanAction} from '@/components/fan-ui/fan-action';
import type {AppLocale} from '@/i18n/locales';
import styles from './directory-area-error.module.css';
const hint:Record<AppLocale,string>={ko:'잠시 뒤 다시 시도해 주세요.',en:'Please try again in a moment.',ja:'しばらくしてからもう一度お試しください。','zh-Hans':'请稍后再试。','zh-Hant':'請稍後再試。',es:'Inténtalo de nuevo en un momento.',id:'Coba lagi sebentar lagi.',vi:'Vui lòng thử lại sau ít phút.',th:'โปรดลองอีกครั้งในอีกสักครู่',pt:'Tente novamente em instantes.',fr:'Réessayez dans un instant.',ru:'Повторите попытку чуть позже.'};
/** Area-scoped failure: names the failed area, states the next step, retry is an outlined (neutral) button; `fit` shrinks the notice to its content. */
export function DirectoryAreaError({locale,title,retryLabel,onRetry,fit=false}:{locale:AppLocale;title:string;retryLabel:string;onRetry:()=>void;fit?:boolean}){
 return <section className={[styles.notice,fit&&styles.fit].filter(Boolean).join(' ')} role="alert"><span className={styles.icon} aria-hidden><CircleAlert size={20}/></span><div className={styles.copy}><p className={styles.title}>{title}</p><p className={styles.hint}>{hint[locale]}</p></div><FanAction className={styles.retry} variant="neutral" onClick={onRetry}>{retryLabel}</FanAction></section>;
}
