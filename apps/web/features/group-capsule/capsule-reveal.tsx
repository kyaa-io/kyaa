"use client";
import {SourceStatePanel} from '@/features/groups/ui/source-state-panel';
import { GroupImage } from "@/features/groups/ui/group-image";
import { useEffect,useRef,useState } from 'react';
import {TaskPanel} from '@/features/groups/ui/task-panel';
import { FanAction } from '@/components/fan-ui/fan-action';
import type { AppLocale } from '@/i18n/locales';
import type { z } from 'zod';
import type { capsuleResultSchema } from './domain';
import type { CapsulePresentation } from './capsule-screen';
import { capsuleCopy } from './copy';
import styles from './capsule.module.css';
const opening:Record<AppLocale,string>={ko:'캡슐을 열고 있어요.',en:'Opening capsules.',ja:'カプセルを開いています。','zh-Hans':'正在打开胶囊。','zh-Hant':'正在開啟膠囊。',es:'Abriendo cápsulas.',id:'Membuka kapsul.',vi:'Đang mở viên nang.',th:'กำลังเปิดแคปซูล',pt:'Abrindo cápsulas.',fr:'Ouverture des capsules.',ru:'Открываем капсулы.'};
const skip:Record<AppLocale,string>={ko:'결과 바로 보기',en:'Skip to results',ja:'結果をすぐ見る','zh-Hans':'直接查看结果','zh-Hant':'直接查看結果',es:'Ver resultados',id:'Langsung lihat hasil',vi:'Xem ngay kết quả',th:'ดูผลทันที',pt:'Ver resultados',fr:'Voir les résultats',ru:'Сразу к результатам'};
const reducedDescription:Record<AppLocale,string>={ko:'캡슐 연출을 줄이고 같은 뽑기 결과를 확인할 수 있어요.',en:'Reduced capsule animation shows the same draw results.',ja:'カプセルの演出を減らして、同じ抽選結果を確認できます。','zh-Hans':'减少胶囊动画后，仍可查看相同的抽取结果。','zh-Hant':'減少膠囊動畫後，仍可查看相同的抽取結果。',es:'La animación reducida muestra los mismos resultados del sorteo.',id:'Animasi kapsul yang dikurangi menampilkan hasil undian yang sama.',vi:'Giảm hiệu ứng viên nang vẫn hiển thị cùng kết quả bốc thăm.',th:'ลดแอนิเมชันแคปซูลและดูผลการสุ่มเดิมได้',pt:'A animação reduzida mostra os mesmos resultados do sorteio.',fr:'L’animation réduite affiche les mêmes résultats du tirage.',ru:'Сокращённая анимация показывает те же результаты розыгрыша.'};
export function CapsuleReveal({result,locale,onComplete,onReturn,presentation}:{result:z.infer<typeof capsuleResultSchema>;locale:AppLocale;onComplete?:()=>void;onReturn?:()=>void;presentation?:CapsulePresentation}){
 const c=capsuleCopy(locale),[phase,setPhase]=useState(0),[reducedMotion,setReducedMotion]=useState(false),[mediaFailed,setMediaFailed]=useState(false),video=useRef<HTMLVideoElement>(null),[resultOpen,setResultOpen]=useState(true),reopen=useRef<HTMLDivElement>(null);
 const closeResult=()=>{setResultOpen(false);onReturn?.();};
 useEffect(()=>{if(!resultOpen)reopen.current?.querySelector<HTMLButtonElement>('button')?.focus();},[resultOpen]);
 useEffect(()=>{
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;setReducedMotion(Boolean(reduced));
  if(reduced){const timer=setTimeout(()=>setPhase(3),120);return()=>clearTimeout(timer);}
  let active=true;
  const timer=setTimeout(()=>{if(active)setMediaFailed(true);},10000);
  video.current?.play()?.catch(()=>{if(active)setMediaFailed(true);});
  return()=>{active=false;clearTimeout(timer);};
 },[]);
 useEffect(()=>{if(phase===3)onComplete?.();},[phase,onComplete]);
 const won = result.results.filter(item=>item.prizeId !== null);
 const content=<section className={`${styles.panel} ${styles.resultStage} ${presentation?styles.sourceResult:''}`} aria-live='polite' data-capsule-phase={phase} data-capsule-count={result.count}>{phase<3?<h2>{opening[locale].replace(/\.$/,'')}</h2>:<header className={styles.stageHeader}><div><h2>{locale==='ko'?`캡슐 ${result.count}개의 결과`:c.result}</h2><p>{c.tickets} {result.count}{locale==='ko'?'장 사용':''}</p></div><div className={styles.balance}><span>{locale==='ko'?'남은 응모권':c.tickets}</span><strong>{result.tickets.toLocaleString(locale)}{locale==='ko'?'장':''}</strong></div></header>}{phase<3&&reducedMotion&&<SourceStatePanel className={styles.reducedState} description={reducedDescription[locale]} sourceId='cRVyO' title={locale==='ko'?'모션 감소가 켜져 있어요':skip[locale]} actions={[{label:skip[locale],onClick:()=>setPhase(3),variant:'primary'}]}><img className={styles.reducedArt} src='/images/groups/capsule-closed.png' width={160} height={160} alt=''/></SourceStatePanel>} {phase<3?<><div className={styles.reveal} aria-hidden='true'>{reducedMotion||mediaFailed?<img className={styles.revealMedia} src='/images/groups/capsule-machine-reveal-poster.webp' width={960} height={960} alt=''/>:<video ref={video} className={styles.revealMedia} width={960} height={960} muted playsInline preload='auto' poster='/images/groups/capsule-machine-reveal-poster.webp' onEnded={()=>setPhase(3)} onError={()=>setMediaFailed(true)}><source src='/videos/capsule-machine-reveal.webm' type='video/webm'/><source src='/videos/capsule-machine-reveal.mp4' type='video/mp4'/></video>}</div><p role='status'>{mediaFailed?skip[locale]:opening[locale]}</p><FanAction onClick={()=>setPhase(3)}>{skip[locale]}</FanAction></>:<><h3>{locale==='ko'?'이번 뽑기 결과':c.result}</h3><ol className={styles.results}>{result.results.map(item=><li key={item.index} data-won={item.prizeId!==null}><GroupImage locale={locale} src={item.imageUrl??'/images/groups/capsule-open.png'} alt='' width={80} height={80}/><strong>{item.name??c.blank}</strong><span>{locale==='ko'?`${item.index}번째 캡슐`:item.index}</span></li>)}</ol>{result.count===1&&won.length===0&&locale==='ko'&&<p className={styles.noPrize}>이번에는 당첨되지 않았어요.</p>}{won.length>0&&<div className={styles.winningSummary}><div><h3>{locale==='ko'?`${presentation?`${presentation.creatorName} 굿즈`:'경품'} ${won.length}개 당첨`: `${c.prizes}: ${won.length}`}</h3>{presentation&&<p>{locale==='ko'?'당첨 내역에서 수령 방법을 확인하세요.':c.result}</p>}</div>{presentation&&<FanAction variant='primary' href={presentation.claimHref}>{locale==='ko'?'수령 방법 확인':c.result}</FanAction>}</div>}{onReturn&&<div className={styles.resultActions}>{presentation&&<FanAction href={presentation.historyHref}>{locale==='ko'?'뽑기 기록':c.result}</FanAction>}<FanAction onClick={closeResult}>{locale==='ko'?'뽑기 화면으로':c.title}</FanAction></div>}</>}</section>;
 return phase<3?content:<><div ref={reopen}><FanAction onClick={()=>setResultOpen(true)}>{c.result}</FanAction></div>{resultOpen&&<TaskPanel title={c.result} mode='modal' width={800} onClose={closeResult} className={styles.resultModal}>{content}</TaskPanel>}</>;
}
