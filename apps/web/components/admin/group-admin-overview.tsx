'use client';
import Link from 'next/link';
import type {Route} from 'next';
import {BadgeCheck,CalendarCheck,Flag,History,Inbox,ChevronRight} from 'lucide-react';
import {ParticipationAdmin} from './participation-controls';
import styles from './group-admin.module.css';
export function GroupAdminOverview({locale}:{locale:'ko'|'en'}){
 const ko=locale==='ko',title=ko?'확인이 필요한 요청':'Requests to review';
 const entries=[
  {href:'/admin/groups',Icon:BadgeCheck,label:ko?'팬페이지 신청':'Fan page applications',title:ko?'팬페이지 개설 신청':'Fan page applications',description:ko?'아티스트와 신청 자료를 확인해요':'Review the artist and application details.'},
  {href:'/admin/groups/official-events',Icon:CalendarCheck,label:ko?'공식 이벤트':'Official events',title:ko?'공식 이벤트 신청':'Official event applications',description:ko?'행사 내용과 제출 자료를 확인해요':'Review event details and submitted materials.'},
  {href:'/admin/groups/reports',Icon:Flag,label:ko?'신고 검토':'Reports',title:ko?'신고 검토':'Review reports',description:ko?'신고 원문과 처리 이력을 확인해요':'Review reported content and its resolution history.'},
  {href:'/admin/audit',Icon:History,label:ko?'관리 기록':'Audit log'},
 ];
 const href=(value:string)=>(locale==='en'?`${value}?lang=en`:value) as Route;
 return <ParticipationAdmin groupLayout locale={locale} title={title} description="">{()=> <div className={styles.overviewLayout}><nav className={styles.overviewNav} aria-label={ko?'모임 관리 메뉴':'Group administration'}>{entries.map(({href:path,Icon,label})=><Link key={path} href={href(path)}><Icon size={24} aria-hidden="true"/><span>{label}</span><ChevronRight size={18} aria-hidden="true"/></Link>)}</nav><section><h1 className={styles.applicationTitle}><span><Inbox size={24} aria-hidden="true"/></span>{title}</h1><ul className={styles.overviewCards}>{entries.filter(entry=>'description' in entry).map(({href:path,Icon,title:label,description})=><li key={path}><Link href={href(path)}><Icon size={24} aria-hidden="true"/><span><strong>{label}</strong><small>{description}</small></span><ChevronRight size={18} aria-hidden="true"/></Link></li>)}</ul></section></div>}</ParticipationAdmin>;
}
