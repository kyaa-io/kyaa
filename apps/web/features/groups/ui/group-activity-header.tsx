'use client';
import{z}from'zod';
import{creatorRoleSchema}from'@/features/creator/domain/creator-role';
import{toContentLocale,type AppLocale}from'@/i18n/locales';
import{groupDetailSchema}from'../domain/contracts';
import{useGroupResource}from'./use-group-resource';
import{CreatorGroupHeader}from'./creator-group-header';
const parsePage=(value:unknown)=>groupDetailSchema.parse(value);
const creatorSchema=z.object({celebrity:z.object({slug:z.string(),locale:z.enum(['ko','en']),name:z.string(),summary:z.string(),image:z.object({url:z.string(),alt:z.string(),position:z.string()}),roles:z.array(creatorRoleSchema),websiteUrl:z.string().nullable().optional(),ticketUrl:z.string().nullable().optional(),themes:z.array(z.object({slug:z.string(),name:z.string()})),socialLinks:z.array(z.object({platform:z.enum(['youtube','tiktok','instagram','chzzk']),url:z.string()})),displayOrder:z.number(),fanCount:z.number()})});
const parseCreator=(value:unknown)=>creatorSchema.parse(value).celebrity;
export function GroupActivityHeader({pageId,locale}:{pageId:string;locale:AppLocale}){const page=useGroupResource(`/api/groups/${pageId}`,parsePage),slug=page.data?.page.kind==='fan'?page.data.page.slug:null,creator=useGroupResource(slug?`/api/public/celebrities/${encodeURIComponent(slug)}?locale=${toContentLocale(locale)}`:null,parseCreator);return creator.data?<CreatorGroupHeader celebrity={creator.data} locale={locale} tab='home'/>:null;}
