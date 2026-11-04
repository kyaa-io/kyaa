import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {GroupGiftForm} from '@/features/groups/ui/group-gifts';
import {GroupMemberInvitationDialog} from '@/features/groups/ui/group-member-invitation';
import {GroupMembershipInvitationScreen} from '@/features/groups/ui/group-membership-invitation';
import {ActivityEvidenceTask} from '@/features/groups/ui/activity-evidence-task';
import {GroupSurveyForm} from '@/features/groups/ui/group-survey-form';
import {giftCopy} from '@/features/groups/ui/gift-copy';
import {groupInvitationCopy} from '@/features/groups/ui/group-invitation-copy';
import {activityEvidenceCopy} from '@/features/groups/ui/activity-evidence-copy';
import {groupSurveyCopy} from '@/features/groups/ui/group-survey-copy';
import {groupsCopy} from '@/features/groups/ui/copy';
import {APP_LOCALES,parseAppLocale} from '@/i18n/locales';
import type {GroupGift} from '@/features/groups/domain/gifts';
import '../../app/globals.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
const params=new URLSearchParams(location.search),locale=parseAppLocale(params.get('locale')),view=params.get('view')??'survey';
export const pageId='e9200000-0000-4000-8000-000000000003',id='e9200000-0000-4000-8000-000000000041';
const original='원문 콘텐츠를 그대로 보존합니다 — Original content remains unchanged. 긴 활동 이름과 자세한 참여 경험을 함께 기록합니다.';
const gift:GroupGift={id,pageId,pageName:original,name:'직접 입력한 선물 이름 — Original gift name',imageAssetId:id,imageUrl:'/images/groups/running-event.png',quantity:10,providerName:'직접 입력한 제공자 — Original provider',fulfillmentMethod:'on_site_pickup',fulfillmentDescription:'현장 수령',conditions:original,status:'changes_requested',revision:3,reason:original,createdAt:'2026-11-02T09:00:00Z',updatedAt:'2026-11-02T09:00:00Z',reviewedAt:null,reservedQuantity:2,availableQuantity:8};
declare global{interface Window{localizationFixture:{locales:typeof APP_LOCALES;copy:{gift:ReturnType<typeof giftCopy>;invitation:ReturnType<typeof groupInvitationCopy>;evidence:ReturnType<typeof activityEvidenceCopy>;survey:ReturnType<typeof groupSurveyCopy>;groups:ReturnType<typeof groupsCopy>};submissions:unknown[];closed:boolean;original:string}}}
window.localizationFixture={locales:APP_LOCALES,copy:{gift:giftCopy(locale),invitation:groupInvitationCopy(locale),evidence:activityEvidenceCopy(locale),survey:groupSurveyCopy(locale),groups:groupsCopy(locale)},submissions:[],closed:false,original};
document.documentElement.lang=locale;
function App(){
 const [failed,setFailed]=useState(false),[open,setOpen]=useState(true);
 const onSubmit=async(input:unknown)=>{window.localizationFixture.submissions.push(input);setFailed(true);return false;};
 const onClose=()=>{window.localizationFixture.closed=true;setOpen(false);};
 return <main data-fan-surface lang={locale} style={{maxWidth:960,margin:'32px auto',padding:'0 16px',fontFamily:'"Pretendard Variable",system-ui,sans-serif'}}>
 {view==='gift'&&<><h1>{giftCopy(locale).title}</h1><GroupGiftForm locale={locale} pageId={pageId} initial={gift} onSaved={onClose}/></>}
 {view==='invite'&&open&&<GroupMemberInvitationDialog locale={locale} pageId={pageId} onClose={onClose}/>}
 {view==='consent'&&<GroupMembershipInvitationScreen locale={locale} invitationId={id}/>}
 {(view==='photo'||view==='review')&&open&&<ActivityEvidenceTask locale={locale} kind={view} contentTitle={original} busy={false} failed={failed} checkedIn onSubmit={onSubmit} onClose={onClose}/>}
 {view==='survey'&&<GroupSurveyForm locale={locale} title={original} question={original} options={[original,'두 번째 원문 선택지 — Second original option','세 번째 원문 선택지 — Third original option']} busy={false} failed={failed} onSubmit={onSubmit}/>}
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
