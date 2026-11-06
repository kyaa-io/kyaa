"use client";
import {useRef,useState} from 'react';
import {ArrowRight,Heart,MessageCircle,MessagesSquare,Pencil,Star} from 'lucide-react';
import {FanAction} from '@/components/fan-ui/fan-action';
import {CreatorAttendanceEntry} from '@/features/dukjil/ui/creator-attendance-entry';
import {dukjilText} from '@/features/dukjil/ui/dukjil-copy';
import {DukjilProvider} from '@/features/dukjil/ui/dukjil-provider';
import {FanMissions} from '@/features/dukjil/ui/fan-missions';
import {walletCopy} from '@/features/group-wallet/ui/copy';
import {WalletAttendanceDialog} from '@/features/group-wallet/ui/wallet-screen';
import type {AppLocale} from '@/i18n/locales';
import type {GroupPage} from '../domain/contracts';
import {creatorHomeCardCopy} from './creator-home-card-copy';
import {groupBenefitsCopy} from './group-benefits-copy';
import {GroupBoard} from './group-board';
import {GroupBrandHomeEvent,GroupHomeGallery} from './group-home-panels';
import {useGroupPage} from './group-page-context';
import {useCompactHeader} from './group-page-menu';
import {GroupScheduleCard} from './group-schedule-card';
import {groupsCopy} from './copy';
import {brandJoin,fanStories} from './home-copy';
import styles from './groups.module.css';
import homeStyles from './creator-group-home.module.css';
import railStyles from './creator-board-aside.module.css';

/** 팬페이지의 미션 카드를 모임에 맞춘 것. 일반 모임에는 패스포트가 없어 인증 행은 그 모임의 미션 화면으로 간다. */
function GroupMissionCard({page,locale}:{page:GroupPage;locale:AppLocale}){
 const g=useGroupPage(),t=groupsCopy(locale),[open,setOpen]=useState(false),trigger=useRef<HTMLElement|null>(null);
 const close=()=>{setOpen(false);requestAnimationFrame(()=>trigger.current?.focus());};
 const board=String(g.hrefFor('board')),write=g.detail?.membership?String(g.hrefFor('board',{compose:'1'})):board,missions=`/pages/groups/${page.id}/missions?locale=${locale}`;
 return <DukjilProvider locale={locale} accountToday>
  <FanMissions locale={locale} slug={page.slug??''} title={locale==='ko'?'팬 활동':t.activities} passportHref={missions} proofHref={missions} group={{write,comment:board}} onAttendance={element=>{trigger.current=element;setOpen(true);}}/>
  {open&&(page.slug&&page.celebrityId?<CreatorAttendanceEntry slug={page.slug} pageName={page.name} locale={locale} reviewHref={`/${page.slug}?locale=${locale}&tab=certifications`} onClose={close}/>:<WalletAttendanceDialog locale={locale} open onClose={close}/>)}
 </DukjilProvider>;
}

/** 내 패스포트 자리. 가입해야 열리는 일을 보여 주고 머리의 별과 같은 행동으로 보낸다. */
function GroupJoinCard({locale}:{locale:AppLocale}){
 const g=useGroupPage(),star=g.star,t=groupsCopy(locale),card=creatorHomeCardCopy(locale);
 if(g.detail?.membership||!star)return null;
 const label=star.label;
 return <section className={`${styles.sourceHomeCard} ${homeStyles.joinCard}`} data-group-join>
  <h2>{card.joinTitle}</h2>
  <ul className={homeStyles.joinList}>
   <li><Pencil size={16} aria-hidden='true'/>{dukjilText(locale,'dukjilTilePost')}</li>
   <li><MessageCircle size={16} aria-hidden='true'/>{dukjilText(locale,'dukjilTileComment')}</li>
   <li><MessagesSquare size={16} aria-hidden='true'/>{t.rooms}</li>
  </ul>
  {star.href?<FanAction variant='neutral' fullWidth href={star.href} leadingIcon={<Star/>}>{label}</FanAction>:<FanAction variant='neutral' fullWidth ariaBusy={star.pending||undefined} disabled={star.pending} onClick={star.onClick} leadingIcon={<Star/>}>{label}</FanAction>}
 </section>;
}

/** 크리에이터가 연결되지 않은 모임·취미·브랜드의 홈. 팬페이지 홈과 같은 틀이다: 갤러리 → 팬들의 이야기 / 팬 활동 → 다가오는 일정 → 가입 → 포인트. 글·일정이 없어도 첫 화면에 할 일이 보이도록 사이드는 팬 활동부터 둔다. */
export function GroupHome({locale,pageId,heading}:{locale:AppLocale;pageId:string;heading?:string}){
 const g=useGroupPage(),narrow=useCompactHeader(),page=g.page,detail=g.detail,t=groupsCopy(locale),w=walletCopy(locale);
 if(!page||!detail)return null;
 const parts=<>
  <GroupMissionCard page={page} locale={locale}/>
  <GroupScheduleCard page={page} locale={locale} calendarHref={String(g.hrefFor('calendar'))}/>
  <GroupJoinCard locale={locale}/>
 </>;
 return <div className={styles.creatorHomeLayout}>
  <div className={`${styles.creatorHomeMain} ${homeStyles.main}`}>
   {page.kind==='brand'&&<GroupBrandHomeEvent pageId={pageId} locale={locale}/>}
   <GroupHomeGallery pageId={pageId} locale={locale}/>
   <GroupBoard key={g.ownerKey} detail={detail} locale={locale} onJoin={g.startJoin} joinPending={g.joinPending} joinLabel={page.kind==='brand'?brandJoin[locale]:t.join} preview heading={heading??fanStories[locale]}/>
   {narrow&&<div className={styles.mobileParticipation}>{parts}</div>}
  </div>
  {!narrow&&<aside className={styles.creatorHomeAside}>
   {parts}
   <section className={styles.creatorAsideGroup}><h2>{locale==='ko'?'모은 포인트 사용하기':w.points}</h2><FanAction variant='text' href={`/benefits?locale=${locale}`} leadingIcon={<Heart/>} trailingIcon={<ArrowRight/>}>{locale==='ko'?'덕질에서 혜택·응원':t.events}</FanAction></section>
  </aside>}
 </div>;
}

/** 홈이 아닌 탭의 사이드. 팬페이지의 게시판 사이드와 같은 구성이다. */
export function GroupSideRail({locale}:{locale:AppLocale;pageId:string}){
 const g=useGroupPage(),narrow=useCompactHeader(),page=g.page,t=groupsCopy(locale);
 if(!page||narrow)return null;
 return <aside className={railStyles.aside}>
  <GroupMissionCard page={page} locale={locale}/>
  <section className={railStyles.events}><h2>{locale==='ko'?'응원과 이벤트':t.events}</h2><FanAction variant='text' href={`/benefits?locale=${locale}`} leadingIcon={<Heart/>} trailingIcon={<ArrowRight/>}>{groupBenefitsCopy(locale).title}</FanAction></section>
 </aside>;
}
