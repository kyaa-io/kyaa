'use client';
import { adminReviewLabels } from "@/i18n/catalogs/components__admin__review-navigation";
import Link from "../fan-ui/hover-prefetch-link";
import type {Route} from 'next';
import {BadgeCheck,CalendarCheck,Flag,Inbox,ChevronRight} from 'lucide-react';
import {ParticipationAdmin} from './participation-controls';
import {GroupLeaderPasses} from './group-leader-passes';
import styles from './group-admin.module.css';
export function GroupAdminOverview({locale}:{locale:'ko'|'en'}){
 const ko=locale==='ko',title=adminReviewLabels[locale].groupOverview;
 const entries=[
  {href:'/admin/groups/gift-applications',Icon:Inbox,title:adminReviewLabels[locale].giftApplications,description:ko?'제공 조건과 지급 가능 수량을 확인해요':'Review gift conditions and available stock.'},
  {href:'/admin/groups',Icon:BadgeCheck,title:adminReviewLabels[locale].groupApplications,description:ko?'아티스트와 신청 자료를 확인해요':'Review the artist and application details.'},
  {href:'/admin/groups/event-approvals',Icon:CalendarCheck,title:ko?'행사 승인':'Event approvals',description:ko?'새 행사와 일정·장소를 바꾼 행사를 확인해요':'Review new events and changed schedules or venues.'},
  {href:'/admin/groups/official-events',Icon:CalendarCheck,title:ko?'공식 행사 신청':'Official event applications',description:ko?'행사 내용과 제출 자료를 확인해요':'Review event details and submitted materials.'},
  {href:'/admin/groups/reports',Icon:Flag,title:ko?'신고 검토':'Review reports',description:ko?'신고 원문과 처리 이력을 확인해요':'Review reported content and its resolution history.'},
 ];
 const href=(value:string)=>(locale==='en'?`${value}?lang=en`:value) as Route;
 return <ParticipationAdmin groupLayout locale={locale} title={title} description="">{(role)=> <section><h1 className={styles.applicationTitle}><span><Inbox size={24} aria-hidden="true"/></span>{title}</h1><ul className={styles.overviewCards}>{entries.map(({href:path,Icon,title:label,description})=><li key={path}><Link href={href(path)}><Icon size={24} aria-hidden="true"/><span><strong>{label}</strong><small>{description}</small></span><ChevronRight size={18} aria-hidden="true"/></Link></li>)}</ul><GroupLeaderPasses locale={locale} readOnly={role==='viewer'}/></section>}</ParticipationAdmin>;
}
