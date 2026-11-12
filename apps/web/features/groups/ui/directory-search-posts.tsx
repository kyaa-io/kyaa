"use client";
import { z } from "zod";
import type { AppLocale } from "@/i18n/locales";
import { FanPostRow } from "@/components/fan-ui/fan-post-row";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useGroupResource } from "./use-group-resource";
import styles from "./directory-search-posts.module.css";

const schema=z.object({items:z.array(z.object({source:z.enum(['fan','group','notice']),id:z.string().uuid(),pageRef:z.string(),pageName:z.string(),title:z.string(),createdAt:z.string(),nickname:z.string(),noticeSlug:z.string().nullable()})),hasMore:z.boolean()});
const parse=(value:unknown)=>schema.parse(value);
const copy:Record<AppLocale,{empty:string;error:string;retry:string;loading:string}>={
 ko:{empty:'검색 결과가 없어요.',error:'게시글을 불러오지 못했어요.',retry:'다시 시도',loading:'게시글 검색 중'},
 en:{empty:'No results.',error:'Could not load posts.',retry:'Try again',loading:'Searching posts'},
 ja:{empty:'検索結果がありません。',error:'投稿を読み込めませんでした。',retry:'再試行',loading:'投稿を検索中'},
 'zh-Hans':{empty:'没有搜索结果。',error:'无法加载帖子。',retry:'重试',loading:'正在搜索帖子'},
 'zh-Hant':{empty:'沒有搜尋結果。',error:'無法載入貼文。',retry:'重試',loading:'正在搜尋貼文'},
 es:{empty:'No hay resultados.',error:'No se pudieron cargar las publicaciones.',retry:'Reintentar',loading:'Buscando publicaciones'},
 id:{empty:'Tidak ada hasil.',error:'Tidak dapat memuat postingan.',retry:'Coba lagi',loading:'Mencari postingan'},
 vi:{empty:'Không có kết quả.',error:'Không thể tải bài viết.',retry:'Thử lại',loading:'Đang tìm bài viết'},
 th:{empty:'ไม่พบผลลัพธ์',error:'โหลดโพสต์ไม่ได้',retry:'ลองอีกครั้ง',loading:'กำลังค้นหาโพสต์'},
 pt:{empty:'Nenhum resultado.',error:'Não foi possível carregar as publicações.',retry:'Tentar novamente',loading:'Buscando publicações'},
 fr:{empty:'Aucun résultat.',error:'Impossible de charger les publications.',retry:'Réessayer',loading:'Recherche de publications'},
 ru:{empty:'Нет результатов.',error:'Не удалось загрузить публикации.',retry:'Повторить',loading:'Поиск публикаций'}
};
export function DirectorySearchPosts({locale,search}:{locale:AppLocale;search:string}){
 const t=copy[locale],q=search.trim();
 const resource=useGroupResource(q.length>=2?`/api/public/search-posts?${new URLSearchParams({q,locale})}`:null,parse);
 if(q.length<2)return <FanState kind="empty" title={t.empty}/>;
 if(resource.error)return <FanState kind="error" title={t.error} actions={<FanAction variant="text" onClick={resource.retry}>{t.retry}</FanAction>}/>;
 if(!resource.data)return <FanSkeletonRows rows={3} variant="post" ariaLabel={t.loading}/>;
 if(!resource.data.items.length)return <FanState kind="empty" title={t.empty}/>;
 return <div className={styles.list}>{resource.data.items.map(post=>{
  const href=post.source==='fan'?`/c/${post.pageRef}/community/${post.id}?locale=${locale}`:post.source==='notice'?`/c/${post.pageRef}/notices/${post.noticeSlug}?locale=${locale}`:`/pages/groups/${post.pageRef}?locale=${locale}&tab=board&post=${post.id}`;
  const pageHref=post.source==='group'?`/pages/groups/${post.pageRef}?locale=${locale}`:`/${post.pageRef}?locale=${locale}`;
  return <FanPostRow key={`${post.source}:${post.id}`} locale={locale} href={href} title={post.title} notice={post.source==='notice'} source={{label:post.pageName,href:pageHref}} author={post.nickname||undefined} time={post.createdAt}/>;
 })}</div>;
}
