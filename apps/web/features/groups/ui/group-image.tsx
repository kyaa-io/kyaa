"use client";
import { useEffect,useState,type ImgHTMLAttributes } from 'react';
import { ImageOff,LoaderCircle } from 'lucide-react';
import type { AppLocale } from '@/i18n/locales';
import { useGroupRequest } from './use-group-resource';
import { groupsCopy } from './copy';
type Props=Omit<ImgHTMLAttributes<HTMLImageElement>,'src'>&{src:string;locale:AppLocale};
/** Canonical group images retain their server ACL, including unpublished images. */
export function GroupImage({locale,...props}:Props){
 return props.src.startsWith('/api/groups/images/')?<ProtectedGroupImage {...props} locale={locale}/>:<img {...props} alt={props.alt??''}/>;
}
function ProtectedGroupImage({locale,...props}:Props){
 const {request,ownerKey,ready}=useGroupRequest(),[value,setValue]=useState<{key:string;url?:string;error:boolean}>(),key=`${ownerKey}:${props.src}`,t=groupsCopy(locale);
 useEffect(()=>{if(!ready)return;let active=true,url:string|undefined;const controller=new AbortController();void request(props.src,{signal:controller.signal},'blob').then(blob=>{if(!(blob instanceof Blob))throw new Error('INVALID_GROUP_IMAGE');if(!active)return;url=URL.createObjectURL(blob);setValue({key,url,error:false});}).catch(()=>{if(active)setValue({key,error:true});});return()=>{active=false;controller.abort();if(url)URL.revokeObjectURL(url);};},[key,ready,request,props.src]);
 const current=value?.key===key?value:undefined;
 if(current?.url)return <img {...props} src={current.url} alt={props.alt??''}/>;
 const Icon=current?.error?ImageOff:LoaderCircle;
 return <span role='img' aria-label={current?.error?t.error:t.loading} className={props.className} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:props.width,height:props.height,...props.style}}><Icon size={24} aria-hidden='true'/></span>;
}
