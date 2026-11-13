import {createRoot} from 'react-dom/client';
import {GroupBenefitsScreen} from '@/features/groups/ui/group-benefits-screen';
import {CapsuleScreen} from '@/features/group-capsule/capsule-screen';
import {GroupRaffleScreen} from '@/features/group-raffle/raffle-screen';
import {FanAppFrame} from '@/components/fan-shell/fan-app-shell';
import {GroupsReleaseProvider} from '@/features/groups/ui/groups-release';
import {LocaleProvider} from '@/components/locale-provider';
import {APP_LOCALES,parseAppLocale} from '@/i18n/locales';
import {sessionSnapshot,transition} from './auth';
import '@/app/globals.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
const q=new URLSearchParams(location.search),locale=parseAppLocale(q.get('locale')),id='10000000-0000-4000-8000-000000000001',second='10000000-0000-4000-8000-000000000002';
let state=q.get('state')??'ready',tickets=27,entered=2;
const requests:{url:string;method:string}[]=[],receipts=new Map<string,unknown>(),waiting:((response:Response)=>void)[]=[];
const wallet=()=>({sequence:1,points:1370,hearts:13,tickets,policyVersion:'group-wallet-v1',pointCost:100,writeFenced:state==='fenced',attendance:{date:'2026-11-01',checkedIn:true,streak:1,nextBonusIn:6}});
const name=state==='long'?'合成 Synthetic طويل 日本語 ไทย Long original item title '.repeat(5):'합성 데이터 · Synthetic raffle';
const raffle={id,benefitId:id,title:name,summary:'합성 설명 · Synthetic product description',imageUrl:'/images/groups/nchive-goods-concept.png',winnerQuantity:2,status:state==='closed'?'closed':'open',entryOpensAt:'2026-01-01T00:00:00Z',entryClosesAt:'2100-12-31T00:00:00Z',fulfillmentMethod:'digital',perFanTicketLimit:100};
const campaign={id,name:'합성 데이터 · Synthetic capsule',status:'active',blankWeight:900000,weightTotal:1000000,prizes:[{id:second,name:'합성 경품 · Synthetic prize',imageUrl:'/images/groups/nchive-goods-concept.png',stock:100,weight:100000}]};
const realFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin),path=url.pathname,method=init?.method??'GET';
 if(!path.startsWith('/api/'))return realFetch(input,init);
 requests.push({url:path+url.search,method});
 if(state==='loading'&&(path.includes('/benefits')||path==='/api/me/wallet'||path==='/api/groups/capsules'||path.endsWith(`/raffles/${id}`)))return new Promise(resolve=>waiting.push(resolve));
 if(state==='error'&&(path.startsWith('/api/groups')||path==='/api/me/wallet'))return Response.json({error:{code:'SYNTHETIC_FAILURE'}},{status:503});
 if(path==='/api/me/wallet')return Response.json({...wallet(),...(state==='insufficient'?{tickets:0}:{})});
 if(path==='/api/raffles/recent')return Response.json({items:[1,2,3].map(n=>({raffle:{...raffle,id:`10000000-0000-4000-8000-00000000000${n}`,benefitId:`10000000-0000-4000-8000-00000000000${n}`,title:`지난 럭키드로우 선물 ${n}`,status:'closed',entryClosesAt:'2026-10-31T00:00:00Z',resultsPublishedAt:'2026-11-01T00:00:00Z'},creator:{slug:'synthetic-creator',name:'합성 크리에이터',image:null}}))});
 if(path==='/api/groups/benefits'){
  const kind=url.searchParams.get('kind'),cursor=url.searchParams.get('cursor');
  const itemId=cursor?second:id,base={id:itemId,pageId:id,pageName:'합성 모임 · Synthetic group',title:cursor?'두 번째 · Second page':name,description:'합성 설명 · Synthetic original description',imageUrl:'/images/groups/nchive-goods-concept.png',href:`/pages/groups/${id}/${kind}/${itemId}`};
  return Response.json({kind,items:state==='empty'?[]:[kind==='raffles'?{...base,status:'open',closesAt:'2100-12-31T00:00:00Z'}:{...base,title:cursor?'다음 설문 · Next survey':'합성 설문 · Synthetic survey',status:'published',submissionKind:'survey',rewardPoints:0}],nextCursor:!cursor&&state!=='empty'?id:null});
 }
 if(path==='/api/public/celebrities')return Response.json({celebrities:state==='empty'?[]:[{slug:'synthetic-creator',name:'합성 크리에이터 · Synthetic creator',image:{url:'/images/groups/nchive-group.webp',position:'center'}}]});
 if(path==='/api/groups/capsules')return Response.json({items:state==='empty'?[]:[campaign],nextCursor:null});
 if(path===`/api/groups/${id}/raffles/${id}`)return Response.json({raffle,enteredTickets:entered,winner:null,canManage:false,member:state!=='nonmember',consentVersion:null,canEnter:state!=='nonmember'});
 if(path===`/api/groups/${id}/raffles/${id}/entries`&&method==='POST'){
  const body=JSON.parse(String(init?.body)),old=receipts.get(body.requestId);if(old)return Response.json(old);
  if(body.amount>tickets)return Response.json({error:{code:'GROUP_WALLET_INSUFFICIENT_BALANCE'}},{status:409});
  tickets-=body.amount;entered+=body.amount;const receipt={id:second,amount:body.amount,enteredTickets:entered,tickets};receipts.set(body.requestId,receipt);return Response.json(receipt);
 }
 if(path===`/api/groups/capsules/${id}/draw`&&method==='POST'){
  const body=JSON.parse(String(init?.body)),old=receipts.get(body.requestKey);if(old)return Response.json(old);
  tickets-=body.count;const result={requestKey:body.requestKey,campaignId:id,count:body.count,tickets,results:Array.from({length:body.count},(_,i)=>({index:i+1,prizeId:i===0?second:null,name:i===0?'합성 경품 · Synthetic prize':null,imageUrl:i===0?'/images/groups/nchive-goods-concept.png':null}))};receipts.set(body.requestKey,result);return Response.json(result);
 }
 if(path==='/api/dukjil/catalog')return Response.json({version:1,rules:{checkin:{points:10}},missionBook:q.has('book')?{pages:[{slots:['quiz','checkin','post','comment','share','invite','subscription','steady_checkin','proof'].map((action,i)=>({slot:i+1,action}))}]}:null});
 if(path==='/api/groups'&&url.searchParams.get('mine')==='joined')return Response.json({items:state==='empty'?[]:[{id,kind:'fan',celebrityId:second,slug:'synthetic-creator',name:'합성 크리에이터 · Synthetic creator',description:'합성 소개',imageUrl:'/images/groups/nchive-group.webp',question:null,memberCount:1}],nextCursor:null});
 if(path==='/api/me/attendance')return Response.json({kstDate:'2026-11-01',items:[{celebrityId:second,attendedToday:false,streak:1,nextBonusIn:4,hasPassport:true}]});
 if(path==='/api/rankings/creators')return Response.json({period:'week',periodStart:'2026-10-26',computedAt:'2026-11-01T01:00:00.000Z',rows:state==='empty'?[]:[{rank:1,slug:'synthetic-creator',name:'합성 크리에이터 · Synthetic creator',imageUrl:'/images/groups/nchive-group.webp',score:120,jjinfanCount:37,myHearts:12}]});
 if(path==='/api/me/wallet/history')return Response.json({entries:state==='empty'?[]:[{id:second,asset:'fan_point',amount:10,sourceType:'group_check_in',sourceId:second,celebrityId:null,createdAt:'2026-11-01T01:00:00.000Z'}]});
 if(path==='/api/me/settings')return Response.json({settings:{nickname:'Synthetic account',preferredLocale:locale,wallet:null}});
 if(path==='/api/me/avatar')return Response.json({avatar:{initialCharacterId:'star-pink',characterId:'star-pink',source:'character',hasImage:false,revision:0}});
 if(path==='/api/notifications/unread-count')return Response.json({count:0});
 return Response.json({error:{code:'SYNTHETIC_UNHANDLED'}},{status:404});
};
Object.assign(window,{benefitsHarness:{requests,locales:APP_LOCALES,transition,setState:(next:string)=>{state=next;},sessionSnapshot}});
const path=location.pathname;
const content=path.startsWith('/my/capsules')?<CapsuleScreen locale={locale} pageId={q.get('pageId')??undefined}/>:path.includes('/raffles/')?<GroupRaffleScreen pageId={id} raffleId={id} locale={locale}/>:path==='/benefits'?<GroupBenefitsScreen locale={locale}/>:<FanAppFrame locale={locale} groupsEnabled={q.get('gate')!=='off'}><main><h1>Synthetic legacy detail route</h1></main></FanAppFrame>;
createRoot(document.getElementById('root')!).render(<LocaleProvider initialLocale={locale}><GroupsReleaseProvider enabled={q.get('gate')!=='off'}>{content}</GroupsReleaseProvider></LocaleProvider>);
