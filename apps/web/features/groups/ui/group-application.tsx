"use client";
import { useEffect, useLayoutEffect, useId, useRef, useState, type FormEvent } from "react";
import type { AppLocale } from "@/i18n/locales";
import { FanAction, fanActionClassName } from "@/components/fan-ui/fan-action";
import { applicationReceiptSchema } from "../domain/contracts";
import { useGroupRequest } from "./use-group-resource";
import { groupsCopy,pageTypeLabel } from "./copy";
import { GroupShell } from "./group-shell";
import { GroupImageField,imageAssetInput } from "./group-image-field";
import { GroupApplicationHistory } from "./group-application-history";
import { GroupApplicationAside } from "./group-application-aside";
import {qualificationCopy} from "./qualification-copy";
import { applicationCopy } from "./application-copy";
import styles from "./groups.module.css";
import {SourceStatePanel} from "./source-state-panel";
import {paginationCopy} from "@/i18n/catalogs/common__pagination";
import {TaskActions,TaskPanel} from "./task-panel";
import {sourceDiscardConfirmation} from "./source-confirm-dialog";
import {GroupQualificationForm} from "./group-qualification";
import dialogStyles from "./group-application-dialog.module.css";
const optionalSettings:Record<AppLocale,string>={ko:'추가 설정 (선택)',en:'Additional settings (optional)',ja:'追加設定（任意）','zh-Hans':'其他设置（可选）','zh-Hant':'其他設定（選填）',es:'Opciones adicionales (opcional)',id:'Pengaturan tambahan (opsional)',vi:'Cài đặt bổ sung (không bắt buộc)',th:'การตั้งค่าเพิ่มเติม (ไม่บังคับ)',pt:'Configurações adicionais (opcional)',fr:'Options supplémentaires (facultatif)',ru:'Дополнительные настройки (необязательно)'};
export function GroupApplication({locale,initialKind="hobby",modal}:{locale:AppLocale;initialKind?:"fan"|"hobby"|"brand";modal?:{onClose:()=>void}}) {
  const t=groupsCopy(locale),c=applicationCopy(locale),auth=useGroupRequest(),requestId=useRef<string|null>(null),formRef=useRef<HTMLFormElement>(null);
  const kinds:readonly ("fan"|"hobby"|"brand")[]=initialKind==="fan"?["fan"]:["hobby","brand"];
  const formId=useId(),inFlight=useRef(false);
  const [dirty,setDirty]=useState(false),[discard,setDiscard]=useState(false),[qualification,setQualification]=useState(false),[qualificationVisited,setQualificationVisited]=useState(false);
  const [qualificationState,setQualificationState]=useState({dirty:false,pending:false,failedUploads:false});
  const [kind,setKind]=useState(initialKind);
  const qualificationFormId=`${formId}-qualification`;
  const [qualifiedBase,setQualifiedBase]=useState<{kind:"fan"|"hobby"|"brand";name:string;description:string;question?:string;imageAssetId?:string|null}>();
  const [imageReady,setImageReady]=useState(true);
  const [pending,setPending]=useState(false),[error,setError]=useState(false),[received,setReceived]=useState<string|null>(null);
  const isModal=Boolean(modal);
  const complete=received===auth.ownerKey,busy=pending||qualificationState.pending;
  const close=()=>{if(busy)return;if(!complete&&(dirty||qualificationState.dirty))setDiscard(true);else modal?.onClose();};
  const closeRef=useRef(close);useLayoutEffect(()=>{closeRef.current=close;});
  useEffect(()=>{if(!isModal||complete||!(dirty||qualificationState.dirty))return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[isModal,complete,dirty,qualificationState.dirty]);
  useEffect(()=>{
    if(!isModal)return;
    const token=crypto.randomUUID(),url=location.href,marker={...history.state,groupApplicationModal:token};
    history.pushState(marker,'',url);
    const back=()=>{if(history.state?.groupApplicationModal===token)return;history.pushState(marker,'',url);closeRef.current();};
    window.addEventListener('popstate',back);
    return()=>{window.removeEventListener('popstate',back);if(history.state?.groupApplicationModal===token)history.back();};
  },[isModal]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(inFlight.current||pending||!imageReady||complete)return;inFlight.current=true;const form=new FormData(event.currentTarget);setPending(true);setError(false);
    requestId.current??=crypto.randomUUID();
    try { applicationReceiptSchema.parse(await auth.request('/api/groups/applications',{method:'POST',body:JSON.stringify({imageAssetId:imageAssetInput(form),kind:form.get('kind'),name:form.get('name'),description:form.get('description'),question:form.get('question')||undefined,requestId:requestId.current})}));setReceived(auth.ownerKey); }
    catch { setError(true); } finally { inFlight.current=false;setPending(false); }
  }
  const application=<section className={`${styles.applicationPanel} ${modal?dialogStyles.panel:""}`}><header>{!modal&&<h1>{received===auth.ownerKey?t.received:t.apply}</h1>}{received!==auth.ownerKey&&!modal&&<FanAction href={`/pages/groups/apply?qualification=1&locale=${locale}&kind=${initialKind}`}>{qualificationCopy(locale)[2]}</FanAction>}</header>{received===auth.ownerKey?<SourceStatePanel sourceId='D9f8Z' title={locale==='ko'?'모임 개설 신청을 보냈어요':t.received} description={t.receivedNote} role='status' actions={[{label:t.explore,...(modal?{onClick:modal.onClose}:{href:`/pages/groups?locale=${locale}`}),variant:'primary'}]}/>:!auth.authenticated?<div className={styles.status}><FanAction href={`/login?returnTo=${encodeURIComponent(`/pages/groups/apply?locale=${locale}&kind=${initialKind}`)}`}>{t.login}</FanAction></div>:<form id={formId} onChange={()=>setDirty(true)} ref={formRef} key={auth.ownerKey} className={styles.form} onSubmit={submit}>
    {modal&&initialKind==='fan'?<input type='hidden' name='kind' value='fan'/>:<div className={styles.applicationTypes} role='group' aria-label={pageTypeLabel[locale]}><strong>{pageTypeLabel[locale]}</strong>{kinds.map(k=><label key={k} className={styles.chip}><input type='radio' className={styles.fileInput} name='kind' value={k} checked={kind===k} onChange={()=>setKind(k)} disabled={pending}/>{t[k]}</label>)}</div>}
    {modal?<label className={styles.field}>{t.name}<input className={styles.input} name="name" required maxLength={100} disabled={pending}/></label>:<div className={styles.applicationIdentity}><div className={styles.applicationPhoto}><GroupImageField locale={locale} disabled={pending} onReadyChange={setImageReady}/></div><div className={styles.field}><label className={styles.field}>{t.name}<input className={styles.input} name="name" required maxLength={100} disabled={pending} aria-describedby="application-photo-note"/></label><span id="application-photo-note" className={styles.meta}>{c.photo}</span></div></div>}
    <label className={styles.field}>{t.description}<textarea className={styles.textarea} name="description" required maxLength={1000} disabled={pending}/></label>
    {modal?<details className={dialogStyles.optional}><summary>{optionalSettings[locale]}</summary><div className={dialogStyles.optionalBody}><GroupImageField locale={locale} disabled={pending} onReadyChange={setImageReady}/><span className={styles.meta}>{c.photo}</span><label className={styles.field}>{t.question}<input className={styles.input} name="question" maxLength={300} disabled={pending}/></label><FanAction href={`/pages/groups/apply?qualification=1&locale=${locale}&kind=${kind}`} onClick={event=>{if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();const form=formRef.current;if(!form||!imageReady||!form.reportValidity())return;const data=new FormData(form);setQualifiedBase({kind,name:String(data.get('name')??''),description:String(data.get('description')??''),question:String(data.get('question')??'')||undefined,imageAssetId:imageAssetInput(data)});setQualificationVisited(true);setQualification(true);}}>{qualificationCopy(locale)[2]}</FanAction></div></details>:<label className={styles.field}>{t.question}<input className={styles.input} name="question" maxLength={300} disabled={pending}/></label>}
    {error&&<SourceStatePanel sourceId='HtWDL' title={locale==='ko'?'모임 개설 신청을 보내지 못했어요':t.error} description={t.error} role='alert' actions={[{label:t.retry,onClick:()=>formRef.current?.requestSubmit(),disabled:pending||!imageReady,variant:'primary'}]}/>}{!modal&&<footer className={styles.applicationFooter}><p>{t.receivedNote}</p><div className={styles.actions}><FanAction href={`/pages/groups?locale=${locale}`}>{t.cancel}</FanAction><FanAction type="submit" variant="primary" disabled={pending||!imageReady}>{pending?t.loading:t.apply}</FanAction></div></footer>}
  </form>}</section>;
  if(modal)return <TaskPanel title={complete?t.received:qualification?qualificationCopy(locale)[2]:initialKind==="fan"&&locale==="ko"?"팬페이지 개설 신청":t.apply} width={800} mode="fullscreen" className={dialogStyles.dialog} closeLabel={t.cancel} onClose={close} confirmation={discard?sourceDiscardConfirmation({locale,pending:busy,onContinue:()=>setDiscard(false),onDiscard:modal.onClose}):undefined} actions={!complete?<TaskActions><FanAction disabled={busy} onClick={qualification?()=>setQualification(false):close}>{qualification?paginationCopy(locale).previous:t.cancel}</FanAction>{auth.authenticated&&<button type="submit" form={qualification?qualificationFormId:formId} className={fanActionClassName('primary')} disabled={busy||(qualification&&qualificationState.failedUploads)||(!qualification&&!imageReady)}>{busy?t.loading:t.apply}</button>}</TaskActions>:undefined}>
    <div className={dialogStyles.body}><div hidden={qualification||complete}>{application}</div>{complete&&<div role="status"><p>{t.receivedNote}</p><FanAction onClick={modal.onClose} variant="neutral">{t.explore}</FanAction></div>}<div hidden={!qualification||complete}>{qualificationVisited&&<GroupQualificationForm key={auth.ownerKey} locale={locale} initialKind={kind} allowedKinds={[kind]} baseApplication={qualifiedBase} externalFormId={qualificationFormId} onStateChange={setQualificationState} onSaved={()=>{setDirty(false);setReceived(auth.ownerKey);}}/>}</div></div>
  </TaskPanel>;
  return <GroupShell locale={locale}><div className={styles.applicationBreadcrumb}><strong>{t.groups}</strong></div><div className={styles.applicationLayout}><div>{application}<GroupApplicationHistory key={received??auth.ownerKey} locale={locale}/></div><GroupApplicationAside locale={locale} authenticated={auth.authenticated}/></div></GroupShell>;
}
