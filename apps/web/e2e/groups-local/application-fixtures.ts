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

export const adminApplicationFixtures=[
 {kind:'fan',name:'엔카이브 팬페이지',description:'엔카이브의 영상과 소식을 함께 나누는 팬페이지입니다.',status:'submitted',reason:null},
 {kind:'fan',name:'아티스트 팬페이지',description:'아티스트의 음악과 일상을 함께 응원합니다.',status:'changes_requested',reason:'아티스트와의 관계를 확인할 자료를 보완해 주세요.'},
 {kind:'hobby',name:'한강 러닝 크루',description:'한강에서 함께 달리고 러닝 기록을 나눠요.',status:'approved',reason:null},
 {kind:'brand',name:'브랜드 페이지',description:'브랜드 소식과 행사를 소개합니다.',status:'rejected',reason:'신청 자료에서 운영 주체를 확인할 수 없습니다.'},
].map((item,i)=>({...item,id:`f1710000-0000-4000-8000-00000000000${i+1}`,question:null,created_at:new Date(Date.UTC(2026,10,1)-(i+1)*60000).toISOString()}));
