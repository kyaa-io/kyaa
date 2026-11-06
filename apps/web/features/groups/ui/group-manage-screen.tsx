"use client";
import { LockKeyhole,ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { FanAppHeader,FanAppBottomNavigation } from '@/components/fan-shell/fan-app-shell';
import { GroupAvatar } from './group-shell';
import { pageManagementCopy } from './management-members-copy';
import { FanAction } from '@/components/fan-ui/fan-action';
import type { AppLocale } from '@/i18n/locales';
import { groupDetailSchema } from '../domain/contracts';
import { useGroupResource } from './use-group-resource';
import { useAddressParam } from './use-address-param';
import { GROUP_COLLECTIONS_VISIBLE } from '../domain/collection-visibility';
import { manageText } from './manage-copy';
import { managementCopy } from './management-copy';
import { FanSkeletonRows } from '@/components/fan-ui/fan-skeleton';
import { groupReportTitle } from "./group-report-manager";
import { GroupManagement } from './group-management';
import { groupsCopy } from './copy';
import { operatorCopy } from './group-operator-copy';
import { raffleCopy } from '@/features/group-raffle/copy';
import type { GroupManagementPresentation } from './management-presentation';
import styles from './group-manage.module.css';
const denied:Record<AppLocale,string>={ko:'운영진만 볼 수 있어요',en:'Only page staff can view this',ja:'運営メンバーのみ閲覧できます','zh-Hans':'仅管理团队可查看','zh-Hant':'僅管理團隊可檢視',es:'Solo el equipo puede ver esta página',id:'Hanya pengelola yang dapat melihat',vi:'Chỉ ban quản lý có thể xem',th:'เฉพาะทีมดูแลเท่านั้นที่ดูได้',pt:'Apenas a equipe pode ver esta página',fr:'Réservé à l’équipe de gestion',ru:'Доступно только команде страницы'};
const parse=(value:unknown)=>groupDetailSchema.parse(value);
export function GroupManageScreen({pageId,locale,initialSection,localPresentation,eventOperations,raffleCreate,initialGiftId}:{initialGiftId?:string;pageId:string;locale:AppLocale;initialSection?:string;localPresentation?:GroupManagementPresentation;eventOperations?:ReactNode;raffleCreate?:ReactNode}){
 const t=groupsCopy(locale),c=raffleCopy(locale),p=pageManagementCopy(locale),oc=operatorCopy(locale),r=useGroupResource(`/api/groups/${pageId}`,parse,{nameLocale:false}),allowed=r.data?.membership&&r.data.membership.role!=='member';
 const items=[['members',t.members],['reports',groupReportTitle(locale)],['missions',p.missions],['events',t.events],['gifts',manageText(locale,'giftsTab')],['raffles',c.title],['rooms',t.rooms],...(GROUP_COLLECTIONS_VISIBLE?[['collection',t.collection]] as const:[]),['stats',oc.statsTitle],['notices',oc.noticesTitle],['settings',p.settings]] as const;
 const [address,setAddress]=useAddressParam('section'),wanted=address??initialSection,section=items.some(([id])=>id===wanted)?wanted:'members';
 return <div className={styles.shell} data-fan-surface lang={locale}><FanAppHeader locale={locale} currentPath="/pages/groups" groupsEnabled/>
 {r.error?<main className={styles.status}><p role='alert'>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></main>:!r.data?<div className={styles.status}><FanSkeletonRows rows={5} variant='plain' ariaLabel={t.loading}/></div>:!allowed?<main className={styles.status}><LockKeyhole size={32} aria-hidden='true'/><p>{r.data.page.name}</p><h1>{denied[locale]}</h1><FanAction href={`/pages/groups/${pageId}?locale=${locale}`} leadingIcon={<ArrowLeft/>}>{t.groups}</FanAction>{!r.authenticated&&<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/pages/groups/${pageId}/manage?locale=${locale}`)}`}>{t.login}</FanAction>}</main>:<><div className={styles.identity}><GroupAvatar page={r.data.page} locale={locale}/><h1>{r.data.page.name} <span>{managementCopy(locale).manage}</span></h1><FanAction href={`/pages/groups/${pageId}?locale=${locale}`} variant="text" leadingIcon={<ArrowLeft/>}>{t.groups}</FanAction></div><nav className={styles.tabs} aria-label={p.title}>{items.map(([id,label])=><a key={id} aria-current={section===id?'page':undefined} href={`/pages/groups/${pageId}/manage?locale=${locale}&section=${id}`} onClick={event=>{event.preventDefault();setAddress(id,['new','gift','giftApplicationId']);}}>{label}</a>)}</nav><main className={styles.content}>{section==='events'&&eventOperations?eventOperations:section==='raffles'&&raffleCreate?raffleCreate:<GroupManagement key={`${r.ownerKey}:${section}`} detail={r.data} locale={locale} refresh={r.retry} section={section} initialGiftId={initialGiftId} localPresentation={localPresentation}/>}</main></>}
 <FanAppBottomNavigation locale={locale} currentPath="/pages/groups" groupsEnabled/></div>;
}
