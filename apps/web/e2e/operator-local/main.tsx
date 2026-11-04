import {createRoot} from 'react-dom/client';
import {OperatorHome} from '@/components/operator/operator-shell';
import {OperatorNotices,OperatorSchedules} from '@/components/operator/operator-pages';
import {ChannelOperatorManager} from '@/components/admin/channel-operator-manager';
import '@/app/globals.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
// Synthetic fixture only: no real account, channel or server data.
const q=new URLSearchParams(location.search),locale=q.get('lang')==='en'?'en':'ko',state=q.get('state')??'ready';
const A='10000000-0000-4000-8000-00000000000a',B='10000000-0000-4000-8000-00000000000b';
const channels=[{id:A,slug:'synthetic-a',status:'published',nameKo:'합성 채널 A',nameEn:'Synthetic channel A'},{id:B,slug:'synthetic-b',status:'published',nameKo:'합성 채널 B',nameEn:'Synthetic channel B'}];
const doc=(t:string)=>({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:t}]}]});
const notices:any[]=[{id:'20000000-0000-4000-8000-000000000001',slug:'synthetic-notice',publication_status:'published',pinned:false,post_type:'notice',visibility:'public',published_at:'2026-11-01T00:00:00Z',archived_at:null,archive_reason:null,revision:1,celebrity_notice_localizations:[{locale:'ko',title:'합성 공지',body_json:doc('합성 본문')},{locale:'en',title:'Synthetic notice',body_json:doc('Synthetic body')}]}];
const schedules:any[]=[{id:'30000000-0000-4000-8000-000000000001',celebrityId:A,celebritySlug:'synthetic-a',kind:'concert',title:{ko:'합성 공연',en:'Synthetic show'},description:{ko:'합성 소개',en:'Synthetic details'},startsAt:'2026-12-01T10:00:00Z',endsAt:'2026-12-01T12:00:00Z',timeZone:'Asia/Seoul',location:'Seoul',participationInstructions:'',officialSourceUrl:'https://example.test/a',status:'published',revision:1,createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z'}];
const grants:any[]=[{id:'60000000-0000-4000-8000-000000000001',ch:A,appUserId:'50000000-0000-4000-8000-000000000001',email:'synthetic-operator-1@example.test',status:'active',grantedAt:'2026-11-02T01:00:00+00:00',revokedAt:null},{id:'60000000-0000-4000-8000-000000000002',ch:A,appUserId:'50000000-0000-4000-8000-000000000002',email:'synthetic-operator-2@example.test',status:'revoked',grantedAt:'2026-11-01T01:00:00+00:00',revokedAt:'2026-11-03T01:00:00+00:00'}];
const realFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin),path=url.pathname;
 if(!path.startsWith('/api/'))return realFetch(input,init);
 if(path==='/api/auth/session')return Response.json({ok:true});
 if(path==='/api/operator/channels'){
  if(state==='denied')return Response.json({error:'FORBIDDEN'},{status:403});
  return Response.json({kind:'operator',role:'operator',celebrities:state==='single'?[channels[0]]:channels});
 }
 const opm=path.match(/^\/api\/admin\/celebrities\/([^/]+)\/operators(?:\/([^/]+))?$/);
 if(opm){
  const ch=opm[1],gid=opm[2];
  if(state==='error')return Response.json({error:{code:'CHANNEL_OPERATOR_UNAVAILABLE'}},{status:503});
  if(init?.method==='POST'){
   const email=JSON.parse(String(init.body)).email;
   if(email.startsWith('dup'))return Response.json({error:{code:'CHANNEL_OPERATOR_CANDIDATE_AMBIGUOUS'}},{status:409});
   if(email.startsWith('missing'))return Response.json({error:{code:'CHANNEL_OPERATOR_CANDIDATE_NOT_FOUND'}},{status:404});
   const found=grants.find(g=>g.ch===ch&&g.email===email&&g.status==='active');
   if(found)return Response.json({item:{id:found.id,status:'active',replayed:true}},{status:200});
   const id='60000000-0000-4000-8000-0000000000'+String(10+grants.length);
   grants.push({id,ch,appUserId:'50000000-0000-4000-8000-0000000000'+String(10+grants.length),email,status:'active',grantedAt:'2026-11-04T01:00:00+00:00',revokedAt:null});
   return Response.json({item:{id,status:'active',replayed:false}},{status:201});
  }
  if(init?.method==='DELETE'){const g=grants.find(x=>x.id===gid);if(g){g.status='revoked';g.revokedAt='2026-11-04T02:00:00+00:00';}return Response.json({item:{id:gid,status:'revoked',replayed:false}});}
  return Response.json({items:state==='empty'?[]:grants.filter(g=>g.ch===ch).map(({ch:_c,...rest})=>rest)});
 }
 if(path.endsWith('/notices'))return Response.json({role:'operator',notices});
 if(path.endsWith('/schedules'))return Response.json({items:schedules,nextCursor:null});
 return Response.json({error:'UNMOCKED'},{status:404});
};
const parts=location.pathname.split('/').filter(Boolean);
const page=parts[0]==='admin'?<ChannelOperatorManager/>:parts[2]==='notices'?<OperatorNotices channelId={parts[1]} locale={locale}/>:parts[2]==='schedules'?<OperatorSchedules channelId={parts[1]} locale={locale}/>:<OperatorHome locale={locale}/>;
createRoot(document.getElementById('root')!).render(page);
