import{pencilArtistCreator}from'./pencil-artist-fixture';
import type{AppLocale}from'@/i18n/locales';
// Contract-shaped data only for the local visual harness; production never imports this file.
import {activityFixture}from'./activity-fixtures';
const receipts=new Map<string,unknown>();const submissions=new Map<string,Record<string,unknown>>();
export function activityEvidenceFixture(path:string,method:string,body:Record<string,unknown>|null,mode:string|null,state:string|null,pageId:string,locale:AppLocale){
 if(!['photo','survey','review'].includes(mode??''))return undefined;
 if(mode==='photo'&&state==='upload-error'&&path==='/api/me/media/uploads'&&method==='POST')return Response.json({error:{code:'MEDIA_UNAVAILABLE'}},{status:503});
 if(mode!=='review'&&(path===`/api/groups/${pageId}`||path==='/api/groups/resolve/nchive'))return {page:{id:pageId,kind:'fan',celebrityId:pageId,slug:'nchive',name:'엔카이브 팬페이지',description:'영상·소식·응원 글',imageUrl:'/images/groups/i591ou/profile.jpg',question:null,anonymous:false,memberCount:1280},membership:{role:'member',joinedAt:'2026-11-02T00:00:00Z'},bookmarked:false};
 if(mode!=='review'&&path==='/api/public/celebrities/nchive')return{celebrity:pencilArtistCreator(locale)};
 const base=`/api/groups/${pageId}`,missionPath=path.match(/\/missions\/([a-f0-9-]+)(?:\/(submissions))?$/),eventPath=path.match(/\/events\/([a-f0-9-]+)(?:\/(review))?$/);
 if(mode==='review'&&eventPath){const fixture=activityFixture(`${base}/events/${pageId}`,'GET','review',false,pageId)as Record<string,unknown>;
  if(method==='POST'&&body){const receipt={status:'saved',eventId:pageId,currentRevision:1,review:{title:body.title,body:body.body,currentRevision:1,imageAssetId:body.imageAssetId??null,imageUrl:body.imageAssetId?'/images/groups/running-event.png':null}};receipts.set(String(body.requestId),receipt);return receipt;}
  if(!eventPath[2])return {...fixture,review:null};return undefined;
 }
 if(!missionPath)return undefined;
 const id=missionPath[1],key=pageId+':'+id,fixture=activityFixture(`${base}/missions/${pageId}`,'GET',null,false,pageId)as{mission:Record<string,unknown>};
 if(method==='POST'&&body){const requestKey=String(body.requestId);if(!receipts.has(requestKey)){const receipt={id:pageId,body:body.body,status:'pending',reason:null,rewardPoints:0,currentRevision:1,originalAttested:body.originalAttested??false,submissionKind:mode,imageAssetId:body.imageAssetId??null,imageUrl:body.imageAssetId?'/images/groups/running-event.png':null,surveyResponse:mode==='survey'?{submissionKind:'survey',missionRevision:2,question:'어떤 활동에 참여하고 싶나요?',options:['온라인 이야기 모임','오프라인 행사','팬 콘텐츠 만들기'],choiceIndex:body.surveyChoice,choiceLabel:['온라인 이야기 모임','오프라인 행사','팬 콘텐츠 만들기'][Number(body.surveyChoice)],opinion:body.body}:null};receipts.set(requestKey,receipt);submissions.set(key,receipt);}return receipts.get(requestKey);}
 const saved=submissions.get(key)??(['pending','rejected','completed'].includes(state??'')?{id:pageId,body:'직접 만든 응원 사진 설명',status:state,reason:state==='rejected'?'사진을 다시 확인할 수 있도록 보완해 주세요.':null,rewardPoints:0,currentRevision:1,originalAttested:true,submissionKind:mode,imageAssetId:pageId,imageUrl:'/images/groups/running-event.png',surveyResponse:null}:null);
 if(missionPath[2])return{items:saved?[{...saved,appUserId:pageId,nickname:'별빛',avatarUrl:null}]:[],nextCursor:null};
 return{mission:{...fixture.mission,id,imageUrl:null,rewardPoints:0,title:mode==='survey'?'예시 설문 · 함께하고 싶은 모임 활동':'응원 사진 인증',submissionKind:mode,surveyQuestion:mode==='survey'?'어떤 활동에 참여하고 싶나요?':null,surveyOptions:mode==='survey'?['온라인 이야기 모임','오프라인 행사','팬 콘텐츠 만들기']:null},submission:saved,canSubmit:!saved||saved.status==='rejected',canReview:false};
}
