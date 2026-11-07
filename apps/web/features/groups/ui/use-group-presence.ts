"use client";
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { z } from 'zod';
import { GroupRequestError, useGroupRequest } from './use-group-resource';

const presenceSchema = z.object({
 onlineCount:z.number().int().nonnegative(), todayCount:z.number().int().nonnegative(),
 artists:z.array(z.object({profileId:z.uuid(),nickname:z.string(),online:z.boolean(),visitedToday:z.boolean()})),
});
type Presence = z.infer<typeof presenceSchema>;

export type GroupPresenceResult = {data?:Presence;error:boolean;retry:()=>void};
/** Set by GroupPageProvider: every reader under the frame shares its one heartbeat and read. */
export const GroupPresenceContext = createContext<{pageId:string;result:GroupPresenceResult}|null>(null);

export function useGroupPresence(pageId:string|null, heartbeat=true, membership=false):GroupPresenceResult {
 const shared=useContext(GroupPresenceContext);
 const own=useOwnGroupPresence(shared&&shared.pageId===pageId?null:pageId,heartbeat,membership);
 return shared&&shared.pageId===pageId?shared.result:own;
}

/** The provider's own read. It must not join the shared value it is about to publish. */
export function useOwnGroupPresence(pageId:string|null, heartbeat=true, membership=false):GroupPresenceResult {
 const {request,ready,authenticated,ownerKey}=useGroupRequest();
 const key=`${ownerKey}:${pageId}`;
 const [snapshot,setSnapshot]=useState<{key:string;data?:Presence;error:boolean}>();
 const [version,setVersion]=useState(0);
 const retry=useCallback(()=>setVersion(value=>value+1),[]);
 useEffect(()=>{
  if(!ready||!pageId)return;
  let disposed=false,blocked=false,unconfigured=false,controller:AbortController|undefined;
  const url=`/api/groups/${pageId}/presence`;
  const suspend=()=>{controller?.abort();controller=undefined;setSnapshot({key,error:!navigator.onLine});};
  const refresh=async()=>{
   if(disposed||unconfigured)return;
   if(!navigator.onLine||document.visibilityState==='hidden'){suspend();return;}
   if(controller)return;
   const current=new AbortController();controller=current;
   try {
    if(heartbeat&&membership&&authenticated&&!blocked){
     try{await request(url,{method:'PUT',signal:current.signal});}
     catch(error){
      if(error instanceof GroupRequestError&&[401,403,404].includes(error.status))blocked=true;
      else throw error;
     }
    }
    let result:unknown;
    try{result=await request(url,{signal:current.signal});}
    catch(error){
     if(current.signal.aborted||error instanceof GroupRequestError&&(error.code==='LOCAL_PRESENCE_TRANSPORT_UNAVAILABLE'||[401,403,404].includes(error.status)))throw error;
     result=await request(url,{signal:current.signal});
    }
    const data=presenceSchema.parse(result);
    if(!disposed&&!current.signal.aborted)setSnapshot({key,data,error:false});
   }catch(error){if(error instanceof GroupRequestError&&error.code==='LOCAL_PRESENCE_TRANSPORT_UNAVAILABLE')unconfigured=true;if(!disposed&&!current.signal.aborted)setSnapshot({key,error:true});}
   finally{if(controller===current)controller=undefined;}
  };
  // Page/account rows expire server-side after 90s; never delete another tab's presence on exit.
  const resume=()=>{if(unconfigured)return;suspend();void refresh();};
  void refresh();
  const timer=setInterval(()=>void refresh(),30000);
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('online',resume);
  window.addEventListener('offline',suspend);
  window.addEventListener('pageshow',resume);
  window.addEventListener('pagehide',suspend);
  return()=>{disposed=true;controller?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);window.removeEventListener('offline',suspend);window.removeEventListener('pageshow',resume);window.removeEventListener('pagehide',suspend);};
 },[key,pageId,request,ready,authenticated,heartbeat,membership,version]);
 const current=ready&&snapshot?.key===key?snapshot:undefined;
 return {data:current?.data,error:current?.error??false,retry};
}
