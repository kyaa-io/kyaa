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
import { applicationCopy } from "./application-copy";
import styles from "./groups.module.css";
import {SourceStatePanel} from "./source-state-panel";
import {TaskActions,TaskPanel} from "./task-panel";
import {sourceDiscardConfirmation} from "./source-confirm-dialog";
import {CelebrityNameField} from "./celebrity-name-field";
import {useOperatingExperience} from "./operating-experience-fields";
import {groupApplyText} from "./group-apply-copy";
import dialogStyles from "./group-application-dialog.module.css";
const optionalSettings:Record<AppLocale,string>={ko:'추가 설정 (선택)',en:'Additional settings (optional)',ja:'追加設定（任意）','zh-Hans':'其他设置（可选）','zh-Hant':'其他設定（選填）',es:'Opciones adicionales (opcional)',id:'Pengaturan tambahan (opsional)',vi:'Cài đặt bổ sung (không bắt buộc)',th:'การตั้งค่าเพิ่มเติม (ไม่บังคับ)',pt:'Configurações adicionais (opcional)',fr:'Options supplémentaires (facultatif)',ru:'Дополнительные настройки (необязательно)'};
export function GroupApplication({locale,initialKind="hobby",initialName="",modal}:{locale:AppLocale;initialKind?:"fan"|"hobby"|"brand";initialName?:string;modal?:{onClose:()=>void}}) {
  const t=groupsCopy(locale),c=applicationCopy(locale),auth=useGroupRequest(),operation=useRef<{body:string;id:string}|null>(null),formRef=useRef<HTMLFormElement>(null);
  const kinds:readonly ("fan"|"hobby"|"brand")[]=initialKind==="fan"?["fan"]:["hobby","brand"];
  const formId=useId(),inFlight=useRef(false);
  const [dirty,setDirty]=useState(false),[discard,setDiscard]=useState(false);
  const [kind,setKind]=useState(initialKind);
  const [imageReady,setImageReady]=useState(true);
  const [pending,setPending]=useState(false),[error,setError]=useState(false),[received,setReceived]=useState<string|null>(null);
  const experience=useOperatingExperience({locale,disabled:pending});
  const isModal=Boolean(modal);
  const complete=received===auth.ownerKey,busy=pending||experience.busy;
  const close=()=>{if(busy)return;if(!complete&&dirty)setDiscard(true);else modal?.onClose();};
  const closeRef=useRef(close);useLayoutEffect(()=>{closeRef.current=close;});
  useEffect(()=>{if(!isModal||complete||!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[isModal,complete,dirty]);
  // React may unmount and remount an effect at once, so the history step is only undone if no remount follows.
  const modalHistory=useRef<{token:string;undo?:number}|null>(null);
  useEffect(()=>{
    if(!isModal)return;
    const held=modalHistory.current;
    if(held?.undo!==undefined){window.clearTimeout(held.undo);held.undo=undefined;}
    const url=location.href;
    const entry=held??{token:crypto.randomUUID()},marker={...history.state,groupApplicationModal:entry.token};
    if(!held){history.pushState(marker,'',url);modalHistory.current=entry;}
    const back=()=>{if(history.state?.groupApplicationModal===entry.token)return;history.pushState(marker,'',url);closeRef.current();};
    window.addEventListener('popstate',back);
    return()=>{window.removeEventListener('popstate',back);entry.undo=window.setTimeout(()=>{modalHistory.current=null;if(history.state?.groupApplicationModal===entry.token)history.back();},0);};
  },[isModal]);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(inFlight.current||pending||!imageReady||complete||experience.blocked)return;
    const qualification=experience.read();if(!qualification)return;
    inFlight.current=true;const form=new FormData(event.currentTarget);setPending(true);setError(false);
    const payload={imageAssetId:imageAssetInput(form),kind:form.get('kind'),name:form.get('name'),description:form.get('description'),question:form.get('question')||undefined,qualification};
    const body=JSON.stringify(payload);if(operation.current?.body!==body)operation.current={body,id:crypto.randomUUID()};
    try { applicationReceiptSchema.parse(await auth.request('/api/groups/applications',{method:'POST',body:JSON.stringify({...payload,requestId:operation.current.id})}));experience.markUsed();setDirty(false);setReceived(auth.ownerKey); }
    catch { setError(true); } finally { inFlight.current=false;setPending(false); }
  }
  const nameLabel=t.name;
  const nameField=kind==='fan'?<CelebrityNameField locale={locale} label={nameLabel} initialValue={initialName} disabled={pending}/>:<label className={styles.field}>{nameLabel}<input className={styles.input} name="name" required maxLength={100} disabled={pending} defaultValue={initialName}/></label>;
  const kindNote=kind==='hobby'?groupApplyText(locale,'hobbyDescription'):kind==='brand'?groupApplyText(locale,'brandDescription'):null;
  const receipt=<SourceStatePanel sourceId='D9f8Z' title={groupApplyText(locale,initialKind==='fan'?'receivedFanTitle':'receivedPageTitle')} description={groupApplyText(locale,'receivedNote')} role='status' actions={[{label:groupApplyText(locale,'viewMine'),href:`/pages/groups/apply?view=mine&locale=${locale}`,variant:'primary'},{label:t.explore,...(modal?{onClick:modal.onClose}:{href:`/pages/groups?locale=${locale}`}),variant:'neutral'}]}/>;
  const application=<section className={`${styles.applicationPanel} ${modal?dialogStyles.panel:""}`}><header>{!modal&&<h1>{complete?t.received:t.apply}</h1>}</header>{complete?receipt:!auth.authenticated?<div className={styles.status}><FanAction href={`/login?returnTo=${encodeURIComponent(`/pages/groups/apply?locale=${locale}&kind=${initialKind}`)}`}>{t.login}</FanAction></div>:<form id={formId} onChange={()=>setDirty(true)} ref={formRef} key={auth.ownerKey} className={styles.form} onSubmit={submit}>
    {modal&&initialKind==='fan'?<input type='hidden' name='kind' value='fan'/>:<div className={dialogStyles.kind}><div className={styles.applicationTypes} role='group' aria-label={pageTypeLabel[locale]}><strong>{pageTypeLabel[locale]}</strong>{kinds.map(k=><label key={k} className={styles.chip}><input type='radio' className={styles.fileInput} name='kind' value={k} checked={kind===k} onChange={()=>setKind(k)} disabled={pending}/>{t[k]}</label>)}</div>{kindNote&&<p className={dialogStyles.kindNote}>{kindNote}</p>}</div>}
    {modal?nameField:<div className={styles.applicationIdentity}><div className={styles.applicationPhoto}><GroupImageField locale={locale} disabled={pending} onReadyChange={setImageReady}/></div><div className={styles.field}>{nameField}<span className={styles.meta}>{c.photo}</span></div></div>}
    <label className={styles.field}>{t.description}<textarea className={styles.textarea} name="description" required maxLength={1000} disabled={pending}/></label>
    {experience.node}
    {modal?<details className={dialogStyles.optional}><summary>{optionalSettings[locale]}</summary><div className={dialogStyles.optionalBody}><GroupImageField locale={locale} disabled={pending} onReadyChange={setImageReady}/><span className={styles.meta}>{c.photo}</span><label className={styles.field}>{t.question}<input className={styles.input} name="question" maxLength={300} disabled={pending}/></label></div></details>:<label className={styles.field}>{t.question}<input className={styles.input} name="question" maxLength={300} disabled={pending}/></label>}
    {error&&<SourceStatePanel sourceId='HtWDL' title={locale==='ko'?'모임 개설 신청을 보내지 못했어요':t.error} description={t.error} role='alert' actions={[{label:t.retry,onClick:()=>formRef.current?.requestSubmit(),disabled:pending||!imageReady,variant:'primary'}]}/>}{!modal&&<footer className={styles.applicationFooter}><p>{groupApplyText(locale,'receivedNote')}</p><div className={styles.actions}><FanAction href={`/pages/groups?locale=${locale}`}>{t.cancel}</FanAction><FanAction type="submit" variant="primary" disabled={pending||!imageReady||experience.blocked}>{pending?t.loading:t.apply}</FanAction></div></footer>}
  </form>}</section>;
  if(modal)return <TaskPanel title={complete?t.received:initialKind==="fan"?groupApplyText(locale,'fanPageApply'):t.apply} width={800} mode="fullscreen" className={dialogStyles.dialog} closeLabel={t.cancel} onClose={close} confirmation={discard?sourceDiscardConfirmation({locale,pending:busy,onContinue:()=>setDiscard(false),onDiscard:modal.onClose}):undefined} actions={!complete?<TaskActions><FanAction disabled={busy} onClick={close}>{t.cancel}</FanAction>{auth.authenticated&&<button type="submit" form={formId} className={fanActionClassName('primary')} disabled={busy||!imageReady||experience.blocked}>{busy?t.loading:initialKind==="fan"?groupApplyText(locale,'fanPageApply'):t.apply}</button>}</TaskActions>:undefined}>
    <div className={dialogStyles.body}>{application}</div>
  </TaskPanel>;
  return <GroupShell locale={locale}><div className={styles.applicationBreadcrumb}><strong>{t.groups}</strong></div><div className={styles.applicationLayout}><div>{application}<GroupApplicationHistory key={received??auth.ownerKey} locale={locale}/></div><GroupApplicationAside locale={locale} authenticated={auth.authenticated}/></div></GroupShell>;
}
