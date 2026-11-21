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
  {href:'/admin/groups/gift-applications',Icon:Inbox,title:adminReviewLabels[locale].giftApplications},
  {href:'/admin/groups',Icon:BadgeCheck,title:adminReviewLabels[locale].groupApplications},
  {href:'/admin/groups/event-approvals',Icon:CalendarCheck,title:ko?'모임 행사 승인':'Group event approvals'},
  {href:'/admin/groups/official-events',Icon:CalendarCheck,title:ko?'공식 행사 신청':'Official event applications'},
  {href:'/admin/groups/reports',Icon:Flag,title:ko?'모임 신고':'Group reports'},
 ];
 const href=(value:string)=>(locale==='en'?`${value}?lang=en`:value) as Route;
 return <ParticipationAdmin groupLayout locale={locale} title={title} description="">{(role)=> <section><h1 className={styles.applicationTitle}><span><Inbox size={24} aria-hidden="true"/></span>{title}</h1><ul className={styles.overviewCards}>{entries.map(({href:path,Icon,title:label})=><li key={path}><Link href={href(path)}><Icon size={24} aria-hidden="true"/><span><strong>{label}</strong></span><ChevronRight size={18} aria-hidden="true"/></Link></li>)}</ul><GroupLeaderPasses locale={locale} readOnly={role==='viewer'}/></section>}</ParticipationAdmin>;
}
