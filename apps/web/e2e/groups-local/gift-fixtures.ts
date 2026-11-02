// Loopback-only contract fixture. No production API or database write.
import type {GroupGift} from '@/features/groups/domain/gifts';
const application='e9200000-0000-4000-8000-000000000041';
const receipts=new Map<string,unknown>();
export function giftFixture(path:string,method:string,body:Record<string,unknown>|null,state:string|null,pageId:string){
 if(!path.includes('/gift-applications'))return undefined;
 const status=state==='gift-approved'?'approved':state==='gift-rejected'?'rejected':state==='gift-changes'?'changes_requested':'reviewing';
 const item:GroupGift={id:application,pageId,pageName:'한강 러닝 크루',name:'러닝 굿즈',imageAssetId:application,imageUrl:'/images/groups/running-event.png',quantity:10,providerName:'한강 러닝 크루',fulfillmentMethod:'on_site_pickup',fulfillmentDescription:'현장 수령',conditions:'모임 참여자',status,revision:2,reason:status==='changes_requested'?'제공 주체와 지급 가능 여부를 확인할 자료가 필요해요.':status==='rejected'?'제공 조건을 확인할 수 없어요.':'신청한 선물의 제공 조건을 확인하고 있어요.',createdAt:'2026-11-02T09:00:00Z',updatedAt:'2026-11-02T10:00:00Z',reviewedAt:'2026-11-02T10:00:00Z',reservedQuantity:0,availableQuantity:10};
 if(method==='POST'||method==='PATCH'){const key=String(body?.requestId);if(!receipts.has(key))receipts.set(key,{id:application,status:method==='POST'?'submitted':'submitted',revision:3});return Response.json(receipts.get(key));}
 return Response.json(path.endsWith(application)?{application:item,history:[{revision:2,status:item.status,reason:item.reason,createdAt:item.updatedAt}]}:{items:[item],nextCursor:null});
}
