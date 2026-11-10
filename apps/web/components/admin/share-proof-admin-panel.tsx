"use client";

import { useCallback, useEffect, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { adminShareProofListSchema, adminShareReviewResultSchema, adminShareRevokeResultSchema, SHARE_OFFICIAL_TAGS, SHARE_REJECT_CODES, type AdminShareProof } from "@/features/share-proof/domain/share-proof";
import type { ProofRequest } from "./proof-review-panel";
import styles from "./share-proof-admin-panel.module.css";

type Locale = "ko" | "en";
type RejectCode = (typeof SHARE_REJECT_CODES)[number];
const TEXT = {
  ko: { title: "SNS 공유 인증", pending: "확인 대기", accepted: "인정", rejected: "반려됨", revoked: "취소됨", all: "전체",
    accept: "승인하고 지급", reject: "반려", rejectAs: "반려 사유", r_no_hashtag: "태그 없음", r_private_account: "비공개 계정", r_duplicate: "중복", r_unrelated: "관련 없는 게시물",
    tagOf: (handle: string) => `${handle} 태그 확인`, tagUnconfirmed: "공식 계정을 확인하지 못해 승인할 수 없습니다.", retryPay: "지급 다시 시도",
    approved: (points: number) => points > 0 ? `승인하고 ${points}P를 지급했습니다.` : "승인했습니다. 오늘 지급 한도로 0P입니다.", approvedUnpaid: "승인했습니다. 포인트 지급이 끝나지 않았습니다. 인정 목록에서 지급을 다시 시도해 주세요.", rejectedDone: "반려했습니다.",
    SELF_REVIEW_FORBIDDEN: "본인 인증은 확인할 수 없습니다.", REVIEW_STALE: "다른 확인이 먼저 반영됐습니다. 목록을 다시 불러왔습니다.", SHARE_TAG_HANDLE_UNCONFIRMED: "공식 계정을 확인하지 못해 승인할 수 없습니다.", member: "회원", creator: "크리에이터", post: "게시물", points: "지급", submitted: "제출", duplicate: (n: number) => `중복 제출 ${n}명`,
    reason: "취소 사유", revoke: "취소하고 회수", empty: "공유 인증이 없습니다.", more: "더 보기", failed: "처리하지 못했습니다.", ADMIN_REQUIRED: "관리자 권한이 필요합니다.", REASON_REQUIRED: "취소 사유를 3자 이상 적어 주세요.",
    corrected: "취소했고 포인트를 회수했습니다.", review: "취소했습니다. 포인트를 이미 써서 포인트 환수 검토로 넘겼습니다.", stamp_voided: "취소했고 스탬프를 무효 처리했습니다.", none: "취소했습니다. 회수할 지급이 없었습니다.", replayed: "이미 취소된 인증입니다." },
  en: { title: "Social share proofs", pending: "To review", accepted: "Accepted", rejected: "Rejected", revoked: "Cancelled", all: "All",
    accept: "Approve and pay", reject: "Reject", rejectAs: "Reject reason", r_no_hashtag: "No tag", r_private_account: "Private account", r_duplicate: "Duplicate", r_unrelated: "Unrelated post",
    tagOf: (handle: string) => `Check the ${handle} tag`, tagUnconfirmed: "The official account is not confirmed, so this cannot be approved.", retryPay: "Retry payout",
    approved: (points: number) => points > 0 ? `Approved and ${points}P paid.` : "Approved. 0P because of today's cap.", approvedUnpaid: "Approved, but the payout did not finish. Retry it from the Accepted list.", rejectedDone: "Rejected.",
    SELF_REVIEW_FORBIDDEN: "You cannot review your own proof.", REVIEW_STALE: "Someone decided it first. The list was reloaded.", SHARE_TAG_HANDLE_UNCONFIRMED: "The official account is not confirmed, so this cannot be approved.", member: "Member", creator: "Creator", post: "Post", points: "Paid", submitted: "Submitted", duplicate: (n: number) => `Also submitted by ${n}`,
    reason: "Reason", revoke: "Cancel and take back", empty: "No share proofs.", more: "Load more", failed: "Could not complete.", ADMIN_REQUIRED: "Admin rights are required.", REASON_REQUIRED: "Enter a reason of at least 3 characters.",
    corrected: "Cancelled and points taken back.", review: "Cancelled. The points were already spent and went to the point clawback review.", stamp_voided: "Cancelled and the stamp voided.", none: "Cancelled. Nothing had been paid.", replayed: "Already cancelled." },
} as const;
const FILTERS = ["pending", "accepted", "rejected", "revoked", "all"] as const;

/** 261107-2 D12: operators read the share proofs (a post submitted by several members is marked) and cancel one, which takes its grant back once. */
export function ShareProofAdminPanel({ locale, request, canWrite }: { locale: Locale; request: ProofRequest; canWrite: boolean }) {
  const t = TEXT[locale];
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending");
  const [rows, setRows] = useState<AdminShareProof[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [codes, setCodes] = useState<Record<string, RejectCode>>({});
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async (before?: string) => {
    if (!before) setRows(null);
    const res = await request(`/api/admin/share-proofs?status=${filter}${before ? `&before=${encodeURIComponent(before)}` : ""}`);
    const parsed = adminShareProofListSchema.safeParse(res.data);
    if (!res.ok || !parsed.success) { setRows(current => current ?? []); setMessage({ text: t.failed, error: true }); return; }
    setRows(current => before ? [...(current ?? []), ...parsed.data.items] : parsed.data.items);
    setHasMore((res.data as { hasMore?: boolean }).hasMore === true);
  }, [filter, request, t.failed]);
  useEffect(() => { void load(); }, [load]);
  async function decide(row: AdminShareProof, decision: "accept" | "reject") {
    setBusy(row.id); setMessage(null);
    const res = await request(`/api/admin/share-proofs/${row.id}/review`, "POST", decision === "accept" ? { decision, revision: row.revision } : { decision, revision: row.revision, rejectCode: codes[row.id] ?? "no_hashtag" });
    setBusy(null);
    const parsed = adminShareReviewResultSchema.safeParse((res.data as { result?: unknown } | null)?.result);
    if (!res.ok || !parsed.success) {
      const code = (res.data as { error?: { code?: string } } | null)?.error?.code;
      setMessage({ text: (code && (t as Record<string, unknown>)[code] as string) || t.failed, error: true });
      if (code === "REVIEW_STALE") void load();
      return;
    }
    const reward = parsed.data.reward;
    setMessage({ text: parsed.data.status === "rejected" ? t.rejectedDone : reward && (reward.points > 0 || reward.skippedReason) ? t.approved(reward.points) : t.approvedUnpaid, error: false });
    void load();
  }
  async function revoke(row: AdminShareProof) {
    setBusy(row.id); setMessage(null);
    const res = await request(`/api/admin/share-proofs/${row.id}/revoke`, "POST", { reason: (reasons[row.id] ?? "").trim() });
    setBusy(null);
    const parsed = adminShareRevokeResultSchema.safeParse((res.data as { result?: unknown } | null)?.result);
    if (!res.ok || !parsed.success) { const code = (res.data as { error?: { code?: string } } | null)?.error?.code; setMessage({ text: (code && (t as Record<string, unknown>)[code] as string) || t.failed, error: true }); return; }
    setMessage({ text: parsed.data.replayed ? t.replayed : t[parsed.data.result === "replayed" ? "replayed" : parsed.data.result], error: false });
    void load();
  }
  return <section className={styles.panel} aria-label={t.title}>
    <FanHeading as="h2">{t.title}</FanHeading>
    <div className={styles.filters}>{FILTERS.map(value => <FanAction key={value} size="sm" variant={filter === value ? "primary" : "secondary"} onClick={() => setFilter(value)}>{t[value]}</FanAction>)}</div>
    {message && <p role={message.error ? "alert" : "status"} className={message.error ? styles.error : styles.note}>{message.text}</p>}
    {rows === null ? <FanSkeletonRows rows={3} variant="plain" ariaLabel={t.title} /> : !rows.length ? <p>{t.empty}</p> : <ul className={styles.list}>{rows.map(row => <li key={row.id} data-share-proof={row.id} data-status={row.status}>
      <div className={styles.meta}>
        <strong>{row.creator.name}</strong><span>{t.member} {row.member.nickname ?? row.member.id.slice(0, 8)}</span>
        <span>{t.submitted} {new Date(row.createdAt).toLocaleString(locale)}</span><span>{t.points} {row.points ?? 0}P</span>
        {row.duplicateCount > 0 && <span className={styles.flag}>{t.duplicate(row.duplicateCount)}</span>}
        {row.status === "revoked" && <span className={styles.flag}>{t.revoked} · {row.revokeResult ?? ""}</span>}
        {row.status === "rejected" && row.rejectCode && <span className={styles.flag}>{t.rejected} · {t[`r_${row.rejectCode}` as const]}</span>}
      </div>
      <p className={styles.post}>{row.platform} · {row.url ? <a href={row.url} target="_blank" rel="noopener noreferrer" data-outbound-tracking="off">{row.url}</a> : row.postId}</p>
      {row.status === "pending" && <p className={styles.note}>{SHARE_OFFICIAL_TAGS[row.platform] ? t.tagOf(SHARE_OFFICIAL_TAGS[row.platform]!) : t.tagUnconfirmed}</p>}
      {canWrite && row.status === "pending" && <div className={styles.decision}>
        <FanAction size="sm" loading={busy === row.id} disabled={busy !== null || !SHARE_OFFICIAL_TAGS[row.platform]} onClick={() => void decide(row, "accept")}>{t.accept}</FanAction>
        <select aria-label={t.rejectAs} value={codes[row.id] ?? "no_hashtag"} onChange={event => setCodes(current => ({ ...current, [row.id]: event.target.value as RejectCode }))}>
          {SHARE_REJECT_CODES.map(code => <option key={code} value={code}>{t[`r_${code}` as const]}</option>)}
        </select>
        <FanAction size="sm" variant="secondary" disabled={busy !== null} onClick={() => void decide(row, "reject")}>{t.reject}</FanAction>
      </div>}
      {canWrite && row.status === "accepted" && row.points === null && <div className={styles.decision}>
        <FanAction size="sm" variant="secondary" loading={busy === row.id} disabled={busy !== null} onClick={() => void decide(row, "accept")}>{t.retryPay}</FanAction>
      </div>}
      {canWrite && row.status === "accepted" && <div className={styles.revoke}>
        <input aria-label={t.reason} placeholder={t.reason} value={reasons[row.id] ?? ""} maxLength={300} onChange={event => setReasons(current => ({ ...current, [row.id]: event.target.value }))} />
        <FanAction size="sm" variant="danger" loading={busy === row.id} disabled={busy !== null || (reasons[row.id] ?? "").trim().length < 3} onClick={() => void revoke(row)}>{t.revoke}</FanAction>
      </div>}
    </li>)}</ul>}
    {hasMore && rows?.length ? <FanAction variant="text" onClick={() => void load(rows.at(-1)!.createdAt)}>{t.more}</FanAction> : null}
  </section>;
}
