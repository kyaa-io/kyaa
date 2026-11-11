'use client';
import { useState } from 'react';
import { useByUsAuth } from '@/features/auth/client/cognito-auth';
import { FanAction } from '@/components/fan-ui/fan-action';
export function SignupEventSharing() {
 const auth=useByUsAuth();
 const [pending,setPending]=useState(false),[status,setStatus]=useState('');
 const share=async()=>{
  if(!auth.authenticated){auth.login();return;}
  setPending(true);setStatus('');
  try {
   const token=await auth.getAccessToken();
   if(!token)throw new Error('auth');
   const response=await fetch('/api/signup-event/share',{method:'POST',headers:{authorization:`Bearer ${token}`}});
   if(!response.ok)throw new Error('share');
   const data=await response.json();
   const url=new URL(data.href,window.location.origin).href;
   if(navigator.share)await navigator.share({title:'신규 가입 이벤트',url});
   else await navigator.clipboard.writeText(url);
   setStatus('공유 링크를 만들었어요.');
  }catch(error){if(!(error instanceof Error&&error.name==='AbortError'))setStatus('공유 링크를 만들지 못했어요. 다시 시도해 주세요.');}
  finally{setPending(false);}
 };
 return <div><FanAction type="button" disabled={!auth.ready||pending} onClick={share}>공유하기</FanAction><p role="status">{status}</p></div>;
}
