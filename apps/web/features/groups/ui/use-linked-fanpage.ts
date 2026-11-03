"use client";
import {z} from 'zod';
import {creatorRoleSchema} from '@/features/creator/domain/creator-role';
import {isCreatorHandle} from '@/features/creator/domain/creator-navigation';
import {toContentLocale,type AppLocale} from '@/i18n/locales';
import type {GroupPage} from '../domain/contracts';
import {useGroupResource} from './use-group-resource';
const creatorSchema=z.object({celebrity:z.object({slug:z.string(),locale:z.enum(['ko','en']),name:z.string(),summary:z.string(),image:z.object({url:z.string(),alt:z.string(),position:z.string()}),roles:z.array(creatorRoleSchema),websiteUrl:z.string().nullable().optional(),ticketUrl:z.string().nullable().optional(),themes:z.array(z.object({slug:z.string(),name:z.string()})),socialLinks:z.array(z.object({platform:z.enum(['youtube','tiktok','instagram','chzzk']),url:z.string()})),displayOrder:z.number(),fanCount:z.number()})});
const parseCreator=(value:unknown)=>creatorSchema.parse(value).celebrity;

export function linkedFanpageSlug(page:GroupPage|undefined){
 return page?.kind==='fan'&&page.celebrityId&&page.slug&&isCreatorHandle(page.slug)?page.slug:null;
}
export function useLinkedFanpage(page:GroupPage|undefined,locale:AppLocale){
 const slug=linkedFanpageSlug(page);
 const resource=useGroupResource(slug?`/api/public/celebrities/${encodeURIComponent(slug)}?locale=${toContentLocale(locale)}`:null,parseCreator);
 const data=slug&&!resource.error&&resource.data?.slug===slug&&!resource.data.roles.includes('brand')?resource.data:undefined;
 return {...resource,data,error:resource.error||Boolean(page?.kind==='fan'&&(!slug||resource.data&&!data))};
}
