"use client";
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ImageOff } from 'lucide-react';
import { contentCopy } from '@/i18n/catalogs/features__fan_posts__ui';
import failStyles from '@/features/content-safety/ui/content.module.css';
import type { AppLocale } from '@/i18n/locales';
import { FanAction } from '@/components/fan-ui/fan-action';
import { FanSkeleton } from '@/components/fan-ui/fan-skeleton';
import { FeedVideo } from '@/components/feed-video/feed-video';
import { useGroupRequest } from './use-group-resource';
import { groupsCopy } from './copy';
export function GroupPostAsset({asset,locale,src,className}:{className?:string;src?:string;asset:{id:string;kind:'image'|'video';width?:number|null;height?:number|null};locale:AppLocale}){
 const dialog=useRef<HTMLDialogElement>(null);
 const {request,ownerKey,ready}=useGroupRequest(),[value,setValue]=useState<{key:string;url?:string;error:boolean}>(),[version,setVersion]=useState(0),key=`${ownerKey}:${src??asset.id}`,t=groupsCopy(locale);
 useEffect(()=>{
  if(!ready)return;let active=true,blobUrl:string|undefined;const controller=new AbortController();
  void request(src??`/api/groups/media/${asset.id}?variant=original`,{signal:controller.signal},'blob').then(blob=>{
   if(!(blob instanceof Blob))throw new Error('INVALID_MEDIA');
   if(!active)return;blobUrl=URL.createObjectURL(blob);setValue({key,url:blobUrl,error:false});
  }).catch(()=>{if(active)setValue({key,error:true});});
  return()=>{active=false;controller.abort();if(blobUrl)URL.revokeObjectURL(blobUrl);};
 },[request,key,ready,asset.id,src,version]);
 const current=value?.key===key?value:undefined;
 // 261107-2 9.2: a failed photo keeps its frame (stored ratio, 4:3 without one) with an icon, one line and a retry, like the fan board viewer.
 if(current?.error)return <span className={`${className??''} ${failStyles.failedBox}`} style={{'--failed-ratio':asset.width&&asset.height?`${asset.width} / ${asset.height}`:'4 / 3'} as CSSProperties}><span className={failStyles.failedFrame} role='status'><ImageOff size={24} strokeWidth={1.75} aria-hidden='true'/><span>{contentCopy(locale).photoFailed}</span><FanAction variant='text' size='sm' onClick={()=>setVersion(x=>x+1)}>{t.retry}</FanAction></span></span>;
 if(!current?.url)return <span className={className} style={{display:'block',width:asset.width??'100%',maxWidth:'100%',aspectRatio:asset.width&&asset.height?`${asset.width} / ${asset.height}`:'4 / 3'}}><FanSkeleton shape='block' width='100%' height='100%'/></span>;
 return asset.kind==='video'?<span className={className} style={{display:'block'}}><FeedVideo src={current.url} width={asset.width??9} height={asset.height??16} label={t.more}/></span>:<><button className={className} type='button' onClick={()=>dialog.current?.showModal()} aria-label={t.more} style={{display:'block',padding:0,border:0,background:'transparent',maxWidth:'100%',cursor:'zoom-in'}}><img src={current.url} alt='' width={asset.width??undefined} height={asset.height??undefined} style={{maxWidth:'100%',height:'auto',objectFit:'contain'}}/></button><dialog ref={dialog} aria-label={t.more} style={{maxWidth:'calc(100vw - 32px)',maxHeight:'calc(100dvh - 32px)',padding:16,border:'1px solid #eeecef',borderRadius:16}}><FanAction onClick={()=>dialog.current?.close()}>{t.cancel}</FanAction><img src={current.url} alt='' style={{display:'block',maxWidth:'100%',maxHeight:'80dvh',objectFit:'contain',height:'auto'}}/></dialog></>;
}
