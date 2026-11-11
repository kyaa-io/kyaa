'use client';
import { useState } from 'react';
import { useByUsAuth } from '@/features/auth/client/cognito-auth';
import { FanAction } from '@/components/fan-ui/fan-action';
import { FanText } from '@/components/fan-ui/fan-text';
export function RaffleParticipation() {
 const auth=useByUsAuth();
 const [pending,setPending]=useState(false),[entered,setEntered]=useState(false),[status,setStatus]=useState('');
 async function enter() {
  if(!auth.authenticated){auth.login();return;}
  setPending(true);setStatus('');
  try {
   const token=await auth.getAccessToken();if(!token)throw new Error('auth');
   const response=await fetch('/api/signup-event/entry',{method:'POST',headers:{authorization:`Bearer ${token}`}});
   if(!response.ok)throw new Error('entry');
   const result=await response.json();
   setEntered(true);setStatus(result.passportReceived&&result.communityJoined?'참여 조건을 모두 완료했어요.':'응모했어요. Fan Passport를 받고 커뮤니티에 가입해 주세요.');
  }catch{setStatus('응모하지 못했어요. 기간과 로그인 상태를 확인해 주세요.');}
  finally{setPending(false);}
 }
 return <>
  <FanAction type="button" disabled={!auth.ready||pending} onClick={enter}>{entered?'응모 확인하기':'KYAA에서 응모하기'}</FanAction>
  <FanAction href="/passports" variant="neutral">Fan Passport 받기</FanAction>
  <FanAction href="/pages/groups" variant="neutral">커뮤니티 가입하기</FanAction>
  <FanText as="p" role="body" aria-live="polite">{status}</FanText>
 </>;
}
