// Isolated data for real event operator/participant components; production never imports this.
import {activityFixture} from './activity-fixtures';
export function createEventOperationsFixture(pageId:string,state:string|null){
 let failed=false,savedTitle:string|undefined,savedState:string|undefined,savedReason:string|null|undefined,savedMission:string|null|undefined,revision=1;
 return (path:string,method:string,body:Record<string,unknown>|null)=>{
  const base=`/api/groups/${pageId}/events/${pageId}`;
  if(path!==base)return;
  const response=activityFixture(path,'GET',state==='review'?'review':'manager',false,pageId);
  if(!response||!('event' in response)||!response.event)return;
  const event={...response.event,...(state==='review'?{startsAt:'2026-10-31T09:00:00Z',endsAt:'2026-10-31T12:00:00Z',opensAt:'2026-10-01T00:00:00Z',closesAt:'2026-10-30T09:00:00Z'}:{}),title:savedTitle??response.event.title,state:savedState??(state==='review'?'ended':'draft'),revision,linkedMissionId:savedMission??null,cancellationReason:savedReason??null};
  if(method==='PATCH'){
   window.dispatchEvent(new CustomEvent('fixture-event-operations-write',{detail:body}));
   if(!failed&&((state==='publish-error'&&body?.state==='published')||(state==='cancel-error'&&body?.state==='cancelled'))){failed=true;return Response.json({error:{code:'UNAVAILABLE'}},{status:503});}
   if(typeof body?.title==='string')savedTitle=body.title;if(typeof body?.state==='string')savedState=body.state;
   if(body&&'cancellationReason' in body)savedReason=body.cancellationReason as string|null;
   if(body&&'linkedMissionId' in body)savedMission=body.linkedMissionId as string|null;
   revision++;return Response.json({event:{...event,...body,linkedMissionId:savedMission??null,cancellationReason:savedReason??null,revision,requestId:undefined,expectedRevision:undefined}});
  }
  if(method==='GET')return Response.json({...response,event,canManage:state!=='review',canApply:false,canReview:state==='review',participation:{...response.participation,status:'confirmed',checkedInAt:state==='review'?'2026-10-31T09:00:00Z':null},review:state==='review'?{title:'행사 후기',body:'원문 후기 내용',currentRevision:1,imageAssetId:null,imageUrl:null}:null});
 };
}
