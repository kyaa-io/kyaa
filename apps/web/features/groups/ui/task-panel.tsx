"use client";
import {useEffect,useLayoutEffect,useRef,type CSSProperties,type ReactNode} from 'react';
import {X} from 'lucide-react';
import './task-panel.css';
export type TaskPanelProps={nodeId?:string;title:string;mode?:'auto'|'modal'|'sheet'|'fullscreen';width?:number;header?:ReactNode;children:ReactNode;actions?:ReactNode;onClose:()=>void;className?:string;closeLabel?:string;confirmation?:Omit<TaskPanelProps,'confirmation'>};
/** Shared Pencil task shell. Header/body/action slots own their extracted padding. */
export function TaskPanel({confirmation,...editor}:TaskPanelProps){
 const {nodeId,title,mode='auto',width=560,header,onClose,className,closeLabel='닫기'}=confirmation??editor;
 const ref=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),editorFocus=useRef<HTMLElement|null>(null),wasConfirming=useRef(false),confirming=Boolean(confirmation);
 useLayoutEffect(()=>{if(wasConfirming.current===confirming)return;wasConfirming.current=confirming;if(confirming)heading.current?.focus({preventScroll:true});else if(editorFocus.current?.isConnected)editorFocus.current.focus({preventScroll:true});},[confirming]);
 useEffect(()=>{const dialog=ref.current,previous=document.activeElement instanceof HTMLElement?document.activeElement:null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog?.showModal();(dialog?.querySelector<HTMLElement>('.sourceTaskDefaultHeader h2')??dialog)?.focus({preventScroll:true});return()=>{dialog?.close();document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus({preventScroll:true});};},[]);
 // Repeated native Escape requests can be non-cancelable; own the key before the browser closes.
 return <dialog ref={ref} className={`sourceTaskPanel ${className??''}`} data-source-node={nodeId} data-source-task={nodeId??''} data-mode={mode} style={{'--source-task-width':`${width}px`} as CSSProperties} aria-label={title} onFocusCapture={event=>{if(!confirming)editorFocus.current=event.target;}} onCancel={event=>{event.preventDefault();onClose();}} onKeyDown={event=>{if(event.defaultPrevented)return;if(event.key==='Escape'&&!event.nativeEvent.isComposing){event.preventDefault();onClose();return;}if(event.key!=='Tab')return;const dialog=ref.current;if(!dialog)return;const items=[...dialog.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]')].filter(el=>!el.hasAttribute('disabled')&&el.tabIndex>=0&&!el.closest('[hidden]')&&getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden');const first=items[0],last=items.at(-1);if(!first){event.preventDefault();dialog.focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}}>
 <div className='sourceTaskHandle' aria-hidden='true'><span/></div>
 {header===undefined?<header className='sourceTaskDefaultHeader'><h2 ref={heading} tabIndex={-1}>{title}</h2><button type='button' aria-label={closeLabel} onClick={onClose}><X size={20}/></button></header>:<div className='sourceTaskHeaderSlot'>{header}</div>}
 {/* Keep uncontrolled fields and upload selections mounted while confirming. */}
 <div className='sourceTaskScroll' hidden={confirming} style={confirming?{display:'none'}:undefined}>{editor.children}</div>
 {editor.actions!==undefined&&<div className='sourceTaskActionSlot' hidden={confirming} style={confirming?{display:'none'}:undefined}>{editor.actions}</div>}
 {confirmation&&<><div className='sourceTaskScroll'>{confirmation.children}</div>{confirmation.actions!==undefined&&<div className='sourceTaskActionSlot'>{confirmation.actions}</div>}</>}
 </dialog>;
}
export function TaskActions({children,className}:{children:ReactNode;className?:string}){return <footer className={`sourceTaskActions ${className??''}`}>{children}</footer>;}
