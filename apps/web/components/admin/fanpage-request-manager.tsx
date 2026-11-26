"use client";
import { useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { pageSchema, fanpageRequestSchema, mutationSchema, type FanpageRequest } from "@/features/schedules/domain/participation";
import { useParticipationAction, ActionFeedback, ParticipationState } from "@/features/schedules/ui/participation-ui";
import { participationCopy } from "@/i18n/catalogs/features__schedules__ui__participation";
import { ParticipationAdmin, useAdminPage, CreatorSelect, useParticipationCreators, AdminListState, styles, type CreatorRefs } from "./participation-controls";
const parse = (value: unknown) => pageSchema(fanpageRequestSchema).parse(value);
type PageVerification = "verified" | "unverified";
/** 승인한 신청의 페이지 구분. 팬이 신청해 연 페이지는 비공식으로 시작하고, 공식으로 바꿀 때는 사유를 남긴다. */
const verificationCopy = {
  ko: { legend: "페이지 구분", unverified: "팬이 만든 페이지(비공식)", verified: "kyaa official(공식)", reason: "구분을 바꾸는 사유", current: "지금 구분", change: "구분 바꾸기" },
  en: { legend: "Page type", unverified: "Fan-made page (unofficial)", verified: "kyaa official", reason: "Reason for the change", current: "Current type", change: "Change type" },
} as const;
function VerificationChoice({ locale, value, onChange, reasonRequired }: { locale: "ko" | "en"; value: PageVerification; onChange: (value: PageVerification) => void; reasonRequired: boolean }) {
  const v = verificationCopy[locale];
  return <><fieldset><legend>{v.legend}</legend>{(["unverified", "verified"] as const).map(option => <label key={option}><input type="radio" name="verification" value={option} checked={value === option} onChange={() => onChange(option)} />{v[option]}</label>)}</fieldset>
    {reasonRequired && <label>{v.reason}<textarea name="verificationReason" required maxLength={1000} /></label>}</>;
}
export function AuthorizedFanpageRequestManager({ locale = "ko" }: { locale?: "ko" | "en" }) { return <ParticipationAdmin locale={locale} title={participationCopy(locale).fanpage} description={locale === "ko" ? "팬페이지 개설 신청을 검토하고 아티스트와 연결합니다." : "Review fan page requests and link approved requests to an artist."}>{role => <Manager locale={locale} role={role} />}</ParticipationAdmin>; }
function Manager({ locale, role }: { locale: "ko" | "en"; role: string }) {
  const c = participationCopy(locale), [status, setStatus] = useState("pending"), list = useAdminPage(`/api/admin/fanpage-requests?status=${status}&locale=${locale}`, parse), creators = useParticipationCreators();
  const creatorItems = creators.state.status === "ready" ? creators.state.data : [];
  return <><div className={styles.tabs}>{(["pending", "approved", "rejected"] as const).map(value => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{c[value]}</button>)}</div><FanAction href={`/admin/celebrities?lang=${locale}`}>{locale === "ko" ? "아티스트 관리" : "Manage artists"}</FanAction>
    {creators.state.status !== "ready" ? <ParticipationState locale={locale} status={creators.state.status} retry={creators.retry} /> : <ul className={styles.list}>{list.state.data.map(item => <Review key={`${item.id}:${item.revision}`} item={item} locale={locale} role={role} creators={creatorItems} refresh={list.retry} />)}</ul>}<AdminListState locale={locale} resource={list} /></>;
}
function Review({ item, locale, role, creators, refresh }: { item: FanpageRequest; locale: "ko" | "en"; role: string; creators: CreatorRefs; refresh: () => void }) {
  const c = participationCopy(locale), v = verificationCopy[locale], action = useParticipationAction(), [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [verification, setVerification] = useState<PageVerification>("unverified");
  const [nextVerification, setNextVerification] = useState<PageVerification>(item.pageVerification === "verified" ? "unverified" : "verified");
  return <li className={styles.row}><span className={styles.badge}>{c[item.status]}</span><h3>{item.name}</h3><a href={item.officialSocialUrl} target="_blank" rel="noopener noreferrer">{item.officialSocialUrl}</a><p>{item.note}</p>{item.reviewReason && <p>{c.reason}: {item.reviewReason}</p>}{item.artist && <FanAction href={item.artist.href}>{item.artist.name}</FanAction>}{item.pageVerification && <p>{v.current}: {v[item.pageVerification]}</p>}
    {item.status === "pending" && <form className={styles.form} onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget), approve = decision === "approve"; const result = await action.run(`/api/admin/fanpage-requests/${item.id}`, "PATCH", { expectedRevision: item.revision, decision, celebrityId: approve ? data.get("celebrityId") : null, reason: String(data.get("reason") ?? "").trim() || null, locale, ...(approve ? { verification, verificationReason: String(data.get("verificationReason") ?? "").trim() || null } : {}) }, value => mutationSchema(fanpageRequestSchema).parse(value)); if (result) refresh(); }}><fieldset disabled={action.busy || role === "viewer"}><label>{c.reviewDecision}<select name="decision" value={decision} onChange={event => setDecision(event.target.value as "approve" | "reject")}><option value="approve">{c.approve}</option><option value="reject">{c.reject}</option></select></label><CreatorSelect locale={locale} creators={creators} required={decision === "approve"} />{decision === "approve" && <VerificationChoice locale={locale} value={verification} onChange={setVerification} reasonRequired={verification === "verified"} />}<label>{c.reason}<textarea name="reason" required={decision === "reject"} maxLength={2000} /></label><FanAction type="submit">{c.save}</FanAction></fieldset></form>}
    {item.status === "approved" && item.pageVerification && <form className={styles.form} onSubmit={async event => { event.preventDefault(); const data = new FormData(event.currentTarget); const result = await action.run(`/api/admin/fanpage-requests/${item.id}/verification`, "PATCH", { verification: nextVerification, reason: String(data.get("verificationReason") ?? "").trim() || null, locale }, value => mutationSchema(fanpageRequestSchema).parse(value)); if (result) refresh(); }}><fieldset disabled={action.busy || role === "viewer"}><VerificationChoice locale={locale} value={nextVerification} onChange={setNextVerification} reasonRequired={nextVerification !== item.pageVerification} /><FanAction type="submit" disabled={nextVerification === item.pageVerification}>{v.change}</FanAction></fieldset></form>}
    <ActionFeedback locale={locale} error={action.error} />{action.error.includes("CONFLICT") && <FanAction onClick={refresh}>{c.refreshLatest}</FanAction>}</li>;
}
