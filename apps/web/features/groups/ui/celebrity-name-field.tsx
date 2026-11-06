"use client";
import {useEffect,useId,useState,type KeyboardEvent} from 'react';
import {z} from 'zod';
import {FanAction} from '@/components/fan-ui/fan-action';
import {FanTag} from '@/components/fan-ui/fan-tag';
import {creatorRoleFilterLabel} from '@/features/creator/domain/creator-role';
import type {AppLocale} from '@/i18n/locales';
import {groupApplyText} from './group-apply-copy';
import {useGroupResource} from './use-group-resource';
import styles from './celebrity-name-field.module.css';
const suggestion=z.object({name:z.string(),secondaryName:z.string().nullable(),category:z.enum(['idol','singer','actor','creator']).nullable(),page:z.object({slug:z.string()}).nullable()});
type Suggestion=z.infer<typeof suggestion>;
const parse=(value:unknown)=>z.object({items:z.array(suggestion)}).parse(value);
const DELAY_MS=200,MAX_NAME=100;
/** A plain text field with suggestions. Any typed name is valid, so a failed or empty suggestion read changes nothing. */
export function CelebrityNameField({locale,label,initialValue='',disabled=false}:{locale:AppLocale;label:string;initialValue?:string;disabled?:boolean}){
 const listId=useId(),[value,setValue]=useState(initialValue),[query,setQuery]=useState(''),[open,setOpen]=useState(false),[active,setActive]=useState(-1),[picked,setPicked]=useState<Suggestion|null>(null),[shown,setShown]=useState<Suggestion[]>([]);
 useEffect(()=>{const timer=window.setTimeout(()=>setQuery(value.trim()),DELAY_MS);return()=>window.clearTimeout(timer);},[value]);
 const resource=useGroupResource(query?`/api/celebrities/suggest?q=${encodeURIComponent(query)}&locale=${locale}`:null,parse);
 const answer=resource.data?.items;
 if(answer&&answer!==shown&&query)setShown(answer);
 const items=value.trim()?shown:[],expanded=open&&items.length>0;
 const choose=(item:Suggestion)=>{setValue(item.name.slice(0,MAX_NAME));setPicked(item);setOpen(false);setActive(-1);};
 const onKeyDown=(event:KeyboardEvent<HTMLInputElement>)=>{
  if(event.nativeEvent.isComposing)return;
  if(event.key==='Escape'&&expanded){event.preventDefault();event.stopPropagation();setOpen(false);setActive(-1);return;}
  if(event.key==='Enter'&&expanded&&active>=0){event.preventDefault();choose(items[active]);return;}
  if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
  if(!items.length)return;
  event.preventDefault();setOpen(true);
  const step=event.key==='ArrowDown'?1:-1;
  setActive(current=>current+step>=items.length?0:current+step<0?items.length-1:current+step);
 };
 return <div className={styles.field}><label className={styles.label} htmlFor={`${listId}-input`}>{label}</label>
  <div className={styles.anchor}>
   <input id={`${listId}-input`} className={styles.input} name='name' required maxLength={MAX_NAME} autoComplete='off' disabled={disabled} role='combobox' aria-autocomplete='list' aria-expanded={expanded} aria-controls={`${listId}-list`} aria-activedescendant={expanded&&active>=0?`${listId}-option-${active}`:undefined} value={value} onChange={event=>{setValue(event.target.value);setPicked(null);setOpen(true);setActive(-1);}} onFocus={()=>setOpen(true)} onBlur={()=>{setOpen(false);setActive(-1);}} onKeyDown={onKeyDown}/>
   <ul id={`${listId}-list`} role='listbox' aria-label={groupApplyText(locale,'nameSuggestions')} className={styles.list} hidden={!expanded}>
    {items.map((item,index)=><li key={`${item.name}:${item.category}:${item.page?.slug}`} id={`${listId}-option-${index}`} role='option' aria-selected={index===active} className={styles.option} data-active={index===active||undefined} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(item)}>
     <span className={styles.names}><strong>{item.name}</strong>{item.secondaryName&&<span>{item.secondaryName}</span>}</span>
     {item.page?<FanTag tone='fan'>{groupApplyText(locale,'pageExistsTag')}</FanTag>:item.category&&<FanTag tone='neutral'>{creatorRoleFilterLabel(item.category,locale)}</FanTag>}
    </li>)}
   </ul>
  </div>
  {picked?.page&&<p className={styles.exists}>{groupApplyText(locale,'pageExistsNote')} <FanAction variant='text' href={`/${picked.page.slug}?locale=${locale}`}>{groupApplyText(locale,'viewPage')}</FanAction></p>}
 </div>;
}
