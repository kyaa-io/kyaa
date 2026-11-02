// Synthetic UI-only invitation queue. No account, email provider or membership is written.
export function createGroupInvitationFixture({authenticated=true,failOnce=false}:{authenticated?:boolean;failOnce?:boolean}={}){
 let handed=false,failed=false,status:'pending'|'accepted'|'declined'='pending';const receipts=new Map<string,{email:string;receipt:unknown}>();
 return (path:string,method:string,body:Record<string,unknown>|null):Response|undefined=>{
  const preview=path.match(/^\/api\/groups\/invitations\/([a-f0-9-]{36})(\/handoff)?$/);
  if(preview){
   const id=preview[1]!,pageId='e9200000-0000-4000-8000-000000000003';
   if(preview[2]&&method==='POST'){if(typeof body?.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return Response.json({error:{code:'GROUP_INVITATION_INVALID'}},{status:400});handed=true;return Response.json({ok:true});}
   if(!handed)return Response.json({error:{code:'GROUP_INVITATION_NOT_FOUND'}},{status:404});
   if(method==='GET')return Response.json({id,status,pageId,pageName:'한강 러닝 크루',pageHref:'/pages/groups/'+pageId,question:null,loginRequired:!authenticated,membershipVersion:'group-membership-v1',privacyVersion:authenticated?'2026-10-11':null,expiresAt:'2026-11-10T00:00:00Z'});
   if(method==='POST'){
    if(!authenticated)return Response.json({error:{code:'AUTHENTICATION_REQUIRED'}},{status:401});
    if(failOnce&&!failed){failed=true;return Response.json({error:{code:'GROUP_INVITATION_UNAVAILABLE'}},{status:503});}
    if(body?.action==='accept'&&(body.membershipConsent!==true||body.privacyConsent!==true))return Response.json({error:{code:'GROUP_INVITATION_CONSENT_REQUIRED'}},{status:400});
    status=body?.action==='accept'?'accepted':'declined';return Response.json({id,status,pageId});
   }
  }
  if(/^\/api\/groups\/[^/]+\/invitations$/.test(path)){
   if(method==='GET')return Response.json({items:[]});
   if(method==='POST'){
    if(!body||typeof body.email!=='string'||typeof body.requestId!=='string')return Response.json({error:{code:'GROUP_INVITATION_INVALID'}},{status:400});
    if(failOnce&&!failed){failed=true;return Response.json({error:{code:'GROUP_INVITATION_UNAVAILABLE'}},{status:503});}
    const prior=receipts.get(body.requestId);if(prior)return prior.email===body.email?Response.json(prior.receipt):Response.json({error:{code:'GROUP_INVITATION_CONFLICT'}},{status:409});
    const receipt={id:crypto.randomUUID(),status:'pending',expiresAt:'2026-11-10T00:00:00Z',deliveryStatus:'pending'};receipts.set(body.requestId,{email:body.email,receipt});return Response.json(receipt);
   }
  }
 };
}
