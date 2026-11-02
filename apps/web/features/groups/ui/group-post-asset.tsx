"use client";
import { useEffect, useRef, useState } from 'react';
import type { AppLocale } from '@/i18n/locales';
import { FanAction } from '@/components/fan-ui/fan-action';
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
 if(current?.error)return <FanAction onClick={()=>setVersion(x=>x+1)}>{t.retry}</FanAction>;
 if(!current?.url)return <p role='status'>{t.loading}</p>;
 return asset.kind==='video'?<video className={className} controls preload='metadata' src={current.url} style={{maxWidth:'100%',height:'auto',maxHeight:480}}/>:<><button className={className} type='button' onClick={()=>dialog.current?.showModal()} aria-label={t.more} style={{display:'block',padding:0,border:0,background:'transparent',maxWidth:'100%',cursor:'zoom-in'}}><img src={current.url} alt='' width={asset.width??undefined} height={asset.height??undefined} style={{maxWidth:'100%',height:'auto',objectFit:'contain'}}/></button><dialog ref={dialog} aria-label={t.more} style={{maxWidth:'calc(100vw - 32px)',maxHeight:'calc(100dvh - 32px)',padding:16,border:'1px solid #eeecef',borderRadius:16}}><FanAction onClick={()=>dialog.current?.close()}>{t.cancel}</FanAction><img src={current.url} alt='' style={{display:'block',maxWidth:'100%',maxHeight:'80dvh',objectFit:'contain',height:'auto'}}/></dialog></>;
}
