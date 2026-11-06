'use client';
import { useId, useRef, useState } from 'react';
import { AccessibleOverlay } from '@/components/ui/overlay/accessible-overlay';
import { FanAction } from '@/components/fan-ui/fan-action';
import { groupsCopy } from '@/features/groups/ui/copy';
import type { AppLocale } from '@/i18n/locales';
import { PublicFavorites } from './public-favorites';
import { socialCopy,socialNavigationCopy,socialSaveCopy } from './copy';
import styles from './social.module.css';
export type SocialSettings={favoriteSlugs:string[];dmPolicy:'friends'|'requests'|'none'};
export function SocialSettingsPanel({locale,value,pending,failed,onClose,onSave}:{locale:AppLocale;value:SocialSettings;pending:boolean;failed:boolean;onClose:()=>void;onSave:(value:SocialSettings)=>void}){
 const [draft,setDraft]=useState(value),title=useId(),initial=useRef<HTMLButtonElement>(null),s=socialCopy(locale),g=groupsCopy(locale);
 return <AccessibleOverlay open onClose={onClose} labelledBy={title} initialFocusRef={initial} backdropClassName={styles.settingsBackdrop} contentClassName={styles.settingsPanel} contentAs='section'><h2 id={title}>{locale==='ko'?'공개·수신 설정':socialNavigationCopy[locale][0]}</h2><fieldset><legend>{locale==='ko'?'DM 수신':s.messageRequest}</legend>{(['requests','friends','none'] as const).map(policy=><label key={policy}><input type='radio' name='dm-policy' value={policy} checked={draft.dmPolicy===policy} disabled={pending} onChange={()=>setDraft({...draft,dmPolicy:policy})}/>{s[policy]}</label>)}</fieldset><PublicFavorites locale={locale} selected={draft.favoriteSlugs} disabled={pending} onChange={favoriteSlugs=>setDraft({...draft,favoriteSlugs})}/>{failed&&<p role='alert' className={styles.error}>{g.error}</p>}<div className={styles.actions}><button ref={initial} className={styles.cancelSettings} disabled={pending} onClick={onClose}>{g.cancel}</button><FanAction variant='primary' disabled={pending} onClick={()=>onSave(draft)}>{socialSaveCopy[locale]}</FanAction></div></AccessibleOverlay>;
}
