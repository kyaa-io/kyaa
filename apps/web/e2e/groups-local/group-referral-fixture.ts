// Isolated UI fixtures; production calls communityStampAction against authenticated APIs.
export function groupReferralFixture(path:string,method:string,body:Record<string,unknown>|null,state:string|null){
 if(!path.startsWith('/api/community-stamps/')||method!=='POST')return;
 if(state==='error')return Response.json({error:{code:'COMMUNITY_STAMP_UNAVAILABLE'}},{status:503});
 if(path.endsWith('/invite-short-link'))return Response.json({slug:'k7m2qpz'});
 if(path.endsWith('/invite-code'))return Response.json({code:'LOCAL123',redeemed:false,redemptionState:'none'});
 if(path.endsWith('/redeem-invite'))return /^[a-z0-9-]{6,32}$/i.test(String(body?.code??''))?Response.json({state:'registered_pending_fan_verification'}):Response.json({error:{code:'COMMUNITY_STAMP_INVALID_INPUT'}},{status:400});
 if(path.endsWith('/invitation-overview')){const history=state==='empty'?[]:(['pending_fan_verification','qualified_reward_issued','registration_cancelled']as const).map((state,index)=>({id:`e9200000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,state,registeredAt:'2026-11-01T00:00:00Z',resolvedAt:index?'2026-11-02T00:00:00Z':null}));return Response.json({registeredCount:history.length,pendingCount:history.length?1:0,qualifiedCount:history.length?1:0,history});}
}
