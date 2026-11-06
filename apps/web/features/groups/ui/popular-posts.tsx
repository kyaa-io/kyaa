"use client";
import {useState} from 'react';
import {z} from 'zod';
import {fanPostFeedItemSchema} from '@/features/fan-posts/domain/feed';
import {CompactFeed} from '@/features/fan-posts/ui/compact-feed';
import {useCommunityResource} from '@/features/fanpage/ui/use-community-resource';
import {toContentLocale,type AppLocale} from '@/i18n/locales';
import {contentCopy} from '@/i18n/catalogs/features__fan_posts__ui';
import {boardHref} from '@/features/fanpage/domain/board-navigation';
import {FanSkeletonRows} from '@/components/fan-ui/fan-skeleton';
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
const noop=()=>undefined;
const parse=(value:unknown)=>z.object({items:z.array(fanPostFeedItemSchema.omit({kind:true})).max(10)}).parse(value);
export function PopularPosts({slug,locale}:{slug:string;locale:AppLocale}){
 const [period,setPeriod]=useState<'day'|'week'|'month'>('day');
 const result=useCommunityResource(`/api/celebrities/${encodeURIComponent(slug)}/popular-posts?period=${period}&locale=${toContentLocale(locale)}`,parse);
 const [title,...text]=labels[locale],copy=contentCopy(locale);
 return <section className={styles.panel}><header><h2>{title}</h2><div>{(['day','week','month'] as const).map((value,i)=><button type='button' key={value} aria-pressed={period===value} onClick={()=>setPeriod(value)}>{text[i]}</button>)}</div></header>{result.state.status==='ready'?result.state.data.items.length?<CompactFeed items={result.state.data.items.map(item=>({...item,kind:'fan_post' as const}))} slug={slug} locale={locale} returnTo={boardHref(slug,locale)} onChanged={noop}/>:<p>{text[3]}</p>:result.state.status==='error'?<button type='button' onClick={result.retry}>{copy.retry}</button>:<FanSkeletonRows rows={3} variant='post'/>}</section>;
}
