"use client";
import type {AppLocale} from '@/i18n/locales';
import {groupDetailSchema} from '../domain/contracts';
import {useGroupResource} from './use-group-resource';
import {CreatorGroupHeader} from './creator-group-header';
import {useLinkedFanpage} from './use-linked-fanpage';
const parsePage=(value:unknown)=>groupDetailSchema.parse(value);
export function GroupActivityHeader({pageId,locale}:{pageId:string;locale:AppLocale}){
 const resource=useGroupResource(`/api/groups/${pageId}`,parsePage);
 const creator=useLinkedFanpage(!resource.error&&resource.data?.page.id===pageId?resource.data.page:undefined,locale);
 return creator.data?<CreatorGroupHeader celebrity={creator.data} locale={locale} tab='activities' pageId={pageId}/>:null;
}
