// Loopback-only confirmation workflow. Never imported by production code.
import{activityFixture}from'./activity-fixtures';
const results=new Map<string,{status:'pending';eventId:string}>(),failures=new Set<string>();let applied=false;
export function eventApplicationFixture(path:string,method:string,body:Record<string,unknown>|null,pageId:string,state:string|null){
 const base=`/api/groups/${pageId}/events/${pageId}`;
 if(path===base&&method==='GET'){const detail=activityFixture(base,'GET',null,false,pageId)as{event:Record<string,unknown>;participation:Record<string,unknown>};return{...detail,event:{...detail.event,entryStatus:applied?'pending':'none'},participation:{...detail.participation,status:applied?'pending':'none',participantName:'하늘'},canApply:!applied};}
 if(path===`${base}/applications`&&method==='POST'&&body){const key=String(body.requestId);if(state==='application-error'&&!failures.has(key)){failures.add(key);return Response.json({error:{code:'GROUP_ACTIVITY_UNAVAILABLE'}},{status:503});}if(!results.has(key))results.set(key,{status:'pending',eventId:pageId});applied=true;return results.get(key);}
 return undefined;
}
