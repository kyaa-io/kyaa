// Synthetic L6 examples, used only by the loopback Vite harness.
export function withLeaderRaffleFixture(delegate:typeof fetch,params:URLSearchParams):typeof fetch {
 if(!params.has('leaderL6'))return delegate;
 const id='e9200000-0000-4000-8000-000000000003';
 let entered=0;
 const receipts=new Map<string,unknown>();
 return (async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
  const path=url.pathname,method=init?.method??'GET',scenario=params.get('leaderL6');
  const json=(data:unknown,status=200)=>Response.json(data,{status});
  if(path===`/api/groups/${id}`){const r=await delegate(input,init);const data=await r.json();return json({...data,page:{...data.page,name:'주말 러닝 모임'},membership:{role:'owner',joinedAt:'2026-10-01T00:00:00Z'}});}
  if(path===`/api/groups/${id}/gift-applications`)return json({items:[],nextCursor:null});
  const rafflePath=`/api/groups/${id}/raffles/${id}`;
  if(path===`/api/groups/${id}/raffles`&&method==='POST')return json({id});
  if(path===rafflePath&&method==='GET'){
   const result=scenario==='result',met=scenario!=='unmet',pending=scenario==='pending';
   return json({raffle:{id,benefitId:id,title:'주말 러닝 기프트카드',summary:'',imageUrl:null,winnerQuantity:2,status:result?'closed':'open',entryOpensAt:'2026-10-01T00:00:00Z',opensAt:'2026-10-01T00:00:00Z',entryClosesAt:result?'2026-10-30T00:00:00Z':new Date(Date.now()+7*86400000).toISOString(),resultsPublishedAt:result?'2026-10-30T00:01:00Z':null,fulfillmentMethod:'digital',perFanTicketLimit:1,entryMode:'free',attendanceSource:'visit',approvalStatus:pending?'pending':'approved',conditions:[{type:'attendance_days',min:3},{type:'post_or_comment',min:1}]},enteredTickets:result?1:entered,winner:null,canManage:false,member:true,canEnter:met&&!pending&&!result&&entered===0,conditionProgress:[{type:'attendance_days',min:3,current:met?3:2,met},{type:'post_or_comment',min:1,current:1,met:true}],winnersMasked:result?['김*','이*']:[],consentVersion:null});
  }
  if(path===`${rafflePath}/entries`&&method==='POST'){
   const body=JSON.parse(String(init?.body));if(receipts.has(body.requestId))return json(receipts.get(body.requestId));
   if(entered)return json({error:{code:'GROUP_RAFFLE_LIMIT'}},409);
   entered=1;const receipt={id,amount:1,enteredTickets:1,tickets:0};receipts.set(body.requestId,receipt);return json(receipt);
  }
  if(path==='/api/me/wallet'){const r=await delegate(input,init);return json({...await r.json(),tickets:0});}
  return delegate(input,init);
 }) as typeof fetch;
}
