import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ActivityEvidenceTask} from '@/features/groups/ui/activity-evidence-task';
import {GroupQualificationForm,type QualificationApplication} from '@/features/groups/ui/group-qualification';
import {SourceDiscardDialog,sourceDiscardConfirmation} from '@/features/groups/ui/source-confirm-dialog';
import {activityEvidenceCopy} from '@/features/groups/ui/activity-evidence-copy';
import {qualificationSupplementCopy} from '@/features/groups/ui/qualification-supplement-copy';
import {groupsCopy} from '@/features/groups/ui/copy';
import {APP_LOCALES,parseAppLocale} from '@/i18n/locales';
import '../../app/globals.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
const params=new URLSearchParams(location.search),locale=parseAppLocale(params.get('locale')),view=params.get('view')??'review';
const application:QualificationApplication={id:'e9200000-0000-4000-8000-000000000041',kind:'hobby',submissionRevision:3,qualification:{communityName:'Original club',evidenceUrl:'https://example.test/club',introduction:'Original explanation',assetIds:['e9200000-0000-4000-8000-000000000042']}};
const noop=()=>{};
const confirmation=sourceDiscardConfirmation({locale,onContinue:noop,onDiscard:noop});
const fixture={locales:APP_LOCALES,closed:0,submissions:[] as unknown[],copy:{evidence:activityEvidenceCopy(locale),qualification:qualificationSupplementCopy(locale),groups:groupsCopy(locale),discardTitle:confirmation.title},application};
declare global{interface Window{discardFixture:typeof fixture}}
window.discardFixture=fixture;
document.documentElement.lang=locale;
function App(){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const close=()=>{fixture.closed++;setOpen(false);};
 async function submit(input:unknown){fixture.submissions.push(input);setBusy(true);setFailed(false);try{const response=await fetch('/api/discard-evidence',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});if(!response.ok)throw Error('fixture failure');return true;}catch{setFailed(true);return false;}finally{setBusy(false);}}
 return <main data-fan-surface lang={locale} style={{minHeight:'200vh',padding:'32px 16px',fontFamily:'"Pretendard Variable",sans-serif'}}><h1>한강 러닝 크루</h1><p>운영 자료와 활동 기록</p><div style={{height:240}}/><button id='open-task' onClick={()=>setOpen(true)}>Open task</button><div style={{height:800}}/>
 {view==='standalone'&&<textarea aria-label='Page draft' defaultValue='Original page draft'/>}
 {open&&(view==='qualification'?<GroupQualificationForm locale={locale} application={application} supplement={{status:'보완 요청',reason:'운영 중인 모임의 활동 기록과 직접 작성한 설명을 함께 제출해 주세요.',onClose:close}}/>:view==='standalone'?<SourceDiscardDialog locale={locale} onContinue={close} onDiscard={close}/>:<ActivityEvidenceTask locale={locale} kind={view==='photo'?'photo':'review'} contentTitle='한강 러닝 크루 정기 모임 — Original activity' checkedIn busy={busy} failed={failed} onSubmit={submit} onClose={close}/>)}
 </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
