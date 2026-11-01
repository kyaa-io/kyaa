"use client";
import { GroupImage } from "@/features/groups/ui/group-image";
import { useEffect,useState } from 'react';
import { FanAction } from '@/components/fan-ui/fan-action';
import type { AppLocale } from '@/i18n/locales';
import type { z } from 'zod';
import type { capsuleResultSchema } from './domain';
import { capsuleCopy } from './copy';
import styles from './capsule.module.css';
const opening:Record<AppLocale,string>={ko:'캡슐을 열고 있어요.',en:'Opening capsules.',ja:'カプセルを開いています。','zh-Hans':'正在打开胶囊。','zh-Hant':'正在開啟膠囊。',es:'Abriendo cápsulas.',id:'Membuka kapsul.',vi:'Đang mở viên nang.',th:'กำลังเปิดแคปซูล',pt:'Abrindo cápsulas.',fr:'Ouverture des capsules.',ru:'Открываем капсулы.'};
const skip:Record<AppLocale,string>={ko:'결과 바로 보기',en:'Skip to results',ja:'結果をすぐ見る','zh-Hans':'直接查看结果','zh-Hant':'直接查看結果',es:'Ver resultados',id:'Langsung lihat hasil',vi:'Xem ngay kết quả',th:'ดูผลทันที',pt:'Ver resultados',fr:'Voir les résultats',ru:'Сразу к результатам'};
export function CapsuleReveal({result,locale,onComplete}:{result:z.infer<typeof capsuleResultSchema>;locale:AppLocale;onComplete?:()=>void}){
 const c=capsuleCopy(locale),[phase,setPhase]=useState(0);
 useEffect(()=>{
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const timers=(reduced?[[120,3]]:[[720,1],[1120,2],[1600,3]]).map(([delay,next])=>setTimeout(()=>setPhase(next),delay));
  return()=>timers.forEach(clearTimeout);
 },[]);
 useEffect(()=>{if(phase===3)onComplete?.();},[phase,onComplete]);
 return <section className={styles.panel} aria-live='polite' data-capsule-phase={phase}><h2>{c.result}</h2>{phase<3?<><div className={styles.reveal} aria-hidden='true'><img className={phase===0?styles.machineMotion:styles.machineStill} src='/images/groups/capsule-machine.png' width={220} height={220} alt=''/><img className={phase===0?styles.hiddenCapsule:phase===1?styles.droppingCapsule:styles.openCapsule} src={phase===2?'/images/groups/capsule-open.png':'/images/groups/capsule-closed.png'} width={100} height={100} alt=''/></div><p role='status'>{opening[locale]}</p><FanAction onClick={()=>setPhase(3)}>{skip[locale]}</FanAction></>:<ol className={styles.results}>{result.results.map(item=><li key={item.index}><GroupImage locale={locale} src={item.imageUrl??'/images/groups/capsule-open.png'} alt='' width={80} height={80}/><strong>{item.name??c.blank}</strong></li>)}</ol>}</section>;
}
