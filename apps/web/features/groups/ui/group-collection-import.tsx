'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {CircleAlert} from 'lucide-react';
import {z} from 'zod';
import type {AppLocale} from '@/i18n/locales';
import {FanAction} from '@/components/fan-ui/fan-action';
import {useWaveMediaUpload} from '@/features/content-safety/ui/use-wave-media-upload';
import {GroupRequestError,useGroupRequest} from './use-group-resource';
import {GroupImageField,imageAssetInput} from './group-image-field';
import {SourceStatePanel} from './source-state-panel';
import {groupsCopy} from './copy';import {activitiesCopy} from './activities-copy';import {managementCopy} from './management-copy';
import {collectionImportCopy} from './collection-import-copy';
import styles from './groups.module.css';import sourceStyles from './group-collection-import.module.css';
type Props={pageId:string;locale:AppLocale;initial?:{id:string;title:string;imageUrl:string|null;externalUrl:string;status:'active'|'sold_out'|'hidden';revision:number};done?:()=>void};
const metadata=z.object({title:z.string().min(1).max(200),imageUrl:z.url(),externalUrl:z.string()}).strict();
export function GroupCollectionImportEditor(props:Props){const auth=useGroupRequest();return <CollectionEditor key={`${auth.ownerKey}:${props.pageId}:${props.initial?.id??'new'}`} {...props}/>;}
function CollectionEditor({pageId,locale,initial,done=()=>{}}:Props){
 const auth=useGroupRequest(),upload=useWaveMediaUpload('group_image',1),form=useRef<HTMLFormElement>(null),controller=useRef<AbortController|null>(null),alive=useRef(true),operation=useRef<{key:string;id:string}|undefined>(undefined),remoteFor=useRef('');
 const [url,setUrl]=useState(initial?.externalUrl??''),[title,setTitle]=useState(initial?.title??''),[image,setImage]=useState(''),[mode,setMode]=useState<'idle'|'loaded'|'failed'>('idle'),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[imageReady,setImageReady]=useState(true),[waiting,setWaiting]=useState(false);
 const t=groupsCopy(locale),c=activitiesCopy(locale),m=managementCopy(locale),copy=collectionImportCopy(locale),task=upload.items[0],locked=busy||upload.busy;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
 useEffect(()=>{if(waiting&&upload.ready&&!busy){setWaiting(false);form.current?.requestSubmit();}},[waiting,upload.ready,busy]);
 async function lookup(){if(locked||!form.current?.elements.namedItem('externalUrl'))return;const field=form.current.elements.namedItem('externalUrl') as HTMLInputElement;if(!field.reportValidity())return;controller.current?.abort();const abort=new AbortController();controller.current=abort;setBusy(true);setFailed(false);try{const result=metadata.parse(await auth.request(`/api/groups/${pageId}/collections/import`,{method:'POST',signal:abort.signal,body:JSON.stringify({kind:'lookup',url})}));if(!alive.current||abort.signal.aborted)return;setTitle(result.title);setImage(result.imageUrl);setMode('loaded');remoteFor.current='';if(task)upload.remove(task.key);}catch(error){if(alive.current&&!abort.signal.aborted){if(error instanceof GroupRequestError&&[401,403,409,429].includes(error.status))setFailed(true);else setMode('failed');}}finally{if(alive.current&&!abort.signal.aborted)setBusy(false);}}
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(locked||(mode==='idle'&&!imageReady))return;const abort=new AbortController();controller.current=abort;setBusy(true);setFailed(false);try{
  if(mode!=='idle'&&image&&(!task||remoteFor.current!==image)){
   const blob=await auth.request(`/api/groups/${pageId}/collections/import`,{method:'POST',signal:abort.signal,body:JSON.stringify({kind:'image',url:image})},'blob') as Blob;
   if(!alive.current||abort.signal.aborted)return;if(blob.type!=='image/webp'||blob.size===0||blob.size>8*1024*1024)throw new Error('INVALID_IMAGE');
   remoteFor.current=image;setWaiting(true);upload.add([new File([blob],'collection.webp',{type:'image/webp'})],task?.key);return;
  }
  if(mode!=='idle'&&image&&!upload.ready)throw new Error('IMAGE_NOT_READY');
  const f=new FormData(form.current!),input={expectedRevision:initial?.revision,title,imageAssetId:mode!=='idle'&&image?task?.assetId:imageAssetInput(f),externalUrl:url,status:f.get('status')},path=`/api/groups/${pageId}/collections${initial?`/${initial.id}`:''}`,key=JSON.stringify([path,input]);
  if(operation.current?.key!==key)operation.current={key,id:crypto.randomUUID()};
  z.object({id:z.uuid()}).parse(await auth.request(path,{method:initial?'PATCH':'POST',signal:abort.signal,body:JSON.stringify({...input,requestId:operation.current.id})}));
  if(!alive.current||abort.signal.aborted)return;operation.current=undefined;if(task)upload.markUsed(task.key);done();
 }catch{if(alive.current&&!abort.signal.aborted){setWaiting(false);setFailed(true);}}finally{if(alive.current&&!abort.signal.aborted)setBusy(false);}}
 const fields=<div className={sourceStyles.fields}><label className={sourceStyles.field}>{copy.name}<input name='title' required maxLength={200} value={title} placeholder={copy.namePlaceholder} disabled={locked} onChange={e=>setTitle(e.target.value)}/></label><label className={sourceStyles.field}>{copy.image}<input name='imageUrl' type='url' required value={image} placeholder={copy.imagePlaceholder} disabled={locked} onChange={e=>{setImage(e.target.value);setWaiting(false);}}/></label></div>;
 return <section className={styles.panel}><h2>{c.createCollection}</h2><form ref={form} className={styles.form} onSubmit={submit}><label className={styles.field}>{copy.url}<input name='externalUrl' type='url' className={styles.input} required value={url} disabled={locked} onChange={e=>setUrl(e.target.value)}/></label><FanAction disabled={locked||!url} onClick={()=>void lookup()}>{copy.lookup}</FanAction><select name='status' className={styles.select} defaultValue={initial?.status??'hidden'} disabled={locked} aria-label={t.collection}><option value='active'>{c.active}</option><option value='sold_out'>{c.soldOut}</option><option value='hidden'>{c.hidden}</option></select>
 {mode==='failed'?<SourceStatePanel sourceId='kgWAV' className={sourceStyles.fallback} icon={<CircleAlert size={24}/>} title={copy.failed} description={copy.manual} actions={[{label:copy.save,onClick:()=>form.current?.requestSubmit(),disabled:locked,variant:'primary'}]}>{fields}</SourceStatePanel>:mode==='loaded'?fields:<><label className={styles.field}>{m.title}<input name='title' className={styles.input} required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} disabled={locked}/></label><GroupImageField locale={locale} initialUrl={initial?.imageUrl} disabled={locked} onReadyChange={setImageReady}/></>}
 {task?.failed&&<FanAction onClick={()=>{setWaiting(true);upload.retry(task);}} disabled={locked}>{t.retry}</FanAction>}{upload.busy&&<p role='status'>{t.loading}</p>}{failed&&<SourceStatePanel sourceId='dhhrY' title={locale==='ko'?'컬렉션을 저장하지 못했어요':t.error} description={t.error} role='alert' actions={[{label:locale==='ko'?'컬렉션 다시 저장':t.retry,onClick:()=>form.current?.requestSubmit(),disabled:locked||Boolean(task?.failed),variant:'primary'}]}/>}{mode!=='failed'&&<FanAction type='submit' disabled={locked||(mode==='idle'&&!imageReady)}>{initial?m.save:c.createCollection}</FanAction>}</form></section>;
}
