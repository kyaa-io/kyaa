"use client";
import {useState,type ReactNode} from 'react';
import {z} from 'zod';
import {fanPostFeedItemSchema} from '@/features/fan-posts/domain/feed';
import {CompactFeed} from '@/features/fan-posts/ui/compact-feed';
import {useCommunityResource} from '@/features/fanpage/ui/use-community-resource';
import {toContentLocale,type AppLocale} from '@/i18n/locales';
import {contentCopy} from '@/i18n/catalogs/features__fan_posts__ui';
import {boardHref} from '@/features/fanpage/domain/board-navigation';
import {FanSkeletonRows} from '@/components/fan-ui/fan-skeleton';
import styles from './popular-posts.module.css';
const labels:Record<AppLocale,readonly [string,string,string,string]>={
 ko:['오늘의 인기글','일간','주간','월간'],
 en:['Popular posts','Daily','Weekly','Monthly'],
 ja:['人気の投稿','日間','週間','月間'],
 'zh-Hans':['热门帖子','日榜','周榜','月榜'],
 'zh-Hant':['熱門貼文','日榜','週榜','月榜'],
 es:['Publicaciones populares','Día','Semana','Mes'],
 id:['Postingan populer','Harian','Mingguan','Bulanan'],
 vi:['Bài viết phổ biến','Ngày','Tuần','Tháng'],
 th:['โพสต์ยอดนิยม','รายวัน','รายสัปดาห์','รายเดือน'],
 pt:['Publicações populares','Dia','Semana','Mês'],
 fr:['Publications populaires','Jour','Semaine','Mois'],
 ru:['Популярные публикации','День','Неделя','Месяц'],
};
const titles:Record<AppLocale,readonly [string,string,string]>={
 ko:['오늘의 인기글','이번 주의 인기글','이번 달의 인기글'],
 en:["Today's popular posts","This week's popular posts","This month's popular posts"],
 ja:['今日の人気の投稿','今週の人気の投稿','今月の人気の投稿'],
 'zh-Hans':['今日热门帖子','本周热门帖子','本月热门帖子'],
 'zh-Hant':['今日熱門貼文','本週熱門貼文','本月熱門貼文'],
 es:['Publicaciones populares de hoy','Publicaciones populares de esta semana','Publicaciones populares de este mes'],
 id:['Postingan populer hari ini','Postingan populer minggu ini','Postingan populer bulan ini'],
 vi:['Bài viết phổ biến hôm nay','Bài viết phổ biến tuần này','Bài viết phổ biến tháng này'],
 th:['โพสต์ยอดนิยมวันนี้','โพสต์ยอดนิยมสัปดาห์นี้','โพสต์ยอดนิยมเดือนนี้'],
 pt:['Publicações populares de hoje','Publicações populares desta semana','Publicações populares deste mês'],
 fr:["Publications populaires du jour","Publications populaires de la semaine","Publications populaires du mois"],
 ru:['Популярные публикации сегодня','Популярные публикации этой недели','Популярные публикации этого месяца'],
};
const noop=()=>undefined;
/** The ranking endpoint answers up to ten and the board shows all ten (tab1 21: "인기글 10개"). */
const SHOWN=10;
const parse=(value:unknown)=>z.object({items:z.array(fanPostFeedItemSchema.omit({kind:true})).max(10)}).parse(value);
export function PopularPosts({slug,locale,pageImage}:{slug:string;locale:AppLocale;pageImage?:ReactNode}){
 const [period,setPeriod]=useState<'day'|'week'|'month'>('day');
 const result=useCommunityResource(`/api/celebrities/${encodeURIComponent(slug)}/popular-posts?period=${period}&locale=${toContentLocale(locale)}`,parse,false,false,false,true);
 const [, ...text]=labels[locale],title=titles[locale][(['day','week','month'] as const).indexOf(period)],copy=contentCopy(locale);
 // No readable posts in this period: the board below speaks for itself.
 if(result.state.status==='ready'&&result.state.data.items.length===0)return null;
 return <section className={styles.panel}><header><h2>{title}</h2><div className={styles.tabs}>{(['day','week','month'] as const).map((value,i)=><button type='button' key={value} aria-pressed={period===value} onClick={()=>setPeriod(value)}>{text[i]}</button>)}</div></header>{result.state.status==='ready'?<CompactFeed items={result.state.data.items.slice(0,SHOWN).map(item=>({...item,kind:'fan_post' as const}))} slug={slug} locale={locale} returnTo={boardHref(slug,locale)} onChanged={noop} pageImage={pageImage}/>:result.state.status==='error'?<button type='button' onClick={result.retry}>{copy.retry}</button>:<FanSkeletonRows rows={3} variant='post'/>}</section>;
}
