"use client";
import { useState } from 'react';
import type { AppLocale } from '@/i18n/locales';
import { FanAction } from '@/components/fan-ui/fan-action';
import { groupListSchema } from '@/features/groups/domain/contracts';
import { GroupAvatar } from '@/features/groups/ui/group-shell';
import { useGroupResource } from '@/features/groups/ui/use-group-resource';
import { groupsCopy } from '@/features/groups/ui/copy';
import { socialPrivacyCopy } from './privacy-copy';
import styles from './social.module.css';
const parse=(value:unknown)=>groupListSchema.parse(value);
export function PublicFavorites({locale,selected,disabled,onChange}:{locale:AppLocale;selected:string[];disabled:boolean;onChange:(slugs:string[])=>void}){
 const t=groupsCopy(locale),c=socialPrivacyCopy(locale),[cursor,setCursor]=useState<string>(),[previous,setPrevious]=useState<{key:string;items:ReturnType<typeof parse>['items']}>({key:'',items:[]}),r=useGroupResource(`/api/groups?type=fan&owned=1&limit=50${cursor?`&cursor=${cursor}`:''}`,parse),items=[...(previous.key===r.ownerKey?previous.items:[]),...(r.data?.items??[])].filter(item=>item.slug&&item.celebrityId);
 return <fieldset className={styles.favoriteChoices} disabled={disabled}><legend>{c.favorites}</legend>{r.error?<FanAction onClick={r.retry}>{t.retry}</FanAction>:r.loading?<p role='status'>{t.loading}</p>:items.length?items.map(item=><label key={item.id}><input type='checkbox' checked={selected.includes(item.slug!)} onChange={event=>onChange(event.target.checked?[...selected,item.slug!]:selected.filter(slug=>slug!==item.slug))}/><GroupAvatar page={item} locale={locale}/><span>{item.name}</span></label>):<p>{c.empty}</p>}{r.data?.nextCursor&&<FanAction onClick={()=>{setPrevious({key:r.ownerKey,items});setCursor(r.data!.nextCursor??undefined);}}>{t.more}</FanAction>}</fieldset>;
}
