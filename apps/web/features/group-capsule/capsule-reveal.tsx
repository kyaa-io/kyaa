"use client";
import {SourceStatePanel} from '@/features/groups/ui/source-state-panel';
import { GroupImage } from "@/features/groups/ui/group-image";
import { useEffect,useState } from 'react';
import { FanAction } from '@/components/fan-ui/fan-action';
import type { AppLocale } from '@/i18n/locales';
import type { z } from 'zod';
import type { capsuleResultSchema } from './domain';
import type { CapsulePresentation } from './capsule-screen';
import { capsuleCopy } from './copy';
import styles from './capsule.module.css';
const opening:Record<AppLocale,string>={ko:'캡슐을 열고 있어요.',en:'Opening capsules.',ja:'カプセルを開いています。','zh-Hans':'正在打开胶囊。','zh-Hant':'正在開啟膠囊。',es:'Abriendo cápsulas.',id:'Membuka kapsul.',vi:'Đang mở viên nang.',th:'กำลังเปิดแคปซูล',pt:'Abrindo cápsulas.',fr:'Ouverture des capsules.',ru:'Открываем капсулы.'};
const skip:Record<AppLocale,string>={ko:'결과 바로 보기',en:'Skip to results',ja:'結果をすぐ見る','zh-Hans':'直接查看结果','zh-Hant':'直接查看結果',es:'Ver resultados',id:'Langsung lihat hasil',vi:'Xem ngay kết quả',th:'ดูผลทันที',pt:'Ver resultados',fr:'Voir les résultats',ru:'Сразу к результатам'};
export function CapsuleReveal({result,locale,onComplete,onReturn,presentation}:{result:z.infer<typeof capsuleResultSchema>;locale:AppLocale;onComplete?:()=>void;onReturn?:()=>void;presentation?:CapsulePresentation}){
 const c=capsuleCopy(locale),[phase,setPhase]=useState(0),[reducedMotion,setReducedMotion]=useState(false);
 useEffect(()=>{
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;setReducedMotion(Boolean(reduced));
  const timers=(reduced?[[120,3]]:[[720,1],[1120,2],[1600,3]]).map(([delay,next])=>setTimeout(()=>setPhase(next),delay));
  return()=>timers.forEach(clearTimeout);
 },[]);
 useEffect(()=>{if(phase===3)onComplete?.();},[phase,onComplete]);
 const won = result.results.filter(item=>item.prizeId !== null);
 return <section className={`${styles.panel} ${styles.resultStage} ${presentation?styles.sourceResult:''}`} aria-live='polite' data-capsule-phase={phase} data-capsule-count={result.count}>{phase<3?<h2>{opening[locale].replace(/\.$/,'')}</h2>:<header className={styles.stageHeader}><div><h2>{locale==='ko'?`캡슐 ${result.count}개의 결과`:c.result}</h2><p>{c.tickets} {result.count}{locale==='ko'?'장 사용':''}</p></div><div className={styles.balance}><span>{locale==='ko'?'남은 응모권':c.tickets}</span><strong>{result.tickets.toLocaleString(locale)}{locale==='ko'?'장':''}</strong></div></header>}{phase<3&&reducedMotion&&<SourceStatePanel sourceId='cRVyO' title={locale==='ko'?'모션 감소가 켜져 있어요':skip[locale]} actions={[{label:skip[locale],onClick:()=>setPhase(3),variant:'primary'}]}/>} {phase<3?<><div className={styles.reveal} aria-hidden='true'><img className={phase===0?styles.machineMotion:styles.machineStill} src='/images/groups/capsule-machine.png' width={220} height={220} alt=''/><img className={phase===0?styles.hiddenCapsule:phase===1?styles.droppingCapsule:styles.openCapsule} src={phase===2?'/images/groups/capsule-open.png':'/images/groups/capsule-closed.png'} width={100} height={100} alt=''/></div><p role='status'>{opening[locale]}</p><FanAction onClick={()=>setPhase(3)}>{skip[locale]}</FanAction></>:<><h3>{locale==='ko'?'이번 뽑기 결과':c.result}</h3><ol className={styles.results}>{result.results.map(item=><li key={item.index} data-won={item.prizeId!==null}><GroupImage locale={locale} src={item.imageUrl??'/images/groups/capsule-open.png'} alt='' width={80} height={80}/><strong>{item.name??c.blank}</strong><span>{locale==='ko'?`${item.index}번째 캡슐`:item.index}</span></li>)}</ol>{result.count===1&&won.length===0&&locale==='ko'&&<p className={styles.noPrize}>이번에는 당첨되지 않았어요.</p>}{won.length>0&&<div className={styles.winningSummary}><div><h3>{locale==='ko'?`${presentation?`${presentation.creatorName} 굿즈`:'경품'} ${won.length}개 당첨`: `${c.prizes}: ${won.length}`}</h3>{presentation&&<p>{locale==='ko'?'당첨 내역에서 수령 방법을 확인하세요.':c.result}</p>}</div>{presentation&&<FanAction variant='primary' href={presentation.claimHref}>{locale==='ko'?'수령 방법 확인':c.result}</FanAction>}</div>}{onReturn&&<div className={styles.resultActions}>{presentation&&<FanAction href={presentation.historyHref}>{locale==='ko'?'뽑기 기록':c.result}</FanAction>}<FanAction onClick={onReturn}>{locale==='ko'?'뽑기 화면으로':c.title}</FanAction></div>}</>}</section>;
}
