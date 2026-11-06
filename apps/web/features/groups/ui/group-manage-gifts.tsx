"use client";
import type {AppLocale} from '@/i18n/locales';
import {GroupGiftApplications} from './group-gifts';
import {useAddressParam} from './use-address-param';
/** 선물 신청 탭. 어떤 신청을 보는지와 새 신청 중인지는 주소가 갖는다. */
export function GroupManageGifts({pageId,locale}:{pageId:string;locale:AppLocale}){
 const [gift,setGift]=useAddressParam('gift'),[creating,setCreating]=useAddressParam('new');
 return <GroupGiftApplications pageId={pageId} locale={locale} view={{selected:gift??undefined,creating:creating==='1'}} onView={next=>{setGift(next.selected??null);setCreating(next.creating?'1':null);}}/>;
}
