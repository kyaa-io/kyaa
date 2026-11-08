"use client";

import { useCallback, useEffect, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { adminShareProofListSchema, adminShareRevokeResultSchema, type AdminShareProof } from "@/features/share-proof/domain/share-proof";
import type { ProofRequest } from "./proof-review-panel";
import styles from "./share-proof-admin-panel.module.css";

type Locale = "ko" | "en";
const TEXT = {
  ko: { title: "SNS 공유 인증", accepted: "인정", revoked: "취소됨", all: "전체", member: "회원", creator: "크리에이터", post: "게시물", points: "지급", submitted: "제출", duplicate: (n: number) => `중복 제출 ${n}명`,
    reason: "취소 사유", revoke: "취소하고 회수", empty: "공유 인증이 없습니다.", more: "더 보기", failed: "처리하지 못했습니다.", ADMIN_REQUIRED: "관리자 권한이 필요합니다.", REASON_REQUIRED: "취소 사유를 3자 이상 적어 주세요.",
    corrected: "취소했고 포인트를 회수했습니다.", review: "취소했습니다. 포인트를 이미 써서 포인트 환수 검토로 넘겼습니다.", stamp_voided: "취소했고 도장을 무효 처리했습니다.", none: "취소했습니다. 회수할 지급이 없었습니다.", replayed: "이미 취소된 인증입니다." },
  en: { title: "Social share proofs", accepted: "Accepted", revoked: "Cancelled", all: "All", member: "Member", creator: "Creator", post: "Post", points: "Paid", submitted: "Submitted", duplicate: (n: number) => `Also submitted by ${n}`,
    reason: "Reason", revoke: "Cancel and take back", empty: "No share proofs.", more: "Load more", failed: "Could not complete.", ADMIN_REQUIRED: "Admin rights are required.", REASON_REQUIRED: "Enter a reason of at least 3 characters.",
    corrected: "Cancelled and points taken back.", review: "Cancelled. The points were already spent and went to the point clawback review.", stamp_voided: "Cancelled and the stamp voided.", none: "Cancelled. Nothing had been paid.", replayed: "Already cancelled." },
} as const;
const FILTERS = ["accepted", "revoked", "all"] as const;

/** 261107-2 D12: operators read the share proofs (a post submitted by several members is marked) and cancel one, which takes its grant back once. */
export function ShareProofAdminPanel({ locale, request, canWrite }: { locale: Locale; request: ProofRequest; canWrite: boolean }) {
  const t = TEXT[locale];
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("accepted");
  const [rows, setRows] = useState<AdminShareProof[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
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
      </div>
      <p className={styles.post}>{row.platform} · {row.url ? <a href={row.url} target="_blank" rel="noopener noreferrer" data-outbound-tracking="off">{row.url}</a> : row.postId}</p>
      {canWrite && row.status === "accepted" && <div className={styles.revoke}>
        <input aria-label={t.reason} placeholder={t.reason} value={reasons[row.id] ?? ""} maxLength={300} onChange={event => setReasons(current => ({ ...current, [row.id]: event.target.value }))} />
        <FanAction size="sm" variant="danger" loading={busy === row.id} disabled={busy !== null || (reasons[row.id] ?? "").trim().length < 3} onClick={() => void revoke(row)}>{t.revoke}</FanAction>
      </div>}
    </li>)}</ul>}
    {hasMore && rows?.length ? <FanAction variant="text" onClick={() => void load(rows.at(-1)!.createdAt)}>{t.more}</FanAction> : null}
  </section>;
}
