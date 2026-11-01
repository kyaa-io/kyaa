"use client";
import { LockKeyhole,ArrowLeft,ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { FanAppHeader,FanAppBottomNavigation } from '@/components/fan-shell/fan-app-shell';
import { GroupAvatar } from './group-shell';
import { pageManagementCopy } from './management-members-copy';
import { FanAction } from '@/components/fan-ui/fan-action';
import type { AppLocale } from '@/i18n/locales';
import { groupDetailSchema } from '../domain/contracts';
import { useGroupResource } from './use-group-resource';
import { groupReportTitle } from "./group-report-manager";
import { GroupManagement } from './group-management';
import { groupsCopy } from './copy';
import { managementCopy } from './management-copy';
import { raffleCopy } from '@/features/group-raffle/copy';
import styles from './group-manage.module.css';
const denied:Record<AppLocale,string>={ko:'운영진만 볼 수 있어요',en:'Only page staff can view this',ja:'運営メンバーのみ閲覧できます','zh-Hans':'仅管理团队可查看','zh-Hant':'僅管理團隊可檢視',es:'Solo el equipo puede ver esta página',id:'Hanya pengelola yang dapat melihat',vi:'Chỉ ban quản lý có thể xem',th:'เฉพาะทีมดูแลเท่านั้นที่ดูได้',pt:'Apenas a equipe pode ver esta página',fr:'Réservé à l’équipe de gestion',ru:'Доступно только команде страницы'};
const parse=(value:unknown)=>groupDetailSchema.parse(value);
export function GroupManageScreen({pageId,locale,initialSection="members"}:{pageId:string;locale:AppLocale;initialSection?:string}){
 const t=groupsCopy(locale),m=managementCopy(locale),c=raffleCopy(locale),p=pageManagementCopy(locale),r=useGroupResource(`/api/groups/${pageId}`,parse),allowed=r.data?.membership&&r.data.membership.role!=='member',items=[['members',t.members],['reports',groupReportTitle(locale)],['missions',p.missions],['events',t.events],['raffles',c.title],['rooms',t.rooms],['collection',t.collection],['settings',p.settings]] as const,[section,setSection]=useState(items.some(([id])=>id===initialSection)?initialSection:'members');
 return <div className={styles.shell} data-fan-surface lang={locale}><FanAppHeader locale={locale} currentPath="/pages/groups" groupsEnabled/><div className={styles.adminBand}><ShieldCheck size={24} aria-hidden='true'/><strong>{p.title}</strong>{r.data&&<span>{r.data.page.name} · {m.owner} / {m.manager}</span>}</div>
 {r.error?<main className={styles.status}><p role='alert'>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></main>:!r.data?<p className={styles.status} role='status'>{t.loading}</p>:!allowed?<main className={styles.status}><LockKeyhole size={32} aria-hidden='true'/><h1>{denied[locale]}</h1><FanAction href={`/pages/groups/${pageId}?locale=${locale}`} leadingIcon={<ArrowLeft/>}>{t.groups}</FanAction>{!r.authenticated&&<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/pages/groups/${pageId}/manage?locale=${locale}`)}`}>{t.login}</FanAction>}</main>:<><div className={styles.identity}><GroupAvatar page={r.data.page} locale={locale}/><strong>{r.data.page.name}</strong><FanAction href={`/pages/groups/${pageId}?locale=${locale}`} variant="text" leadingIcon={<ArrowLeft/>}>{t.groups}</FanAction></div><nav className={styles.tabs} aria-label={p.title}>{items.map(([id,label])=><a key={id} aria-current={section===id?'page':undefined} href={`/pages/groups/${pageId}/manage?locale=${locale}&section=${id}`} onClick={event=>{event.preventDefault();setSection(id);const url=new URL(window.location.href);url.searchParams.set('section',id);window.history.replaceState(window.history.state,'',url.pathname+url.search);}}>{label}</a>)}</nav><main className={styles.content}><GroupManagement key={`${r.ownerKey}:${section}`} detail={r.data} locale={locale} refresh={r.retry} section={section}/></main></>}
 <FanAppBottomNavigation locale={locale} currentPath="/pages/groups" groupsEnabled/></div>;
}
