"use client";
import {useState} from 'react';
import Link from 'next/link';
import {z} from 'zod';
import {postSchema} from '@/features/fan-posts/domain/content';
import {useCommunityResource} from '@/features/fanpage/ui/use-community-resource';
import {toContentLocale,type AppLocale} from '@/i18n/locales';
import {contentCopy} from '@/i18n/catalogs/features__fan_posts__ui';
import {boardHref} from '@/features/fanpage/domain/board-navigation';
import styles from './popular-posts.module.css';
const labels:Record<AppLocale,readonly [string,string,string,string,string]>={
 ko:['오늘의 인기글','일간','주간','월간','아직 인기글이 없어요.'],
 en:['Popular posts','Daily','Weekly','Monthly','No popular posts yet.'],
 ja:['人気の投稿','日間','週間','月間','人気の投稿はまだありません。'],
 'zh-Hans':['热门帖子','日榜','周榜','月榜','还没有热门帖子。'],
 'zh-Hant':['熱門貼文','日榜','週榜','月榜','還沒有熱門貼文。'],
 es:['Publicaciones populares','Día','Semana','Mes','Aún no hay publicaciones populares.'],
 id:['Postingan populer','Harian','Mingguan','Bulanan','Belum ada postingan populer.'],
 vi:['Bài viết phổ biến','Ngày','Tuần','Tháng','Chưa có bài viết phổ biến.'],
 th:['โพสต์ยอดนิยม','รายวัน','รายสัปดาห์','รายเดือน','ยังไม่มีโพสต์ยอดนิยม'],
 pt:['Publicações populares','Dia','Semana','Mês','Ainda não há publicações populares.'],
 fr:['Publications populaires','Jour','Semaine','Mois','Aucune publication populaire pour le moment.'],
 ru:['Популярные публикации','День','Неделя','Месяц','Популярных публикаций пока нет.'],
};
const parse=(value:unknown)=>z.object({items:z.array(postSchema).max(10)}).parse(value);
export function PopularPosts({slug,locale}:{slug:string;locale:AppLocale}){
 const [period,setPeriod]=useState<'day'|'week'|'month'>('day');
 const result=useCommunityResource(`/api/celebrities/${encodeURIComponent(slug)}/popular-posts?period=${period}&locale=${toContentLocale(locale)}`,parse,false);
 const [title,...text]=labels[locale],copy=contentCopy(locale);
 return <section className={styles.panel}><header><h2>{title}</h2><div>{(['day','week','month'] as const).map((value,i)=><button type='button' key={value} aria-pressed={period===value} onClick={()=>setPeriod(value)}>{text[i]}</button>)}</div></header>{result.state.status==='ready'?result.state.data.items.length?<ol>{result.state.data.items.slice(0,3).map((post,i)=><li key={post.id}><span>{i+1}</span><Link href={`/c/${slug}/community/${post.id}?locale=${locale}&returnTo=${encodeURIComponent(boardHref(slug,locale))}`}>{post.body.split('\n')[0]}</Link>{post.commentCount>0&&<small>({post.commentCount})</small>}</li>)}</ol>:<p>{text[3]}</p>:result.state.status==='error'?<button type='button' onClick={result.retry}>{copy.retry}</button>:<p role='status'>{copy.loading}</p>}</section>;
}
