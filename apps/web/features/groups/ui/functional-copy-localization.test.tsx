import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {APP_LOCALES} from '@/i18n/locales';
import {giftCopy} from './gift-copy';
import {groupInvitationCopy} from './group-invitation-copy';
import {activityEvidenceCopy} from './activity-evidence-copy';
import {groupSurveyCopy} from './group-survey-copy';
import {operatorToolsCopy} from './operator-tools-copy';
import {ActivityEvidenceTask} from './activity-evidence-task';
import {GroupSurveyForm} from './group-survey-form';
const upload=vi.hoisted(()=>({items:[] as {key:string;assetId:string;failed?:boolean}[],ready:false,busy:false,invalid:false,markUsed:vi.fn(),remove:vi.fn(),add:vi.fn()}));
vi.mock('@/features/content-safety/ui/use-wave-media-upload',()=>({useWaveMediaUpload:()=>upload}));
vi.mock('./group-image',()=>({GroupImage:()=> <img alt=''/>}));
beforeAll(()=>{
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}});
});
beforeEach(()=>{vi.clearAllMocks();upload.items=[];upload.ready=false;upload.busy=false;upload.invalid=false;});
afterEach(cleanup);
it.each(APP_LOCALES)('%s has complete, explicit functional translations and preserves the invitation token',locale=>{
 for(const getCopy of [giftCopy,groupInvitationCopy,activityEvidenceCopy,groupSurveyCopy,operatorToolsCopy]){
  const localized:Record<string,string>=getCopy(locale),english:Record<string,string>=getCopy('en');
  expect(Object.keys(localized).sort()).toEqual(Object.keys(english).sort());
  for(const [key,value] of Object.entries(localized)){
   expect(value.trim(),`${locale}.${key}`).not.toBe('');
   if(locale!=='en'&&locale!=='ko')expect(value,`${locale}.${key}`).not.toBe(english[key]);
  }
 }
 expect(groupInvitationCopy(locale).invited.match(/\{name\}/g)).toHaveLength(1);
});
it.each(APP_LOCALES)('%s survey retains source content, selected index and optional original opinion after failure',locale=>{
 const c=groupSurveyCopy(locale),submit=vi.fn(async()=>false);
 render(<GroupSurveyForm locale={locale} title='원문 제목 — Original' question='원문 질문?' options={['원문 첫 번째','원문 두 번째','원문 세 번째']} busy={false} failed onSubmit={submit}/>);
 expect(screen.getByRole('heading',{name:c.title})).toBeVisible();
 expect(screen.getByText('원문 제목 — Original')).toBeVisible();
 expect(screen.getByRole('group',{name:'원문 질문?'})).toBeVisible();
 const input=screen.getByRole('textbox',{name:c.comments});
 expect(input).toHaveAttribute('placeholder',c.placeholder);
 fireEvent.submit(input.closest('form')!);expect(submit).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('radio',{name:'원문 두 번째'}));
 fireEvent.submit(input.closest('form')!);expect(submit).toHaveBeenLastCalledWith({body:'',surveyChoice:1});
 fireEvent.change(input,{target:{value:'직접 쓴 답변 — Do not translate'}});
 fireEvent.submit(input.closest('form')!);
 expect(submit).toHaveBeenLastCalledWith({body:'직접 쓴 답변 — Do not translate',surveyChoice:1});
 expect(input).toHaveValue('직접 쓴 답변 — Do not translate');
 expect(screen.getByRole('alert')).toHaveTextContent(c.error);
 expect(screen.getByRole('button',{name:c.submit})).toBeEnabled();
});
it.each(APP_LOCALES)('%s photo failure keeps input, localizes file label and reselect, and requires consent',async locale=>{
 const c=activityEvidenceCopy(locale),submit=vi.fn(async()=>false);
 upload.items=[{key:'failed',assetId:'e9750000-0000-4000-8000-000000000006',failed:true}];
 const view=render(<ActivityEvidenceTask locale={locale} kind='photo' contentTitle='원문 활동' busy={false} failed={false} onSubmit={submit} onClose={vi.fn()}/>);
 const input=screen.getByRole('textbox',{name:c.description});fireEvent.change(input,{target:{value:'원문 설명'}});
 expect(screen.getByRole('dialog',{name:c.photoTitle})).toBeVisible();
 expect(screen.getByRole('alert')).toHaveTextContent(c.uploadFailed);
 expect(screen.getByRole('checkbox',{name:c.attestation})).not.toBeChecked();
 expect(screen.getByRole('button',{name:c.submitPhoto})).toBeDisabled();
 expect(screen.getByText(c.chooseAgain)).toBeVisible();
 const file=new File(['photo'],'local.png',{type:'image/png'});
 fireEvent.change(screen.getByLabelText(c.evidencePhoto),{target:{files:[file]}});
 expect(upload.add).toHaveBeenCalledWith([file],'failed');
 upload.items=[{key:'ready',assetId:'e9750000-0000-4000-8000-000000000006'}];upload.ready=true;
 view.rerender(<ActivityEvidenceTask locale={locale} kind='photo' contentTitle='원문 활동' busy={false} failed={false} onSubmit={submit} onClose={vi.fn()}/>);
 fireEvent.submit(input.closest('form')!);expect(submit).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('checkbox',{name:c.attestation}));fireEvent.submit(input.closest('form')!);
 await waitFor(()=>expect(submit).toHaveBeenCalledWith({body:'원문 설명',imageAssetId:upload.items[0].assetId,originalAttested:true}));
 expect(upload.markUsed).not.toHaveBeenCalled();expect(input).toHaveValue('원문 설명');
});
it.each(APP_LOCALES)('%s review keeps original title/body and attendance semantics',async locale=>{
 const c=activityEvidenceCopy(locale),submit=vi.fn(async()=>false);
 render(<ActivityEvidenceTask locale={locale} kind='review' contentTitle='원문 행사' checkedIn busy={false} failed onSubmit={submit} onClose={vi.fn()}/>);
 expect(screen.getByText(c.confirmed)).toBeVisible();expect(screen.getByText(c.optionalPhoto)).toBeVisible();
 expect(screen.getByText(c.permission)).toBeVisible();
 fireEvent.change(screen.getByRole('textbox',{name:c.title}),{target:{value:'원문 제목'}});
 const body=screen.getByRole('textbox',{name:c.review});fireEvent.change(body,{target:{value:'원문 후기'}});
 fireEvent.submit(body.closest('form')!);
 await waitFor(()=>expect(submit).toHaveBeenCalledWith({title:'원문 제목',body:'원문 후기'}));
 expect(screen.getByRole('button',{name:c.submitReview})).toBeEnabled();
});
it('preserves the approved Korean source labels and consent distinction',()=>{
 expect(giftCopy('ko').title).toBe('선물 등록 신청');
 expect(groupInvitationCopy('ko').privacy).toBe('필수 개인정보 처리 내용을 확인했습니다.');
 expect(groupInvitationCopy('ko').queued).toBe('초대 요청을 접수했어요. 상대가 동의해야 팬으로 등록됩니다.');
 expect(activityEvidenceCopy('ko').titlePlaceholder).toBe('함께 달린 시간을 기록해 주세요.');
 expect(groupSurveyCopy('ko').error).toBe('제출하지 못했어요. 입력한 내용은 유지돼요.');
});
