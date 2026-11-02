"use client";
import { useRef, useState, type FormEvent } from "react";
import type { AppLocale } from "@/i18n/locales";
import { FanAction } from "@/components/fan-ui/fan-action";
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
export function GroupApplication({locale,initialKind="hobby"}:{locale:AppLocale;initialKind?:"fan"|"hobby"|"brand"}) {
  const t=groupsCopy(locale),c=applicationCopy(locale),auth=useGroupRequest(),requestId=useRef<string|null>(null),formRef=useRef<HTMLFormElement>(null);
  const kinds:readonly ("fan"|"hobby"|"brand")[]=initialKind==="fan"?["fan"]:["hobby","brand"];
  const [imageReady,setImageReady]=useState(true);
  const [pending,setPending]=useState(false),[error,setError]=useState(false),[received,setReceived]=useState<string|null>(null);
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(pending||!imageReady)return;const form=new FormData(event.currentTarget);setPending(true);setError(false);
    requestId.current??=crypto.randomUUID();
    try { applicationReceiptSchema.parse(await auth.request('/api/groups/applications',{method:'POST',body:JSON.stringify({imageAssetId:imageAssetInput(form),kind:form.get('kind'),name:form.get('name'),description:form.get('description'),question:form.get('question')||undefined,requestId:requestId.current})}));setReceived(auth.ownerKey); }
    catch { setError(true); } finally { setPending(false); }
  }
  return <GroupShell locale={locale}><div className={styles.applicationBreadcrumb}><strong>{t.groups}</strong><span> / {t.apply}</span></div><div className={styles.applicationLayout}><div><section className={styles.applicationPanel}><header><h1>{received===auth.ownerKey?t.received:t.apply}</h1><p>{received===auth.ownerKey?t.receivedNote:c.intro}</p>{received!==auth.ownerKey&&<FanAction href={`/pages/groups/apply?qualification=1&locale=${locale}`}>{qualificationCopy(locale)[2]}</FanAction>}</header>{received===auth.ownerKey?<SourceStatePanel sourceId='D9f8Z' title={locale==='ko'?'모임 개설 신청을 보냈어요':t.received} description={t.receivedNote} role='status' actions={[{label:t.explore,href:`/pages/groups?locale=${locale}`,variant:'primary'}]}/>:!auth.authenticated?<div className={styles.status}><FanAction href={`/login?returnTo=${encodeURIComponent(`/pages/groups/apply?locale=${locale}`)}`}>{t.login}</FanAction></div>:<form ref={formRef} key={auth.ownerKey} className={styles.form} onSubmit={submit}>
    <div className={styles.applicationTypes} role='group' aria-label={pageTypeLabel[locale]}><strong>{pageTypeLabel[locale]}</strong>{kinds.map(k=><label key={k} className={styles.chip}><input type='radio' className={styles.fileInput} name='kind' value={k} defaultChecked={k===initialKind} disabled={pending}/>{t[k]}</label>)}</div>
    <div className={styles.applicationIdentity}><div className={styles.applicationPhoto}><GroupImageField locale={locale} disabled={pending} onReadyChange={setImageReady}/></div><div className={styles.field}><label className={styles.field}>{t.name}<input className={styles.input} name="name" required maxLength={100} disabled={pending} aria-describedby="application-photo-note"/></label><span id="application-photo-note" className={styles.meta}>{c.photo}</span></div></div>
    <label className={styles.field}>{t.description}<textarea className={styles.textarea} name="description" required maxLength={1000} disabled={pending}/></label>
    <label className={styles.field}>{t.question}<input className={styles.input} name="question" maxLength={300} disabled={pending}/></label>
    {error&&<SourceStatePanel sourceId='HtWDL' title={locale==='ko'?'모임 개설 신청을 보내지 못했어요':t.error} description={t.error} role='alert' actions={[{label:t.retry,onClick:()=>formRef.current?.requestSubmit(),disabled:pending||!imageReady,variant:'primary'}]}/>}<footer className={styles.applicationFooter}><p>{t.receivedNote}</p><div className={styles.actions}><FanAction href={`/pages/groups?locale=${locale}`}>{t.cancel}</FanAction><FanAction type="submit" variant="primary" disabled={pending||!imageReady}>{pending?t.loading:t.apply}</FanAction></div></footer>
  </form>}</section><GroupApplicationHistory key={received??auth.ownerKey} locale={locale}/></div><GroupApplicationAside locale={locale} authenticated={auth.authenticated}/></div></GroupShell>;
}
