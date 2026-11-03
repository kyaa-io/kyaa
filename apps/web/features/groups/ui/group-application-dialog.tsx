"use client";
import type {AppLocale} from "@/i18n/locales";
import {GroupApplication} from "./group-application";
import {useGroupRequest} from "./use-group-resource";
export function GroupApplicationDialog({locale,initialKind="hobby",onClose}:{locale:AppLocale;initialKind?:"fan"|"hobby"|"brand";onClose:()=>void}){
 const {ownerKey}=useGroupRequest();
 return <GroupApplication key={ownerKey} locale={locale} initialKind={initialKind} modal={{onClose}}/>;
}
