// Loopback fixture projections only. Never import into production APIs.
export const SOURCE_CONTENT_STATE_NODES={
 board:['W0Xri','Z6ErKw','yF1U1','D0ZIq','L3N3DQ','MY9YB'],
 comments:['CqipF','rviuM','H5mg5','tijFm'],
 event:['jn589','teuy6','TZ546','b97Jl','bWeEa','QABMA','uONGB','cpRNM','Q8M9AR','XIfOn','HNDKv'],
 mission:['mDaVG','L9zSo','VTA0g'],
 collection:['kgWAV','g5X3vW','dhhrY','f1AE6v'],
} as const;
const known=new Set<string>(Object.values(SOURCE_CONTENT_STATE_NODES).flat());
const inFamily=(family:readonly string[],node:string)=>family.includes(node);
const nodeOf=(state:string|null)=>state?.replace(/^source-/,'')??'';
const postList=/^\/api\/groups\/[^/]+\/posts$/;
const postDetail=/^\/api\/(?:groups\/[^/]+\/posts|posts)\/[^/]+$/;
const fanFeed=/^\/api\/celebrities\/[^/]+\/feed$/;
const postWrite=/^\/api\/(?:groups|celebrities)\/[^/]+\/posts$/;
const comments=/^\/api\/(?:groups\/[^/]+\/posts|posts)\/[^/]+\/comments$/;
const eventDetail=/^\/api\/groups\/[^/]+\/events\/[^/]+$/;
const eventApply=/^\/api\/groups\/[^/]+\/events\/[^/]+\/applications$/;
const eventCheckIn=/^\/api\/groups\/[^/]+\/events\/[^/]+\/(?:check-in|participants\/[^/]+\/check-in)$/;
const collections=/^\/api\/groups\/[^/]+\/collections$/;
const collectionWrite=/^\/api\/groups\/[^/]+\/collections(?:\/[^/]+)?$/;
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const rows=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)?value.map(record):[];
const reply=(body:unknown,node:string,status=200,original?:Response)=>{
 const headers=new Headers(original?.headers);headers.delete('content-length');headers.set('x-kyaa-local-source-state',node);
 return Response.json(body,{status,headers});
};
/** Run before the mutable base fixture so failed writes never create or edit a row. */
export function sourceContentStateFailure(url:URL,method:string,state:string|null):Response|undefined{
 const node=nodeOf(state),path=url.pathname,verb=method.toUpperCase();
 const fail=(code:string,status=503)=>reply({error:{code}},node,status);
 if(node==='MY9YB'&&verb==='POST'&&postWrite.test(path))return fail(path.startsWith('/api/groups/')?'GROUPS_UNAVAILABLE':'FAN_WEB_UNAVAILABLE');
 if(node==='TZ546'&&verb==='POST'&&eventApply.test(path))return fail('GROUP_ACTIVITY_UNAVAILABLE');
 if(node==='bWeEa'&&verb==='POST'&&eventCheckIn.test(path))return fail('GROUP_ACTIVITY_INVALID',400);
 if(node==='dhhrY'&&['POST','PATCH'].includes(verb)&&collectionWrite.test(path))return fail('GROUP_ACTIVITY_UNAVAILABLE');
 if(node==='H5mg5'&&verb==='POST'&&comments.test(path))return fail('AUTHENTICATION_REQUIRED',401);
 if(node==='tijFm'&&verb==='POST'&&comments.test(path))return fail(path.startsWith('/api/groups/')?'GROUPS_FORBIDDEN':'FAN_WEB_FORBIDDEN',403);
}
/** fixtureDelayMs explicitly exposes finite loading; no delay occurs on unrelated paths. */
export async function sourceContentStateResponse(response:Response,url:URL,method:string,state:string|null):Promise<Response>{
 const node=nodeOf(state),path=url.pathname,get=method.toUpperCase()==='GET';
 if(!known.has(node))return response;
 const failedWrite=sourceContentStateFailure(url,method,state);
 if(failedWrite)return failedWrite;
 const boardPath=postList.test(path)||postDetail.test(path)||fanFeed.test(path),commentPath=comments.test(path),groupPath=/^\/api\/groups\/[^/]+$/.test(path);
 const eventPath=eventDetail.test(path)||/^\/api\/groups\/[^/]+\/events$/.test(path)||/^\/api\/groups\/[^/]+\/events\/[^/]+\/(ticket|participants)$/.test(path);
 const missionPath=/^\/api\/groups\/[^/]+\/missions(?:\/[^/]+)?$/.test(path),collectionPath=collections.test(path);
 const handles=get&&((inFamily(SOURCE_CONTENT_STATE_NODES.board,node)&&boardPath)||(node==='L3N3DQ'&&(groupPath||commentPath))||(inFamily(SOURCE_CONTENT_STATE_NODES.comments,node)&&(commentPath||node==='rviuM'&&postDetail.test(path)||node==='tijFm'&&groupPath))||(inFamily(SOURCE_CONTENT_STATE_NODES.event,node)&&eventPath)||(inFamily(SOURCE_CONTENT_STATE_NODES.mission,node)&&missionPath)||(inFamily(SOURCE_CONTENT_STATE_NODES.collection,node)&&collectionPath))||['QABMA','uONGB'].includes(node)&&method.toUpperCase()==='POST'&&eventCheckIn.test(path);
 if(!handles)return response;
 if(url.searchParams.has('fixtureDelayMs')){
  const milliseconds=Number(url.searchParams.get('fixtureDelayMs'));
  await new Promise(resolve=>setTimeout(resolve,Number.isFinite(milliseconds)?Math.max(0,Math.min(1200,milliseconds)):1200));
 }
 const fail=(code:string,status=503)=>reply({error:{code}},node,status,response);
 if(node==='Z6ErKw'&&boardPath)return fail(path.startsWith('/api/groups/')?'GROUPS_UNAVAILABLE':'FAN_WEB_UNAVAILABLE');
 if(node==='D0ZIq'&&postDetail.test(path))return fail(path.startsWith('/api/groups/')?'GROUPS_FORBIDDEN':'FAN_WEB_FORBIDDEN',403);
 if(node==='CqipF'&&commentPath)return fail(path.startsWith('/api/groups/')?'GROUPS_UNAVAILABLE':'FAN_WEB_UNAVAILABLE');
 if(node==='kgWAV'&&collectionPath)return fail('GROUP_ACTIVITY_UNAVAILABLE');
 let body:Record<string,unknown>;
 try{body=record(await response.clone().json());}catch{return response;}
 if(!response.ok)return response;
 const send=(value:unknown)=>reply(value,node,response.status,response);
 if(node==='yF1U1'&&(postList.test(path)||fanFeed.test(path)))return send({...body,items:[],nextCursor:null});
 if(node==='rviuM'){
  if(commentPath)return send({...body,items:[],nextCursor:null});
  if(postDetail.test(path))return send(body.post?{...body,post:{...record(body.post),commentCount:0}}:{...body,commentCount:0});
 }
 if(node==='tijFm'&&groupPath&&body.page)return send({...body,membership:null});
 if(node==='L3N3DQ'){
  if(groupPath&&body.page)return send({...body,page:{...record(body.page),anonymous:true}});
  const anonymous=(item:Record<string,unknown>)=>({...item,anonymous:true,profileId:null,nickname:'익명',avatarUrl:null});
  if((postList.test(path)||commentPath)&&path.startsWith('/api/groups/'))return send({...body,items:rows(body.items).map(anonymous)});
  if(postDetail.test(path)&&path.startsWith('/api/groups/')&&body.id)return send(anonymous(body));
 }
 if(inFamily(SOURCE_CONTENT_STATE_NODES.event,node)){
  const status=node==='HNDKv'?'pending':['jn589','TZ546','XIfOn'].includes(node)?'none':'confirmed';
  const projectedEvent=(event:Record<string,unknown>)=>({...event,entryStatus:status,ticketAvailable:status==='confirmed',...(node==='Q8M9AR'?{state:'cancelled'}:node==='XIfOn'?{state:'ended',closesAt:'2000-01-01T00:00:00Z'}:{})});
  if(body.event&&eventDetail.test(path)){
   const event=record(body.event),checkedIn=node==='cpRNM'||node==='QABMA';
   return send({...body,event:projectedEvent(event),participation:{...record(body.participation),status,ticketId:status==='confirmed'?record(body.participation).ticketId??event.id:null,checkedInAt:checkedIn?'2026-11-07T09:00:00Z':null},canApply:status==='none'&&!['XIfOn','Q8M9AR'].includes(node),canReview:node==='cpRNM',...(['bWeEa','QABMA','uONGB'].includes(node)?{canManage:true}:{})});
  }
  if(Array.isArray(body.events))return send({...body,events:rows(body.events).map(projectedEvent)});
  if(/\/ticket$/.test(path)&&body.qrPayload)return send({...body,status:node==='QABMA'||node==='cpRNM'?'checked_in':'valid'});
  if(eventCheckIn.test(path)&&body.status==='checked_in')return send({...body,alreadyCheckedIn:node==='QABMA'});
 }
 if(inFamily(SOURCE_CONTENT_STATE_NODES.mission,node)){
  const status=node==='L9zSo'?'rejected':node==='VTA0g'?'completed':'pending';
  if(Array.isArray(body.missions))return send({...body,missions:rows(body.missions).map((mission,index)=>index===0?{...mission,status}:mission)});
  if(body.mission){const mission=record(body.mission),submission=record(body.submission);return send({...body,mission:{...mission,status},submission:{...submission,id:submission.id??mission.id,body:submission.body??mission.instructions,status,reason:status==='rejected'?'미션 조건을 확인할 수 있도록 사진을 보완해 주세요.':null,rewardPoints:status==='completed'?mission.rewardPoints:0},canSubmit:status==='rejected'});}
 }
 if(['g5X3vW','f1AE6v'].includes(node)&&collectionPath)return send({...body,items:rows(body.items).map(item=>({...item,status:node==='g5X3vW'?'hidden':'sold_out'})),...(node==='g5X3vW'?{canManage:true}:{})});
 return response;
}
