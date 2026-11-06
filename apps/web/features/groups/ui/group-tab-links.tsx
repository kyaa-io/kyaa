"use client";
import {FanTabs,type FanTabItem} from "@/components/fan-ui/fan-tabs";
import type {AppLocale} from "@/i18n/locales";
import {groupsCopy} from "./copy";
import {groupCalendarLabel} from "./group-calendar-label";
import {membersAndRank} from "./home-copy";

/** 모임·팬페이지가 함께 쓰는 탭 목록. 홈·게시판·방·캘린더 뒤에 멤버·랭킹을 붙인다. */
export const groupTabs=['home','board','rooms','calendar'] as const;

export function groupTabItems(locale:AppLocale,members=true):FanTabItem[]{
 const t=groupsCopy(locale);
 return [...groupTabs.map(value=>({key:value as string,label:value==='calendar'?groupCalendarLabel[locale]:t[value]})),...(members?[{key:'members',label:membersAndRank[locale]}]:[])];
}

/** 프레임 밖 화면(행사 등)이 쓰는 탭. 항상 스크롤을 건드리지 않는다. */
export function GroupTabLinks({id,label,locale,active,href,members=true}:{id?:string;label:string;locale:AppLocale;current?:string;active:string;href:(tab:string)=>string;members?:boolean;scroll?:boolean}){
 return <FanTabs id={id} label={label} current={active} items={groupTabItems(locale,members).map(item=>({...item,href:href(item.key)}))}/>;
}
