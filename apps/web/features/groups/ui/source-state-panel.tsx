'use client';
import type {CSSProperties,ReactNode} from 'react';
import {FanAction} from '@/components/fan-ui/fan-action';
import styles from './source-state-panel.module.css';
import {EmptyIllustration,type EmptyIllustrationKind} from './empty-illustration';
export type SourceStateAction={label:string;href?:string;onClick?:()=>void;variant?:'primary'|'neutral'|'text';disabled?:boolean;busy?:boolean;icon?:ReactNode};
export type SourceStatePanelProps={title:string;description?:ReactNode;children?:ReactNode;icon?:ReactNode;feedback?:'danger'|'success'|'neutral';actions?:readonly SourceStateAction[];actionLayout?:'row'|'column';role?:'alert'|'status';sourceId?:string;className?:string;style?:CSSProperties;illustration?:EmptyIllustrationKind;size?:'compact'|'regular'};
/** Presentation only. Feature callers own API state, localized copy and immutable retries. */
export function SourceStatePanel({title,description,children,icon,feedback,actions=[],actionLayout='column',role,sourceId,className,style,illustration,size='regular'}:SourceStatePanelProps){
 return <section className={[styles.panel,className].filter(Boolean).join(' ')} style={style} role={role} data-source-state={sourceId} data-empty-art={illustration?size:undefined}>
  {illustration&&<EmptyIllustration kind={illustration} size={size}/>}
  {feedback? <>{icon&&<span className={styles.feedback} data-kind={feedback} aria-hidden>{icon}</span>}<h2 className={styles.title}>{title}</h2></>:<header className={styles.heading}>{icon&&<span aria-hidden>{icon}</span>}<h2 className={styles.title}>{title}</h2></header>}
  {description&&<div className={styles.description}>{description}</div>}{children}
  {actions.length>0&&<div className={styles.actions} data-layout={actionLayout}>{actions.map((action,index)=>action.href?<FanAction key={`${index}-${action.label}`} className={styles.action} variant={action.variant??'neutral'} href={action.href} leadingIcon={action.icon}>{action.label}</FanAction>:<FanAction key={`${index}-${action.label}`} className={styles.action} variant={action.variant??'neutral'} onClick={action.onClick} disabled={action.disabled} ariaBusy={action.busy} leadingIcon={action.icon}>{action.label}</FanAction>)}</div>}
 </section>;
}
