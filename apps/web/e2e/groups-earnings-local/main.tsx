import {createRoot} from 'react-dom/client';
import {GroupEarningsScreen} from '@/features/groups/ui/group-earnings-screen';
import {GroupEarningResult} from '@/features/groups/ui/group-earning-result';
import {groupEarningEntrySchema,type GroupEarningEntry} from '@/features/groups/domain/earnings';
import {GroupsReleaseProvider} from '@/features/groups/ui/groups-release';
import {LocaleProvider} from '@/components/locale-provider';
import {APP_LOCALES,parseAppLocale} from '@/i18n/locales';
import {sessionSnapshot,transition} from './auth';
import '@/app/globals.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
const q=new URLSearchParams(location.search),locale=parseAppLocale(q.get('locale')),pageId='10000000-0000-4000-8000-000000000001';
if(q.has('state'))sessionStorage.setItem('earnings-state',q.get('state')!);
let state=q.get('state')??sessionStorage.getItem('earnings-state')??'ready',attempts=0;
const entryKey=location.pathname.split('/earnings/')[1],pending:((value:Response)=>void)[]=[];
const base:GroupEarningEntry={entryKey:`activity:${pageId}`,kind:'activity',activityKey:'synthetic-activity',title:'응원 글 참여',status:'credited',asset:'fan_point',originalAmount:37,correctionAmount:null,netAmount:37,reason:null,occurredAt:'2026-11-01T00:00:00Z',processedAt:null,activityHref:null};
const row=(status:GroupEarningEntry['status'],i:number,extra:Partial<GroupEarningEntry>={})=>groupEarningEntrySchema.parse({...base,entryKey:`activity:10000000-0000-4000-8000-${String(i).padStart(12,'0')}`,status,...(status==='credited'?{}:{originalAmount:null,netAmount:null}),...extra});
const usual=[base,row('pending',2,{title:'사진 인증'}),row('corrected',3,{title:'댓글 참여',originalAmount:37,correctionAmount:-37,netAmount:0})];
const statuses=['pending','rejected','credited','no_reward','correction_review','corrected','entered','refunded'] as const;
function entries(){
 if(state==='empty')return [];
 if(state==='nullable')return [row('credited',1,{title:'지급 기록',originalAmount:null,netAmount:null}),row('corrected',3,{title:'정정 기록',originalAmount:37,correctionAmount:-37,netAmount:0}),row('no_reward',4,{title:'보상 없는 참여',originalAmount:0,netAmount:0})];
 if(state==='page')return Array.from({length:30},(_,i)=>row('corrected',i+1,{title:`활동 ${i+1}`}));
 if(state==='all')return statuses.map((s,i)=>row(s,i+1,{title:null,kind:s==='entered'||s==='refunded'?'raffle':'activity',asset:s==='entered'||s==='refunded'?'ticket':'fan_point'}));
 if(state==='long')return [row('credited',1,{title:'긴 원문 제목 · Long original title · 日本語の長い活動名 · ชื่อกิจกรรมยาว '.repeat(5),netAmount:Number.MAX_SAFE_INTEGER,asset:'legacy_free_draw'}),row('corrected',3,{title:'원문 제목\n두 번째 줄 '.repeat(20),reason:'원문의 사유를 줄이거나 바꾸지 않습니다. Long original explanation 日本語 ไทย '.repeat(20),processedAt:'2026-11-01T12:00:00Z'})];
 return sessionSnapshot().ownerId==='synthetic-owner-b'?[{...base,title:'계정 B 활동'}]:usual;
}
const group={page:{id:pageId,kind:q.get('kind')??'fan',celebrityId:pageId,slug:'nchive',name:state==='long'?'긴 모임 이름 · Long group name · 日本語 ไทย '.repeat(8):'엔카이브 팬페이지',description:'',imageUrl:'/images/groups/nchive-pencil.jpg',question:null,memberCount:0},membership:null,bookmarked:false};
const realFetch=window.fetch.bind(window),requests:{url:string;method:string}[]=[];
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin),path=url.pathname,method=init?.method??'GET';
 if(!path.startsWith('/api/'))return realFetch(input,init);
 requests.push({url:path+url.search,method});
 if(path.includes('/earnings')){
  attempts++;
  if(state==='loading'||state==='delayed'&&sessionSnapshot().ownerId==='synthetic-owner-a')return new Promise(resolve=>pending.push(resolve));
  if(state==='error'||state==='retry'&&attempts===1)return Response.json({error:{code:'SYNTHETIC_FAILURE'}},{status:503});
  if(state==='forbidden'||state==='missing'||state==='unauthorized')return Response.json({error:{code:'PRIVATE_MESSAGE_MUST_NOT_RENDER'}},{status:state==='forbidden'?403:state==='missing'?404:401});
  if(state==='malformed')return Response.json({entries:[{...base,netAmount:'unknown'}],nextCursor:null});
  const rows=entries(),detail=path.split('/earnings/')[1];
  if(detail)return Response.json({entry:rows.find(e=>e.entryKey===decodeURIComponent(detail))??row('corrected',3,{title:'댓글 참여'})});
  if(url.searchParams.has('cursor'))return Response.json({entries:[row('corrected',31,{title:'다음 페이지 활동'})],nextCursor:null});
  return Response.json({entries:rows,nextCursor:state==='page'?'opaque+/=':null});
 }
 if(path===`/api/groups/${pageId}`||path==='/api/groups/resolve/nchive')return Response.json(group);
 if(path==='/api/public/celebrities/nchive')return Response.json({celebrity:{slug:'nchive',locale:locale==='ko'?'ko':'en',name:'엔카이브 팬페이지',summary:'SAVE · 세이브 · 영상·소식·응원 글',image:{url:'/images/groups/nchive-pencil.jpg',alt:'',position:'center'},roles:['idol'],themes:[],socialLinks:[],displayOrder:0,fanCount:0}});
 if(path.endsWith('/presence'))return method==='PUT'?new Response(null,{status:204}):Response.json({onlineCount:0,todayCount:0,artists:[]});
 if(path==='/api/me/wallet')return Response.json({sequence:1,points:0,hearts:0,tickets:0,policyVersion:'group-wallet-v1',pointCost:100,writeFenced:false,attendance:{date:'2026-11-01',checkedIn:false,streak:0,nextBonusIn:7,days:[]}});
 if(path==='/api/me/avatar')return Response.json({avatar:{initialCharacterId:'star-pink',characterId:'star-pink',source:'character',hasImage:false,revision:0}});
 if(path==='/api/me/settings')return Response.json({settings:{nickname:'',preferredLocale:locale,wallet:null}});
 if(path.includes('translation'))return Response.json({translations:[]});
 return Response.json({error:{code:'FIXTURE_NOT_FOUND'}},{status:404});
};
Object.assign(window,{earningsFixture:{locales:APP_LOCALES,requests,transition,setState:(next:string)=>{state=next;},release:()=>{pending.splice(0).forEach(resolve=>resolve(Response.json(entryKey?{entry:{...base,title:'늦은 계정 A 활동'}}:{entries:[{...base,title:'늦은 계정 A 활동'}],nextCursor:null})));},pending:()=>pending.length}});
document.documentElement.lang=locale;
createRoot(document.getElementById('root')!).render(<GroupsReleaseProvider enabled><LocaleProvider initialLocale={locale}>{entryKey?<GroupEarningResult pageId={pageId} entryKey={decodeURIComponent(entryKey)} locale={locale} cursor={q.get('cursor')??undefined}/>:<GroupEarningsScreen pageId={pageId} locale={locale} cursor={q.get('cursor')??undefined}/>}</LocaleProvider></GroupsReleaseProvider>);
