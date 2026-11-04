import {createRoot} from 'react-dom/client';
import {GroupOperatorStats} from '@/features/groups/ui/group-operator-stats';
import {GroupOperatorNotices} from '@/features/groups/ui/group-operator-notices';
import {parseAppLocale} from '@/i18n/locales';
import '@/app/globals.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
const q=new URLSearchParams(location.search),locale=parseAppLocale(q.get('locale')),state=q.get('state')??'ready',pageId='10000000-0000-4000-8000-000000000001';
const days=(n:number,f:(i:number)=>number)=>Array.from({length:n},(_,i)=>({day:new Date(Date.UTC(2026,10,5-n+i)).toISOString().slice(0,10),visitors:f(i)}));
const stats=(n:number)=>{const empty=state==='empty',big=state==='big',daily=days(n,i=>empty?0:big?(i*37919+1000)%99999:(i*3)%9);return {days:n,from:daily[0].day,to:daily[n-1].day,members:empty?0:big?9876543:128,joinedInPeriod:empty?0:big?123456:9,posts:empty?0:big?4567890:342,postsInPeriod:empty?0:12,notices:empty?0:3,visitors:empty?0:big?8765432:57,visitDays:empty?0:big?9999999:210,daily};};
const long='긴 공지 제목 · Very long notice title for the operator · 日本語の長いお知らせタイトル · ประกาศยาว '.repeat(2).slice(0,100);
let notices=state==='empty'?[]:[{id:'20000000-0000-4000-8000-000000000001',pageId,title:state==='long'?long:'11월 정기 모임 안내',body:state==='long'?'본문 '.repeat(200):'이번 달 모임 일정을 안내합니다.\n장소는 추후 공지합니다.',visibility:'public',anonymous:false,profileId:null,nickname:'',avatarUrl:null,createdAt:'2026-11-03T00:00:00Z'},{id:'20000000-0000-4000-8000-000000000002',pageId,title:'회원 전용 안내',body:'회원에게만 보이는 공지입니다.',visibility:'members',anonymous:false,profileId:null,nickname:'',avatarUrl:null,createdAt:'2026-11-01T00:00:00Z'}];
const calls:{url:string;method:string;body:unknown}[]=[];(window as any).__calls=calls;
const realFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin),method=init?.method??'GET';
 if(!url.pathname.startsWith('/api/'))return realFetch(input,init);
 const body=init?.body?JSON.parse(String(init.body)):null;calls.push({url:url.pathname+url.search,method,body});
 if(state==='error')return Response.json({error:{code:'X'}},{status:503});
 if(url.pathname.endsWith('/stats'))return Response.json(stats(Number(url.searchParams.get('days')??7)));
 const m=url.pathname.match(/posts\/([^/]+)$/);
 if(method==='POST'){notices=[{id:'20000000-0000-4000-8000-0000000000'+String(10+notices.length),pageId,title:body.title,body:body.body,visibility:body.visibility,anonymous:false,profileId:null,nickname:'',avatarUrl:null,createdAt:'2026-11-04T00:00:00Z'},...notices];return Response.json({ok:true});}
 if(method==='PATCH'&&m){notices=notices.map(n=>n.id===m[1]?{...n,title:body.title,body:body.body,visibility:body.visibility}:n);return Response.json({ok:true});}
 if(method==='DELETE'&&m){notices=notices.filter(n=>n.id!==m[1]);return Response.json({ok:true});}
 return Response.json({items:notices,nextCursor:null});
};
window.confirm=()=>true;
createRoot(document.getElementById('root')!).render(<main style={{maxWidth:1440,margin:'auto',padding:16,display:'grid',gap:32}}><GroupOperatorStats pageId={pageId} locale={locale}/><GroupOperatorNotices pageId={pageId} locale={locale}/></main>);
