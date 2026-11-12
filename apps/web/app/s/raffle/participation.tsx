'use client';
import { useState } from 'react';
import type { AppLocale } from '@/i18n/locales';
import { signupRaffleText } from '@/i18n/catalogs/signup-raffle';
import styles from './raffle.module.css';
import { useByUsAuth } from '@/features/auth/client/cognito-auth';
import { FanAction } from '@/components/fan-ui/fan-action';
import { FanText } from '@/components/fan-ui/fan-text';
export function RaffleParticipation({ locale }: { locale: AppLocale }) {
 const text = (key: Parameters<typeof signupRaffleText>[1]) => signupRaffleText(locale, key);
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
   setEntered(true);setStatus(result.passportReceived&&result.communityJoined?text('complete'):text('entered'));
  }catch{setStatus(text('error'));}
  finally{setPending(false);}
 }
 return <>
  <div className={styles.actions}>
  <FanAction variant="primary" type="button" disabled={!auth.ready||pending} onClick={enter}>{entered?text('check'):text('enter')}</FanAction>
  <FanAction href={`/passports?locale=${locale}`} variant="neutral">{text('passport')}</FanAction>
  <FanAction href={`/pages/groups?locale=${locale}`} variant="neutral">{text('community')}</FanAction>
  </div>
  <FanText as="p" role="body" aria-live="polite">{status}</FanText>
 </>;
}
