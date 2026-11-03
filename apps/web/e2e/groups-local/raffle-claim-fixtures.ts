// Local-only recipient journey; no production recipient data are stored here.
const id='e9200000-0000-4000-8000-000000000001';
let submitted=sessionStorage.getItem('groups-claim-submitted')==='1';
export function raffleClaimFixture(url:URL,method:string,body:unknown,state:string|null){
 if(!state?.startsWith('claim'))return;
 const base=`/api/groups/${id}/raffles/${id}`;
 if(url.pathname===`${base}/recipient`&&method==='POST'){
  const input=body as Record<string,unknown>;
  if(!input.name||!input.phone||!input.consented||input.consentVersion!=='fixture-consent-v1')return Response.json({error:{code:'INVALID_INPUT'}},{status:400});
  submitted=true;sessionStorage.setItem('groups-claim-submitted','1');return Response.json({id,status:'submitted'});
 }
 if(url.pathname!==base||method!=='GET')return;
 const document={title:'수령 정보 이용 안내',body:'이 예시에서는 수령 정보 제출 화면만 확인합니다.',documentUrl:null,items:[{id:'recipient',label:'수령 정보 이용에 동의합니다.',required:true}]};
 return Response.json({raffle:{id,benefitId:null,title:'러닝 크루 경품 추첨',summary:'함께 달린 회원을 위한 경품',imageUrl:'/images/avatars/star-pink.webp',winnerQuantity:1,status:'closed',entryOpensAt:null,entryClosesAt:'2026-10-31T00:00:00Z',resultsPublishedAt:'2026-11-01T00:00:00Z',fulfillmentMethod:'physical_shipping',perFanTicketLimit:1},enteredTickets:1,winner:{id,status:state==='claim-expired'?'expired':submitted||state==='claim-submitted'?'submitted':'information_required',submitBy:state==='claim-expired'?'2026-10-31T00:00:00Z':'2100-01-01T00:00:00Z'},canManage:false,member:true,canEnter:false,consentVersion:'fixture-consent-v1',consentDocuments:{ko:document,en:document}});
}
