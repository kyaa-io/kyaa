// Local immutable original application + resubmission projection; never a production seed.
export const applicationFixtureId='e9200000-0000-4000-8000-000000000001';
const original={id:applicationFixtureId,kind:'hobby',name:'한강 러닝 크루',description:'한강에서 함께 달려요.',question:'함께 달리고 싶은 시간을 알려주세요.',imageUrl:'/images/groups/running-event.png',created_at:'2026-11-01T12:00:00Z'};
let submitted:Record<string,unknown>|null=null;
export function applicationFixture(path:string,method:string,body:Record<string,unknown>|null,state:string|null):Response|undefined{
 if(!['application-changes','application-approved'].includes(state??''))return undefined;
 if(path===`/api/groups/applications/${applicationFixtureId}`&&method==='PATCH'){
  submitted={...original,...body,status:'submitted',reason:null};return Response.json({id:applicationFixtureId,status:'submitted',pageId:null});
 }
 if(path==='/api/groups/applications'&&method==='GET')return Response.json({items:[submitted??{...original,status:state==='application-approved'?'approved':'changes_requested',reason:state==='application-approved'?null:'함께 달릴 장소와 시간을 소개에 보완해 주세요.'}],nextCursor:null});
 return undefined;
}
