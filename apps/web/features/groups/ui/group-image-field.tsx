"use client";
import { useEffect,useLayoutEffect,useState } from 'react';
import { Camera,ImagePlus } from 'lucide-react';
import type { AppLocale } from '@/i18n/locales';
import { FanAction } from '@/components/fan-ui/fan-action';
import { useWaveMediaUpload } from '@/features/content-safety/ui/use-wave-media-upload';
import { GroupImage } from "./group-image";
import { groupsCopy } from './copy';
import { managementCopy } from './management-copy';
import styles from './groups.module.css';
const photoLabel:Record<AppLocale,string>={ko:'사진 변경',en:'Change photo',ja:'写真を変更','zh-Hans':'更换照片','zh-Hant':'更換照片',es:'Cambiar foto',id:'Ganti foto',vi:'Đổi ảnh',th:'เปลี่ยนรูป',pt:'Alterar foto',fr:'Changer la photo',ru:'Изменить фото'};
export function GroupImageField({locale,initialUrl,disabled=false,onReadyChange}:{locale:AppLocale;initialUrl?:string|null;disabled?:boolean;onReadyChange:(ready:boolean)=>void}){
 const t=groupsCopy(locale),m=managementCopy(locale),upload=useWaveMediaUpload('group_image',1),[deleted,setDeleted]=useState(false),[preview,setPreview]=useState<{file:File;url:string}>(),task=upload.items[0],ready=!task||Boolean(upload.ready&&!upload.busy&&!task.failed);
 useLayoutEffect(()=>{onReadyChange(ready);},[ready,onReadyChange]);
 useEffect(()=>{if(!task)return;const url=URL.createObjectURL(task.file);setPreview({file:task.file,url});return()=>URL.revokeObjectURL(url);},[task]);
 const url=task&&preview?.file===task.file?preview.url:!deleted?initialUrl:undefined;
 return <div className={styles.field}><div className={styles.imageUpload}>{url?<GroupImage locale={locale} className={styles.imageThumb} src={url} width={64} height={64} alt=''/>:<span className={styles.imageThumb}><ImagePlus size={28} aria-hidden='true'/></span>}<div className={styles.imageActions}><label className={styles.imagePicker}><Camera size={16} aria-hidden="true"/>{photoLabel[locale]}<input className={styles.fileInput} type='file' accept='image/jpeg,image/png,image/webp' disabled={disabled||upload.busy||Boolean(task)} onChange={event=>{const file=event.target.files?.[0];if(file){setDeleted(false);upload.add([file]);}event.target.value='';}}/></label>{(url||task)&&<FanAction disabled={disabled||upload.busy} onClick={()=>{if(task){upload.remove(task.key);setDeleted(false);}else setDeleted(true);}}>{m.remove}</FanAction>}</div></div>{task?.failed&&<FanAction disabled={disabled} onClick={()=>upload.retry(task)}>{t.retry}</FanAction>}{upload.invalid&&<p role='alert'>{t.error}</p>}{task&&!ready&&<p role={task.failed?'alert':'status'}>{task.failed?t.error:t.loading}</p>}<input type='hidden' name='imageAssetId' disabled={!task&&!deleted} value={task?.assetId??''}/></div>;
}
export function imageAssetInput(form:FormData){return form.has('imageAssetId')?String(form.get('imageAssetId'))||null:undefined;}
