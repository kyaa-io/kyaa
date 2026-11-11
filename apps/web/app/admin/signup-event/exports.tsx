'use client';
import { useRef, useState } from 'react';
import { useByUsAuth } from '@/features/auth/client/cognito-auth';
import { FanAction } from '@/components/fan-ui/fan-action';
export function SignupEventExports() {
 const auth=useByUsAuth();
 const [pending,setPending]=useState(false),[error,setError]=useState('');
 const requestId=useRef<string|null>(null);
 async function download(draw:boolean) {
  if(!auth.authenticated){auth.login();return;}
  setPending(true);setError('');
  try {
   const token=await auth.getAccessToken();if(!token)throw new Error('auth');
   if(draw)requestId.current??=crypto.randomUUID();
   const response=await fetch('/api/admin/signup-event',{method:draw?'POST':'GET',headers:{authorization:`Bearer ${token}`,...(draw?{'content-type':'application/json'}:{})},...(draw?{body:JSON.stringify({quantity:17,requestId:requestId.current})}:{})});
   if(!response.ok)throw new Error('export');
   const url=URL.createObjectURL(await response.blob());
   const anchor=document.createElement('a');anchor.href=url;anchor.download=draw?'signup-winners.csv':'signup-participants.csv';anchor.click();URL.revokeObjectURL(url);
   if(draw)requestId.current=null;
  }catch{setError('내보내지 못했어요. 관리자 권한과 입력을 확인해 주세요.');}
  finally{setPending(false);}
 }
 return <>
  <FanAction type="button" disabled={pending||!auth.ready} onClick={()=>download(false)}>응모자 내보내기</FanAction>

  <FanAction type="button" disabled={pending||!auth.ready} onClick={()=>download(true)}>17명 추첨 명단 내보내기</FanAction>
  <p role="status">{error}</p>
 </>;
}
