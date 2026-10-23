import {runmusicCampaignSchema,runmusicStatusSchema,runmusicAdminStateSchema,type RunmusicCampaign} from "../../features/runmusic/domain";
import {OWNER_ID} from "./privy";
export const RECEIPT_ID = "91000000-0000-4000-8000-000000000002";
export const DRAW_ID = "91000000-0000-4000-8000-000000000003";
export function makeCampaign(scenario:string):RunmusicCampaign {
 const drawn=["winner","loser","not-entered","admin"].includes(scenario);
 return runmusicCampaignSchema.parse({slug:"runmusic-2026",published:true,entryOpensAt:"2026-10-20T00:00:00+09:00",entryClosesAt:"2026-10-24T14:59:00Z",resultsAt:"2026-10-24T14:59:00Z",prizes:[
  {code:"andong_yogurt_1l",label:"안동참마요거트 1L",count:15,imageUrl:"/images/runmusic/andong-yogurt-1l.png"},
  {code:"starbucks_10000",label:"스타벅스 1만원 상품권",count:150,imageUrl:"/images/kyaa-wave/starbucks-10000-voucher.jpg"},
 ],drawn,resultsPublished:drawn});
}
export function makeStatus(scenario:string,campaign:RunmusicCampaign) {
 return runmusicStatusSchema.parse({campaign,entered:!["new","restoring","closed","not-entered"].includes(scenario),liked:scenario!=="new",contact:{saved:scenario==="existing",masked:scenario==="existing"?"fi***id":null},result:scenario==="winner"?"winner":scenario==="loser"?"not_selected":scenario==="not-entered"?"not_entered":"pending",prizeCode:scenario==="winner"?"andong_yogurt_1l":null,receiptId:scenario==="winner"?RECEIPT_ID:null,receivedAt:null});
}
export function makeAdmin() {
 return runmusicAdminStateSchema.parse({campaign:makeCampaign("admin"),revision:1,participantCount:180,drawId:DRAW_ID,winnerCount:1,receivedCount:0,autoPublishEnabled:false,winners:[{appUserId:OWNER_ID,prizeCode:"andong_yogurt_1l",receiptId:RECEIPT_ID,receivedAt:null,contactSaved:true,contactMasked:"fi***id"}],delivery:{pending:1,sent:0,failed:0,skipped:0}});
}

import type {HomeBanner} from "../../features/home/domain/home-banner";
import type {AppLocale} from "../../i18n/locales";
export function makeBanner(locale:AppLocale):HomeBanner {
 return {id:"91000000-0000-4000-8000-000000000010",kind:"announcement",celebrityId:"91000000-0000-4000-8000-000000000011",title:"RUN&MUSIC × kyaa",description:locale==="ko"?"스타벅스 1만 원권 150명 · 안동참마 요거트 1L 15명":"150 Starbucks ₩10,000 vouchers · 15 안동참마 요거트 1L prizes",ctaLabel:locale==="ko"?"이벤트 보기":"View event",href:"/connect/runmusic",alt:"러닝 트랙과 음악 파형을 표현한 RUN&MUSIC 이벤트 이미지",desktopImage:{id:"91000000-0000-4000-8000-000000000012",url:"/images/runmusic/banner-desktop.png",width:1774,height:887,mimeType:"image/png",revision:1},mobileImage:{id:"91000000-0000-4000-8000-000000000013",url:"/images/runmusic/banner-mobile.png",width:1122,height:1402,mimeType:"image/png",revision:1}};
}
