"use client";
import groupStyles from "./group-admin.module.css";
import { useState } from "react";
import { z } from "zod";
import { UsersRound, BadgeCheck, Clock3, CircleX } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { ActionFeedback, useParticipationAction } from "@/features/schedules/ui/participation-ui";
import { ParticipationAdmin, useAdminPage, useParticipationCreators, CreatorSelect, AdminListState, styles } from "./participation-controls";
const application = z.object({ id: z.uuid(), kind: z.enum(["fan", "hobby", "brand"]), name: z.string(), description: z.string(), question: z.string().nullable(), status: z.enum(["submitted", "reviewing", "changes_requested", "approved", "rejected"]), reason: z.string().nullable(), created_at: z.string() });
const parse = (value: unknown) => z.object({ items: z.array(application), nextCursor: z.string().nullable() }).parse(value);
const reviewResult = z.object({ id: z.uuid(), status: z.string(), pageId: z.uuid().nullable() });
const copy = {
 ko: { title: "페이지 개설 신청", description: "신청 내용을 검토하고 승인한 페이지의 소유자를 지정합니다.", all: "전체", submitted: "검토 대기", reviewing: "검토 중", start_review: "검토 시작", changes_requested: "보완 요청", approved: "승인", rejected: "반려", fan: "팬페이지", hobby: "취미", brand: "브랜드", reason: "검토 의견", decision: "처리", approve: "승인", reject: "반려", request_changes: "보완 요청", save: "검토 결과 저장", question: "가입 질문" },
 en: { title: "Page applications", description: "Review applications and assign ownership when approving a page.", all: "All", submitted: "Pending", reviewing: "In review", start_review: "Start review", changes_requested: "Changes requested", approved: "Approved", rejected: "Rejected", fan: "Fan page", hobby: "Hobby", brand: "Brand", reason: "Review notes", decision: "Decision", approve: "Approve", reject: "Reject", request_changes: "Request changes", save: "Save review", question: "Join question" },
};
export function GroupApplicationManager({ locale }: { locale: "ko" | "en" }) {
 const c = copy[locale];
 return <ParticipationAdmin className={groupStyles.surface} locale={locale} title={c.title} description={c.description}>{role => <Manager locale={locale} role={role} />}</ParticipationAdmin>;
}
function Manager({ locale, role }: { locale: "ko" | "en"; role: string }) {
 const c = copy[locale], [filter, setFilter] = useState("submitted"), [selectedId,setSelectedId]=useState<string>(), list = useAdminPage("/api/groups/admin/applications", parse), creators = useParticipationCreators();
 const visible=list.state.data.filter(item=>filter==="all"||filter===item.status),selected=visible.find(item=>item.id===selectedId)??visible[0];
 return <><div className={styles.tabs}>{(["submitted", "reviewing", "changes_requested", "approved", "rejected", "all"] as const).map(status => <button key={status} aria-pressed={status === filter} onClick={() => setFilter(status)}>{c[status]}</button>)}</div>
 <div className={groupStyles.reviewWorkbench}><ul className={groupStyles.reviewList}>{visible.map(item=><li key={item.id}><button type="button" aria-pressed={selected?.id===item.id} onClick={()=>setSelectedId(item.id)}><strong>{item.name}</strong><span>{c[item.kind]} · {c[item.status]}</span><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString(locale,{timeZone:'Asia/Seoul'})}</time></button></li>)}</ul>{selected&&<ul className={styles.list}><Review key={`${selected.id}:${selected.status}`} item={selected} role={role} locale={locale} creators={creators.state.status === "ready" ? creators.state.data : []} refresh={list.retry}/></ul>}</div><AdminListState locale={locale} resource={list} />
 {list.state.status === "ready" && list.state.data.length > 0 && !list.state.data.some(item => filter === "all" || filter === item.status) && <p role="status" className={styles.adminEmpty}>{locale === "ko" ? "해당 상태의 신청이 없습니다." : "No applications with this status."}</p>}</>;
}
function Review({ item, role, locale, creators, refresh }: { item: z.infer<typeof application>; role: string; locale: "ko" | "en"; creators: Parameters<typeof CreatorSelect>[0]["creators"]; refresh: () => void }) {
 const c = copy[locale], action = useParticipationAction(), [decision, setDecision] = useState<"approve" | "reject" | "request_changes" | "start_review">("approve");
 const Icon = item.status === "approved" ? BadgeCheck : item.status === "rejected" ? CircleX : Clock3;
 return <li className={styles.row}><span className={styles.badge}><Icon size={16} aria-hidden="true" /> {c[item.status]}</span><h3><UsersRound size={20} aria-hidden="true" /> {item.name}</h3><span className={styles.meta}>{c[item.kind]} · <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString(locale === "ko" ? "ko-KR" : "en-US", { timeZone: "Asia/Seoul" })}</time></span><p>{item.description}</p>{item.question && <p>{c.question}: {item.question}</p>}{item.reason && <p>{c.reason}: {item.reason}</p>}
 {["submitted", "reviewing", "changes_requested"].includes(item.status) && <form className={styles.form} onSubmit={async event => {
  event.preventDefault(); const data = new FormData(event.currentTarget), input = { action: decision, reason: String(data.get("reason") ?? "").trim(), ...(decision === "approve" && item.kind === "fan" ? { celebrityId: data.get("celebrityId") } : {}) };
  const result = await action.run(`/api/groups/admin/applications/${item.id}`, "PATCH", { ...input, requestId: action.idempotencyKey({ id: item.id, ...input }) }, value => reviewResult.parse(value)); if (result) refresh();
 }}><fieldset disabled={action.busy || role === "viewer"}><label>{c.decision}<select value={decision} onChange={event => setDecision(event.target.value as typeof decision)}>{(["start_review", "approve", "request_changes", "reject"] as const).map(value => <option key={value} value={value}>{c[value]}</option>)}</select></label>{decision === "approve" && item.kind === "fan" && <CreatorSelect locale={locale} creators={creators} />}<label>{c.reason}<textarea name="reason" required={decision === "reject" || decision === "request_changes"} maxLength={1000} /></label><FanAction type="submit">{c.save}</FanAction></fieldset></form>}<ActionFeedback locale={locale} error={action.error} />
 </li>;
}
