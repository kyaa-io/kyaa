"use client";
import {useEffect,useRef,type CSSProperties,type ReactNode} from 'react';
import {X} from 'lucide-react';
import './task-panel.css';
export type TaskPanelProps={nodeId?:string;title:string;mode?:'auto'|'modal'|'sheet'|'fullscreen';width?:number;header?:ReactNode;children:ReactNode;actions?:ReactNode;onClose:()=>void;className?:string;closeLabel?:string};
/** Shared Pencil task shell. Header/body/action slots own their extracted padding. */
export function TaskPanel({nodeId,title,mode='auto',width=560,header,children,actions,onClose,className,closeLabel='닫기'}:TaskPanelProps){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current,previous=document.activeElement instanceof HTMLElement?document.activeElement:null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog?.showModal();(dialog?.querySelector<HTMLElement>('.sourceTaskDefaultHeader h2')??dialog)?.focus({preventScroll:true});return()=>{dialog?.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
 return <dialog ref={ref} className={`sourceTaskPanel ${className??''}`} data-source-node={nodeId} data-source-task={nodeId??''} data-mode={mode} style={{'--source-task-width':`${width}px`} as CSSProperties} aria-label={title} onCancel={event=>{event.preventDefault();onClose();}} onKeyDown={event=>{if(event.key!=='Tab')return;const dialog=ref.current;if(!dialog)return;const items=[...dialog.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]')].filter(el=>!el.hasAttribute('disabled')&&el.tabIndex>=0&&!el.hidden&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden');const first=items[0],last=items.at(-1);if(!first){event.preventDefault();dialog.focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}}>
 <div className='sourceTaskHandle' aria-hidden='true'><span/></div>
 {header===undefined?<header className='sourceTaskDefaultHeader'><h2 tabIndex={-1}>{title}</h2><button type='button' aria-label={closeLabel} onClick={onClose}><X size={20}/></button></header>:<div className='sourceTaskHeaderSlot'>{header}</div>}
 <div className='sourceTaskScroll'>{children}</div>
 {actions!==undefined&&<div className='sourceTaskActionSlot'>{actions}</div>}
 </dialog>;
}
export function TaskActions({children,className}:{children:ReactNode;className?:string}){return <footer className={`sourceTaskActions ${className??''}`}>{children}</footer>;}
