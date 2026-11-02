// Isolated browser fixtures only. Never used by a production API or seed.
export const fixtureId='e9200000-0000-4000-8000-000000000001';
const date='2026-11-07T09:00:00Z';
export function activityFixture(path:string,method:string,state:string|null,brand=false,pageId=fixtureId){
 const id=pageId,empty=state==='empty',manager=['manager','changes','already'].includes(state??'');
 const event={id,title:brand?'RUN&MUSIC FESTIVAL':'한강 러닝 크루 정기 모임',description:brand?'러닝과 음악을 함께 즐기는 시간':'편한 복장으로 와주세요.',imageUrl:brand?'/images/groups/runmusic-pencil.jpg':'/images/groups/running-event.png',startsAt:date,endsAt:'2026-11-07T12:00:00Z',opensAt:'2026-10-01T00:00:00Z',closesAt:'2026-11-06T23:00:00Z',location:'한강공원',capacity:80,requiresApproval:true,state:state==='cancelled'?'cancelled':state==='closed'?'ended':'published',revision:3,official:false,entryStatus:['confirmed','checked-in','review'].includes(state??'')?'confirmed':state==='pending'?'pending':'none',ticketAvailable:['confirmed','checked-in','review'].includes(state??'')};
 const mission={id,title:'함께 달린 오늘의 기록',instructions:'활동 기록을 남겨 주세요.',imageUrl:null,state:'published',revision:2,rewardPoints:20,status:state==='pending'?'pending':'available',actionHref:`/pages/groups/${id}/missions/${id}`};
 const raffle={id,benefitId:null,title:pageId.endsWith('000003')?'러닝 크루 회원을 위한 경품':'엔카이브 굿즈 추첨',summary:'페이지 가입 회원 · 1인 최대 100장',imageUrl:'/images/groups/nchive-prize-pencil.png',winnerQuantity:5,status:'open',entryOpensAt:null,entryClosesAt:'2026-11-07T09:00:00Z',resultsPublishedAt:null,fulfillmentMethod:'physical_shipping',perFanTicketLimit:100};
 const sourceMissions=[
 {...mission,title:'응원 사진 남기기',instructions:'엔카이브 응원 사진을 올려주세요.',imageUrl:'/images/groups/nchive-group.webp',status:'pending',actionHref:`/pages/groups/${id}/missions/${id}`},
 {...mission,id:'e9400000-0000-4000-8000-000000000002',title:'오늘의 설문',instructions:'설문에 답해 주세요.',status:'completed',actionHref:`/pages/groups/${id}/missions/e9400000-0000-4000-8000-000000000002`},
 {...mission,id:'e9400000-0000-4000-8000-000000000003',title:'현장 QR 미션',instructions:'행사장 QR을 스캔해 참여하세요.',status:'available',actionHref:`/pages/groups/${id}/missions/e9400000-0000-4000-8000-000000000003`}
 ];
 const base=`/api/groups/${id}`;
 if(path===`${base}/notifications`)return {enabled:state!=='notifications-off',notices:true,events:true,recipients:true,activity:true};
 if(path===`${base}/reports`)return {items:empty?[]:[{id,targetType:'post',targetId:id,reason:'스팸',status:'submitted',createdAt:date,targetPostId:id,targetRoomId:null},{id:'e9200000-0000-4000-8000-000000000002',targetType:'comment',targetId:id,reason:'댓글 신고',status:'reviewing',createdAt:date,targetPostId:id,targetRoomId:null}],nextCursor:null};
 if(path.startsWith(`${base}/events/`)&&path.endsWith('/check-in')&&method==='POST')return {status:'checked_in',registrationId:id,checkedInAt:'2026-11-07T09:00:00Z',alreadyCheckedIn:state==='already',replayed:false};
 if(path===`${base}/events/${id}/official-application`&&method==='GET')return {items:state==='changes'?[{id,eventId:id,eventRevision:3,description:'행사 원문 소개와 제출 내용',sourceUrl:'https://example.com/evidence',status:'changes_requested',reason:'행사 소개를 보완해 주세요.',createdAt:date,reviewedAt:date,previousApplicationId:null}]:[],nextCursor:null};
 if(path===`${base}/events/${id}/support`&&method==='GET')return {attendanceCount:12,reviewCount:5,items:state==='changes'?[{id,eventId:id,revision:1,description:'행사 참석과 후기 내역',sourceUrl:'https://example.com/reviews',status:'changes_requested',reason:'누락된 후기를 연결해 주세요.',createdAt:date,reviewedAt:date,previousSubmissionId:null}]:[],nextCursor:null};
 if(method!=='GET'&&[`${base}/events`,`${base}/missions`,`${base}/collections`].some(x=>path.startsWith(x)))return {id};
 if(path===`${base}/activities`)return {certificationHref:null,missions:empty?[]:[mission],events:empty?[]:[event],raffles:empty?[]:[raffle]};
 if(path===`${base}/events`)return {events:empty?[]:[event],canManage:manager,nextCursor:null};
 if(path===`${base}/missions`)return {missions:empty?[]:sourceMissions,canManage:manager,nextCursor:null};
 if(path===`${base}/collections`)return {items:empty?[]:['포토카드','아크릴 키링'].map((title,index)=>({id:index?'e9500000-0000-4000-8000-000000000002':id,title,imageUrl:'/images/groups/nchive-goods-concept.png',externalUrl:'https://kyaa.io/?utm_source=fixture#collection',status:state==='sold-out'?'sold_out':'active',revision:1})),canManage:manager,nextCursor:null};
 if(path===`${base}/events/${id}`)return {event,participation:{status:event.entryStatus,ticketId:event.ticketAvailable?id:null,checkedInAt:['checked-in','review'].includes(state??'')?date:null},canApply:event.entryStatus==='none'&&event.state==='published',canReview:state==='review',canManage:manager};
 if(path===`${base}/events/${id}/ticket`)return {participantName:'하늘',qrPayload:`kyaa-event:${id}:${'a'.repeat(64)}`,status:['checked-in','review'].includes(state??'')?'checked_in':'valid'};
 if(path===`${base}/events/${id}/participants`)return {items:[{id,appUserId:id,nickname:'별빛',avatarUrl:null,status:'pending',checkedInAt:null}],nextCursor:null};
 const selectedMission=sourceMissions.find(item=>path===`${base}/missions/${item.id}`);
 if(selectedMission)return {mission:selectedMission,submission:state==='pending'?{id,body:'오늘 함께 달렸어요.',status:'pending',reason:null,rewardPoints:0}:null,canSubmit:state!=='pending',canReview:manager};
 if(path===`${base}/missions/${id}/submissions`)return {items:[{id,appUserId:id,nickname:'별빛',avatarUrl:null,body:'함께 달린 기록이에요.',status:'pending',reason:null,rewardPoints:0}],nextCursor:null};
 if(path===`${base}/raffles`)return {raffles:empty?[]:[raffle]};
 if(path===`${base}/raffles/${id}`)return {raffle,enteredTickets:30,winner:null,canManage:manager,member:true,consentVersion:null,canEnter:true};
 return undefined;
}
