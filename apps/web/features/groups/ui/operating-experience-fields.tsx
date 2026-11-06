"use client";
import {useId,useRef,useState,type ReactNode} from 'react';
import {FanAction} from '@/components/fan-ui/fan-action';
import {useWaveMediaUpload} from '@/features/content-safety/ui/use-wave-media-upload';
import type {AppLocale} from '@/i18n/locales';
import {operatingExperienceSchema,type GroupQualification} from '../domain/qualification';
import {groupsCopy} from './copy';
import {groupApplyText} from './group-apply-copy';
import {GroupImage} from './group-image';
import {managementCopy} from './management-copy';
import styles from './operating-experience-fields.module.css';
type Answer=Extract<GroupQualification,{hasExistingPage:boolean}>;
const MAX_CAPTURES=3;
/** The operating experience question of an application: its fields, and reading the answer the server accepts. */
export function useOperatingExperience({locale,disabled=false,initial}:{locale:AppLocale;disabled?:boolean;initial?:Answer|null}):{node:ReactNode;busy:boolean;blocked:boolean;read:()=>Answer|null;markUsed:()=>void}{
 const t=groupsCopy(locale),m=managementCopy(locale),id=useId(),link=useRef<HTMLInputElement>(null),uploads=useWaveMediaUpload('group_image',MAX_CAPTURES);
 const initialYes=initial?.hasExistingPage?initial:null;
 const [checked,setChecked]=useState(Boolean(initialYes)),[url,setUrl]=useState(initialYes?.evidenceUrl??''),[retained,setRetained]=useState(initialYes?.assetIds??[]),[linkError,setLinkError]=useState(false),[captureError,setCaptureError]=useState(false);
 const failed=uploads.items.some(item=>item.failed),count=retained.length+uploads.items.length;
 const read=():Answer|null=>{
  if(!checked)return {hasExistingPage:false};
  const answer=operatingExperienceSchema.safeParse({hasExistingPage:true,evidenceUrl:url,assetIds:[...retained,...uploads.items.map(item=>item.assetId)]});
  if(answer.success){setLinkError(false);setCaptureError(false);return answer.data;}
  // A placeholder capture isolates the link from the capture count, so each message names its own field.
  const badLink=!operatingExperienceSchema.safeParse({hasExistingPage:true,evidenceUrl:url,assetIds:['00000000-0000-4000-8000-000000000000']}).success;
  setLinkError(badLink);setCaptureError(count===0);
  if(badLink)link.current?.focus();
  return null;
 };
 const node=<div className={styles.block}>
  <label className={styles.question}><input type='checkbox' checked={checked} disabled={disabled} onChange={event=>setChecked(event.target.checked)}/>{groupApplyText(locale,'existingPageQuestion')}</label>
  {checked&&<div className={styles.details}>
   <div className={styles.row}><label htmlFor={`${id}-link`}>{groupApplyText(locale,'existingPageLink')}</label><input ref={link} id={`${id}-link`} name='evidenceUrl' inputMode='url' autoCapitalize='off' autoCorrect='off' maxLength={2048} placeholder='https://' value={url} disabled={disabled} aria-invalid={linkError||undefined} aria-describedby={linkError?`${id}-link-error`:undefined} onChange={event=>{setUrl(event.target.value);setLinkError(false);}}/>{linkError&&<p id={`${id}-link-error`} role='alert' className={styles.error}>{groupApplyText(locale,'linkInvalid')}</p>}</div>
   <div className={styles.row}><span>{groupApplyText(locale,'existingPageCapture')}</span>
    {count>0&&<ul className={styles.captures}>
     {retained.map(asset=><li key={asset}><GroupImage locale={locale} src={`/api/groups/images/${asset}`} alt='' width={96} height={72}/><FanAction disabled={disabled} onClick={()=>setRetained(current=>current.filter(value=>value!==asset))}>{m.remove}</FanAction></li>)}
     {uploads.items.map(item=><li key={item.key}><span className={styles.fileName}>{item.file.name}</span>{item.failed?<FanAction disabled={disabled} onClick={()=>uploads.retry(item)}>{t.retry}</FanAction>:!uploads.ready&&<span role='status'>{t.loading}</span>}<FanAction disabled={disabled} onClick={()=>uploads.remove(item.key)}>{m.remove}</FanAction></li>)}
    </ul>}
    <label className={styles.addCapture} data-disabled={disabled||count>=MAX_CAPTURES||undefined}>{groupApplyText(locale,'addCapture')}<input type='file' accept='image/jpeg,image/png,image/webp' multiple disabled={disabled||uploads.busy||count>=MAX_CAPTURES} onChange={event=>{uploads.add(Array.from(event.currentTarget.files??[]).slice(0,MAX_CAPTURES-count));event.currentTarget.value='';setCaptureError(false);}}/></label>
    {captureError&&<p role='alert' className={styles.error}>{groupApplyText(locale,'captureRequired')}</p>}
    {(uploads.invalid||failed)&&<p role='alert' className={styles.error}>{t.error}</p>}
   </div>
  </div>}
 </div>;
 return {node,busy:uploads.busy,blocked:checked&&(uploads.busy||failed||(uploads.items.length>0&&!uploads.ready)),read,markUsed:()=>{for(const item of uploads.items)uploads.markUsed(item.key);}};
}
