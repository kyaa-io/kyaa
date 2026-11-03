"use client";
import {qualificationSchema} from "@/features/groups/domain/qualification";
import {GroupImage} from "@/features/groups/ui/group-image";
import {qualificationCopy} from "@/features/groups/ui/qualification-copy";
import groupStyles from "./group-admin.module.css";
import { useState, type MouseEvent } from "react";
import { z } from "zod";
import { BadgeCheck, Inbox, ChevronRight, Check } from "lucide-react";
import { FanAction, fanActionClassName } from "@/components/fan-ui/fan-action";
import { ActionFeedback, useParticipationAction } from "@/features/schedules/ui/participation-ui";
import { ParticipationAdmin, useAdminPage, useParticipationCreators, CreatorSelect, AdminListState, styles } from "./participation-controls";
const application = z.object({ qualification:qualificationSchema.nullable().optional(),submissionRevision:z.number().int().min(1).default(1), id: z.uuid(), kind: z.enum(["fan", "hobby", "brand"]), name: z.string(), description: z.string(), question: z.string().nullable(), status: z.enum(["submitted", "reviewing", "changes_requested", "approved", "rejected"]), reason: z.string().nullable(), created_at: z.string() });
const parse = (value: unknown) => z.object({ items: z.array(application), nextCursor: z.string().nullable() }).parse(value);
const reviewResult = z.object({ id: z.uuid(), status: z.string(), pageId: z.uuid().nullable() });
const copy = {
 ko: { title: "페이지 개설 신청", description: "신청 내용을 검토하고 승인한 페이지의 소유자를 지정합니다.", all: "전체", submitted: "검토 대기", reviewing: "검토 중", start_review: "검토 시작", changes_requested: "보완 요청", approved: "승인", rejected: "반려", fan: "팬페이지", hobby: "취미", brand: "브랜드", reason: "검토 의견", decision: "처리", approve: "승인", reject: "반려", request_changes: "보완 요청", save: "검토 결과 저장", question: "가입 질문" },
 en: { title: "Page applications", description: "Review applications and assign ownership when approving a page.", all: "All", submitted: "Pending", reviewing: "In review", start_review: "Start review", changes_requested: "Changes requested", approved: "Approved", rejected: "Rejected", fan: "Fan page", hobby: "Hobby", brand: "Brand", reason: "Review notes", decision: "Decision", approve: "Approve", reject: "Reject", request_changes: "Request changes", save: "Save review", question: "Join question" },
};
export type GroupApplicationPresentation=Record<string,{creatorName?:string;materialsLabel?:string;materialsHref?:string;relationship?:string}>;
export function GroupApplicationManager({ locale,presentation }: { locale: "ko" | "en";presentation?:GroupApplicationPresentation }) {
 const c = copy[locale];
 return <ParticipationAdmin groupLayout className={groupStyles.applicationSurface} locale={locale} title={c.title} description={c.description}>{role => <Manager locale={locale} role={role} presentation={presentation} />}</ParticipationAdmin>;
}
function Manager({ locale, role,presentation }: { locale: "ko" | "en"; role: string;presentation?:GroupApplicationPresentation }) {
 const c = copy[locale], [filter, setFilter] = useState("pending"), [selectedId,setSelectedId]=useState<string>(), list = useAdminPage("/api/groups/admin/applications", parse), creators = useParticipationCreators();
 const visible=list.state.data.filter(item=>(filter==="completed") === ["approved","rejected"].includes(item.status)),selected=visible.find(item=>item.id===selectedId)??visible[0];
 return <><div className={groupStyles.applicationWorkbench}><section aria-label={c.title}><h1 className={groupStyles.applicationTitle}><span><Inbox size={24} aria-hidden="true"/></span>{locale==="ko"?"개설 신청":c.title}</h1><div className={groupStyles.applicationTabs}>{(["pending", "completed"] as const).map(status => <button type="button" key={status} aria-pressed={status===filter} onClick={()=>setFilter(status)}>{status==="pending"?(locale==="ko"?"대기":"Pending"):(locale==="ko"?"처리 완료":"Completed")}</button>)}</div>
 <ul className={groupStyles.applicationList}>{visible.map(item=><li key={item.id}><button type="button" aria-pressed={selected?.id===item.id} onClick={()=>setSelectedId(item.id)}><BadgeCheck size={24} aria-hidden="true"/><span><strong>{item.name}</strong><small>{c[item.kind]} · {c[item.status]}</small></span><ChevronRight size={18} aria-hidden="true"/></button></li>)}</ul><AdminListState locale={locale} resource={list}/></section>{selected&&<ul className={groupStyles.applicationDetail}><Review key={`${selected.id}:${selected.status}`} item={selected} role={role} locale={locale} creators={creators.state.status === "ready" ? creators.state.data : []} refresh={list.retry} presentation={presentation?.[selected.id]}/></ul>}</div>
 {list.state.status === "ready" && list.state.data.length > 0 && !visible.length && <p role="status" className={styles.adminEmpty}>{locale === "ko" ? "해당 상태의 신청이 없습니다." : "No applications with this status."}</p>}</>;
}
function Review({ item, role, locale, creators, refresh,presentation }: { item: z.infer<typeof application>; role: string; locale: "ko" | "en"; creators: Parameters<typeof CreatorSelect>[0]["creators"]; refresh: () => void;presentation?:GroupApplicationPresentation[string] }) {
 const c = copy[locale], action = useParticipationAction(), ko=locale==="ko";
 const clearValidation=(event:MouseEvent<HTMLButtonElement>)=>event.currentTarget.form?.querySelectorAll<HTMLTextAreaElement|HTMLSelectElement>("textarea,select").forEach(field=>field.setCustomValidity(""));
 return <li><h2 className={groupStyles.applicationDetailTitle}><BadgeCheck size={24} aria-hidden="true"/>{item.name} {ko?"개설 신청":"application"}</h2><dl className={groupStyles.applicationFacts}>
 <div><dt>{ko?"신청 상태":"Application status"}</dt><dd>{c[item.status]}</dd></div>
 {presentation?.creatorName&&<div><dt>{ko?'연결할 크리에이터':'Linked creator'}</dt><dd>{presentation.creatorName}</dd></div>}{presentation?.materialsLabel&&<div><dt>{ko?'신청 자료':'Submitted materials'}</dt><dd>{presentation.materialsLabel}</dd></div>}{presentation?.relationship&&<div><dt>{ko?'검토 항목':'Review item'}</dt><dd>{presentation.relationship}</dd></div>}
 <div><dt>{ko?"페이지 유형":"Page type"}</dt><dd>{c[item.kind]}</dd></div>
 <div><dt>{ko?"신청 내용":"Application details"}</dt><dd>{item.description}</dd></div>
 {item.qualification&&<><div><dt>{qualificationCopy(locale)[5]}</dt><dd>{item.qualification.communityName}</dd></div><div><dt>{qualificationCopy(locale)[7]}</dt><dd><a href={item.qualification.evidenceUrl} target='_blank' rel='noopener noreferrer'>{item.qualification.evidenceUrl}</a></dd></div><div><dt>{qualificationCopy(locale)[8]}</dt><dd>{item.qualification.introduction}</dd></div><div><dt>{qualificationCopy(locale)[9]}</dt><dd>{item.qualification.assetIds.map(id=><GroupImage key={id} locale={locale} src={`/api/groups/images/${id}`} width={180} height={135} style={{objectFit:'contain',maxWidth:'100%'}} alt=''/>)}</dd></div></>}

 <div><dt>{ko?"신청일":"Submitted"}</dt><dd><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString(locale, { timeZone: "Asia/Seoul" })}</time></dd></div>
 {item.question&&<div><dt>{c.question}</dt><dd>{item.question}</dd></div>}{item.reason&&<div><dt>{c.reason}</dt><dd>{item.reason}</dd></div>}</dl>{presentation?.materialsHref&&<FanAction href={presentation.materialsHref} external>{ko?'제출 자료 보기':'View submitted materials'}</FanAction>}
 {["submitted", "reviewing", "changes_requested"].includes(item.status) && <form className={styles.form} onInput={event=>{const target=event.target;if(target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement)target.setCustomValidity("");}} onSubmit={async event => {
  event.preventDefault();if(role==="viewer"||action.busy)return;
  const form=event.currentTarget,submitter=(event.nativeEvent as SubmitEvent).submitter;
  const decision=submitter instanceof HTMLButtonElement?submitter.value:"";
  if(!["approve","reject","request_changes","start_review"].includes(decision))return;
  const data=new FormData(form),reason=String(data.get("reason")??"").trim(),reasonField=form.elements.namedItem("reason") as HTMLTextAreaElement;
  if((decision==="reject"||decision==="request_changes")&&!reason){reasonField.setCustomValidity(ko?"처리 근거를 입력해 주세요.":"Enter the reason for this decision.");reasonField.reportValidity();return;}
  const celebrityId=data.get("celebrityId");
  if(decision==="approve"&&item.kind==="fan"&&!celebrityId){const field=form.elements.namedItem("celebrityId") as HTMLSelectElement;field.setCustomValidity(ko?"연결할 팬페이지를 선택해 주세요.":"Select the fan page to link.");field.reportValidity();return;}
  const input={action:decision,reason,expectedRevision:item.submissionRevision,...(decision==="approve"&&item.kind==="fan"?{celebrityId}:{})};
  const result = await action.run(`/api/groups/admin/applications/${item.id}`, "PATCH", { ...input, requestId: action.idempotencyKey({ id: item.id, ...input }) }, value => reviewResult.parse(value)); if (result) refresh();
 }}><fieldset disabled={action.busy || role === "viewer"}>{item.kind === "fan" && <CreatorSelect locale={locale} creators={creators} required={false}/>}<label>{c.reason}<textarea name="reason" placeholder={ko?"처리 근거를 입력해 주세요.":"Enter the reason for this decision."} maxLength={1000}/></label><div className={groupStyles.applicationActions}><button type="submit" onClick={clearValidation} name="action" value="reject" className={fanActionClassName("neutral")}>{ko?"반려하기":c.reject}</button><button type="submit" onClick={clearValidation} name="action" value="approve" className={fanActionClassName("primary")}><span>{ko?"승인하기":c.approve}</span><Check size={20} aria-hidden="true"/></button></div><details className={groupStyles.additionalActions}><summary>{ko?"추가 처리":"Additional actions"}</summary><div>{(["start_review","request_changes"] as const).map(value=><button key={value} type="submit" onClick={clearValidation} name="action" value={value} className={fanActionClassName("neutral")}>{c[value]}</button>)}</div></details></fieldset></form>}<p className={groupStyles.auditNote}>{ko?'처리자·시각·사유는 관리 기록에 남습니다.':'The reviewer, time and reason are recorded in the audit log.'}</p><ActionFeedback locale={locale} error={action.error}/>
 </li>;
}
