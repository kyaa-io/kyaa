'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {CircleHelp} from 'lucide-react';
import styles from './help-hint.module.css';

/**
 * ? 도움말. 클릭하면 고정되고, 호버(마우스만)·포커스로도 열린다. 터치는 탭으로 열고 다시 탭하면 닫힌다. Esc는 닫고 트리거로 포커스를 돌려준다.
 * 팝오버는 가장 가까운 position:relative 조상(카드)의 안쪽 폭에 맞춰 열리므로 390px에서도 화면 밖으로 나가지 않는다.
 */
export function HelpHint({label,text}:{label:string;text:string}){
 const id=useId(),root=useRef<HTMLSpanElement>(null),trigger=useRef<HTMLButtonElement>(null),skip=useRef(false),byPointer=useRef(false),[pinned,setPinned]=useState(false),[hover,setHover]=useState(false),[focus,setFocus]=useState(false),open=pinned||hover||focus;
 useEffect(()=>{
  if(!open)return;
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setPinned(false);setHover(false);setFocus(false);skip.current=true;trigger.current?.focus();skip.current=false;}};
  const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node)){setPinned(false);setHover(false);setFocus(false);}};
  document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);
  return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);};
 },[open]);
 return <span ref={root} className={styles.root} onPointerEnter={e=>{if(e.pointerType==='mouse')setHover(true);}} onPointerLeave={e=>{if(e.pointerType==='mouse')setHover(false);}}>
  <button ref={trigger} type='button' className={styles.trigger} aria-label={label} aria-expanded={open} aria-controls={id} aria-describedby={open?id:undefined} onClick={()=>setPinned(v=>!v)} onPointerDown={()=>{byPointer.current=true;}} onFocus={()=>{const p=byPointer.current;byPointer.current=false;if(!skip.current&&!p)setFocus(true);}} onBlur={()=>setFocus(false)}><CircleHelp size={16} aria-hidden='true'/></button>
  <small id={id} role='tooltip' className={styles.popover} hidden={!open}>{text}</small>
 </span>;
}
