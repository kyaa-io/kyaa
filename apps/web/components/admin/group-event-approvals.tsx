"use client";
import { useState } from "react";
import type { z } from "zod";
import { CalendarCheck } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { groupDetailSchema } from "@/features/groups/domain/contracts";
import { GroupImage } from "@/features/groups/ui/group-image";
import { useGroupResource } from "@/features/groups/ui/use-group-resource";
import { ActionFeedback, useParticipationAction } from "@/features/schedules/ui/participation-ui";
import { groupEventApprovalItemSchema, groupEventApprovalReceiptSchema, groupEventApprovalsSchema } from "@/server/group-activities/domain";
import { AdminListState, ParticipationAdmin, styles, useAdminPage } from "./participation-controls";
import groupStyles from "./group-admin.module.css";

type Item = z.infer<typeof groupEventApprovalItemSchema>;
type Locale = "ko" | "en";
const roleLabels: Record<Locale, Record<"owner" | "manager" | "member", string>> = { ko: { owner: "소유자", manager: "운영진", member: "회원" }, en: { owner: "Owner", manager: "Manager", member: "Member" } };
const parseApprovals = (value: unknown) => groupEventApprovalsSchema.parse(value);
const parsePage = (value: unknown) => groupDetailSchema.parse(value);
const blockedCopy: Record<Locale, string> = { ko: "내가 운영하는 페이지의 행사라 승인할 수 없어요", en: "You run this page, so you can’t decide this event" };

export function GroupEventApprovals({ locale }: { locale: Locale }) {
 const ko = locale === "ko";
 return <ParticipationAdmin className={groupStyles.surface} locale={locale} title={ko ? "행사 승인" : "Event approvals"} description="">{role => <Queue locale={locale} role={role}/>}</ParticipationAdmin>;
}
function Queue({ locale, role }: { locale: Locale; role: string }) {
 const list = useAdminPage("/api/groups/admin/event-approvals", parseApprovals);
 return <><ul className={styles.list}>{list.state.data.map(item => <Row key={item.id + ":" + item.revision} item={item} locale={locale} role={role} refresh={list.retry}/>)}</ul><AdminListState locale={locale} resource={list}/></>;
}
function Row({ item, locale, role, refresh }: { item: Item; locale: Locale; role: string; refresh: () => void }) {
 const action = useParticipationAction(), ko = locale === "ko", [reason, setReason] = useState(""), page = useGroupResource(`/api/groups/${item.pageId}`, parsePage, { nameLocale: false });
 // The server refuses the page's owner, staff and the event's author. Say so before the click; the author case is only known from the refusal.
 const blocked = page.data?.membership?.role === "owner" || page.data?.membership?.role === "manager" || Boolean(action.error?.includes("FORBIDDEN"));
 const when = (value: string) => new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
 const decide = async (decision: "approve" | "reject") => {
  const input = { action: decision, reason: decision === "reject" ? reason.trim() : "", expectedRevision: item.revision };
  const result = await action.run(`/api/groups/admin/pages/${item.pageId}/events/${item.id}/approval`, "PATCH", { ...input, requestId: action.idempotencyKey({ id: item.id, ...input }) }, value => groupEventApprovalReceiptSchema.parse(value));
  if (result) refresh();
 };
 const facts: [string, string][] = [[ko ? "모임" : "Group", item.pageName], [ko ? "신청자" : "Requested by", item.creatorName ?? roleLabels[locale][item.creatorRole ?? "member"]], [ko ? "일시" : "Date", `${when(item.startsAt)} – ${when(item.endsAt)}`], [ko ? "장소" : "Location", item.location], [ko ? "정원" : "Capacity", item.capacity === null ? (ko ? "제한 없음" : "No limit") : String(item.capacity)], [ko ? "참가 확정" : "Confirmation", item.requiresApproval ? (ko ? "운영자 확인 후" : "After staff review") : (ko ? "신청 즉시" : "On application")]];
 if (item.linkedMissionTitle) facts.push([ko ? "연결 미션" : "Linked mission", item.linkedMissionTitle]);
 const locked = role === "viewer" || action.busy || blocked;
 return <li className={styles.row}><h3><CalendarCheck aria-hidden="true" size={20} style={{ flexShrink: 0 }}/> {item.title}</h3>{item.imageUrl && <GroupImage locale={locale} src={item.imageUrl} alt="" style={{ display: "block", width: "100%", maxWidth: 320, height: "auto", margin: "12px 0", borderRadius: 12 }}/>}<dl className={groupStyles.applicationFacts}>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{item.description && <p style={{ whiteSpace: "pre-wrap" }}>{item.description}</p>}<form className={styles.form} onSubmit={event => event.preventDefault()}><label>{ko ? "반려 사유" : "Rejection reason"}<textarea value={reason} maxLength={1000} disabled={locked} onChange={event => setReason(event.target.value)}/></label><div className={styles.columns} style={{ gridTemplateColumns: "1fr 1fr" }}><FanAction disabled={locked} onClick={() => void decide("approve")} variant="primary">{ko ? "승인" : "Approve"}</FanAction><FanAction disabled={locked || !reason.trim()} onClick={() => void decide("reject")}>{ko ? "반려" : "Reject"}</FanAction></div></form>{blocked ? <p role="status" data-event-approval-blocked>{blockedCopy[locale]}</p> : <ActionFeedback locale={locale} error={action.error}/>}</li>;
}
