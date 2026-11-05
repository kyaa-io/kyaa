'use client';
import {FanAppHeader} from '@/components/fan-shell/fan-app-shell';
import {FanAction} from '@/components/fan-ui/fan-action';
import type {AppLocale} from '@/i18n/locales';
import {groupDetailSchema} from '../domain/contracts';
import {GroupGiftApplications} from './group-gifts';
import {useGroupResource} from './use-group-resource';
import {groupsCopy} from './copy';
import {giftCopy} from './gift-copy';
import styles from './group-gifts.module.css';
const parse=(v:unknown)=>groupDetailSchema.parse(v);
export function GroupGiftScreen({pageId,locale,applicationId,history=false}:{history?:boolean;pageId:string;locale:AppLocale;applicationId?:string}){const r=useGroupResource(`/api/groups/${pageId}`,parse),c=giftCopy(locale),t=groupsCopy(locale),allowed=r.data?.membership&&r.data.membership.role!=='member';return <div data-fan-surface lang={locale}><FanAppHeader locale={locale} currentPath='/pages/groups' groupsEnabled/>{r.error?<main className={styles.main}><p role='alert'>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></main>:!r.data?<main className={styles.main} role='status'>{t.loading}</main>:!allowed?<main className={styles.main}><h1>{c.operation} · {r.data.page.name}</h1><p>{c.operator}</p><FanAction href={`/pages/groups/${pageId}?locale=${locale}`}>{r.data.page.name}</FanAction></main>:<><div className={styles.band}><strong>{c.operation} · {r.data.page.name}</strong><small>{c.operator}</small></div><main><GroupGiftApplications key={`${r.ownerKey}:${applicationId??'new'}`} pageId={pageId} locale={locale} initialId={applicationId} initialList={history}/></main></>}</div>;}
