"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { INSTA_REJECT_CODES, instaRepostQueueSchema, instaRepostReviewResultSchema, type InstaRepostQueueItem } from "@/features/insta-repost/domain/insta-repost";
import { adminShareRevokeResultSchema } from "@/features/share-proof/domain/share-proof";
import type { ProofRequest } from "./proof-review-panel";
import styles from "./share-proof-admin-panel.module.css";
import own from "./insta-repost-admin-panel.module.css";

type Locale = "ko" | "en";
type RejectCode = (typeof INSTA_REJECT_CODES)[number];
const TEXT = {
  ko: { title: "인스타 리포스트 확인", pending: "확인 대기", accepted: "승인됨", rejected: "반려됨", revoked: "회수됨", all: "전체", member: "회원", submitted: "제출",
    hours: (n: number) => `${n}시간 지남`, feed: "피드", reel: "릴스", story: "스토리", capture: "캡처 보기", accept: "승인", reject: "반려", rejectAs: "반려 사유",
    no_hashtag: "해시태그 없음", private_account: "비공개 계정", duplicate: "중복", unrelated: "관련 없는 게시물", duplicateCount: (n: number) => `같은 게시물 ${n}명`,
    paid: (p: number) => `${p}P 지급`, point_cap: "오늘 지급 한도로 0P", month_cap: "이번 달 지급 한도로 0P", account_inactive: "계정 제한으로 0P", clawedBack: "스탬프 무효로 회수됨",
    reason: "회수 사유", revoke: "회수", empty: "리포스트가 없습니다.", more: "더 보기", failed: "처리하지 못했습니다.", captureFailed: "캡처를 열지 못했습니다.",
    SELF_REVIEW_FORBIDDEN: "본인 리포스트는 확인할 수 없습니다.", REVIEW_FORBIDDEN: "이 리포스트를 확인할 권한이 없습니다.", REVIEW_STALE: "다른 확인이 먼저 반영됐습니다. 목록을 다시 불러왔습니다.",
    SHARE_PROOF_NOT_ACCEPTED: "승인된 리포스트만 회수할 수 있습니다.", CLAWBACK_WINDOW_CLOSED: "승인 7일이 지나 회수할 수 없습니다.", REASON_REQUIRED: "회수 사유를 3자 이상 적어 주세요.",
    corrected: "회수했습니다.", review: "포인트를 이미 써서 포인트 환수 검토로 넘겼습니다.", stamp_voided: "스탬프를 무효 처리했습니다.", none: "회수할 지급이 없어 상태만 바꿨습니다.", replayed: "이미 회수된 리포스트입니다." },
  en: { title: "Instagram reposts", pending: "To review", accepted: "Approved", rejected: "Rejected", revoked: "Revoked", all: "All", member: "Member", submitted: "Submitted",
    hours: (n: number) => `${n}h ago`, feed: "Feed", reel: "Reel", story: "Story", capture: "View capture", accept: "Approve", reject: "Reject", rejectAs: "Reject reason",
    no_hashtag: "No hashtag", private_account: "Private account", duplicate: "Duplicate", unrelated: "Unrelated post", duplicateCount: (n: number) => `Also sent by ${n}`,
    paid: (p: number) => `${p}P paid`, point_cap: "0P: daily cap", month_cap: "0P: monthly cap", account_inactive: "0P: account restricted", clawedBack: "Taken back by a stamp void",
    reason: "Revoke reason", revoke: "Revoke", empty: "No reposts.", more: "Load more", failed: "Could not complete.", captureFailed: "Could not open the capture.",
    SELF_REVIEW_FORBIDDEN: "You cannot review your own repost.", REVIEW_FORBIDDEN: "You cannot review this repost.", REVIEW_STALE: "Someone decided it first. The list was reloaded.",
    SHARE_PROOF_NOT_ACCEPTED: "Only approved reposts can be revoked.", CLAWBACK_WINDOW_CLOSED: "More than 7 days since approval.", REASON_REQUIRED: "Enter a reason of at least 3 characters.",
    corrected: "Revoked.", review: "The points were already spent and went to the point clawback review.", stamp_voided: "The stamp was voided.", none: "Nothing had been paid; the status changed.", replayed: "Already revoked." },
} as const;
const FILTERS = ["pending", "accepted", "rejected", "revoked", "all"] as const;

/** B3 §5.2: admins approve or reject Instagram reposts (oldest first), see the story capture, and revoke an approved one within 7 days. */
export function InstaRepostAdminPanel({ locale, request, requestImage, canWrite }: {
  locale: Locale; request: ProofRequest; requestImage: (url: string) => Promise<Blob | null>; canWrite: boolean;
}) {
  const t = TEXT[locale];
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending");
  const [rows, setRows] = useState<InstaRepostQueueItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [codes, setCodes] = useState<Record<string, RejectCode>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [captures, setCaptures] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // when the list was read, for the waiting time of pending rows (reviewHours 48 is shown, not enforced)
  const [readAt, setReadAt] = useState(0);
  const load = useCallback(async (after?: string) => {
    if (!after) setRows(null);
    const res = await request(`/api/admin/insta-reposts?status=${filter}${after ? `&after=${encodeURIComponent(after)}` : ""}`);
    const parsed = instaRepostQueueSchema.extend({ hasMore: z.boolean() }).strict().safeParse(res.data);
    if (!res.ok || !parsed.success) { setRows(current => current ?? []); setMessage({ text: t.failed, error: true }); return; }
    setRows(current => after ? [...(current ?? []), ...parsed.data.items] : parsed.data.items);
    setHasMore(parsed.data.hasMore);
    setReadAt(Date.now());
  }, [filter, request, t.failed]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { Object.values(captures).forEach(url => URL.revokeObjectURL(url)); }, [captures]);
  const failure = (data: unknown) => {
    const code = (data as { error?: { code?: string } } | null)?.error?.code;
    return (code && (t as Record<string, unknown>)[code] as string) || t.failed;
  };
  async function decide(row: InstaRepostQueueItem, decision: "accept" | "reject") {
    setBusy(row.id); setMessage(null);
    const body = decision === "accept" ? { decision, revision: row.revision } : { decision, revision: row.revision, rejectCode: codes[row.id] ?? "no_hashtag" };
    const res = await request(`/api/admin/insta-reposts/${row.id}/review`, "POST", body);
    setBusy(null);
    const parsed = instaRepostReviewResultSchema.safeParse((res.data as { result?: unknown } | null)?.result);
    if (!res.ok || !parsed.success) { setMessage({ text: failure(res.data), error: true }); if (res.status === 409) void load(); return; }
    setMessage({ text: parsed.data.status === "accepted" ? payText(parsed.data.payResult, parsed.data.points) : `${t.rejected} · ${t[codes[row.id] ?? "no_hashtag"]}`, error: false });
    void load();
  }
  async function revoke(row: InstaRepostQueueItem) {
    setBusy(row.id); setMessage(null);
    const res = await request(`/api/admin/share-proofs/${row.id}/revoke`, "POST", { reason: (reasons[row.id] ?? "").trim() });
    setBusy(null);
    const parsed = adminShareRevokeResultSchema.safeParse((res.data as { result?: unknown } | null)?.result);
    if (!res.ok || !parsed.success) { setMessage({ text: failure(res.data), error: true }); return; }
    setMessage({ text: parsed.data.replayed ? t.replayed : t[parsed.data.result], error: false });
    void load();
  }
  async function showCapture(row: InstaRepostQueueItem) {
    const blob = await requestImage(`/api/admin/insta-reposts/${row.id}/capture`);
    if (!blob) { setMessage({ text: t.captureFailed, error: true }); return; }
    setCaptures(current => ({ ...current, [row.id]: URL.createObjectURL(blob) }));
  }
  function payText(result: InstaRepostQueueItem["payResult"], points: number | null) {
    if (result === "paid") return t.paid(points ?? 0);
    return result ? t[result] : "";
  }
  return <section className={styles.panel} aria-label={t.title}>
    <FanHeading as="h2">{t.title}</FanHeading>
    <div className={styles.filters}>{FILTERS.map(value => <FanAction key={value} size="sm" variant={filter === value ? "primary" : "secondary"} onClick={() => setFilter(value)}>{t[value]}</FanAction>)}</div>
    {message && <p role={message.error ? "alert" : "status"} className={message.error ? styles.error : styles.note}>{message.text}</p>}
    {rows === null ? <FanSkeletonRows rows={3} variant="plain" ariaLabel={t.title} /> : !rows.length ? <p>{t.empty}</p> : <ul className={styles.list}>{rows.map(row => <li key={row.id} data-insta-repost={row.id} data-status={row.status}>
      <div className={styles.meta}>
        <strong>{row.creator.name}</strong><span>{t.member} {row.member.nickname ?? row.member.id.slice(0, 8)}</span>
        <span>{t.submitted} {new Date(row.submittedAt).toLocaleString(locale)}</span>
        {row.status === "pending" && readAt > 0 && <span>{t.hours(Math.max(0, Math.floor((readAt - Date.parse(row.submittedAt)) / 3_600_000)))}</span>}
        <span>{t[row.postKind]}</span>
        {row.status === "accepted" && <span>{payText(row.payResult, row.points)}</span>}
        {row.status === "rejected" && row.rejectCode && <span>{t.rejected} · {t[row.rejectCode]}</span>}
        {row.duplicateCount > 0 && <span className={styles.flag}>{t.duplicateCount(row.duplicateCount)}</span>}
        {row.clawedBack && <span className={styles.flag}>{t.clawedBack}</span>}
        {row.status === "revoked" && <span className={styles.flag}>{t.revoked} · {row.revokeResult ?? ""}</span>}
      </div>
      {row.url && <p className={styles.post}><a href={row.url} target="_blank" rel="noopener noreferrer" data-outbound-tracking="off">{row.url}</a></p>}
      {row.hasCapture && (captures[row.id]
        ? <img src={captures[row.id]} alt={t.capture} className={own.capture} />
        : <FanAction size="sm" variant="text" onClick={() => void showCapture(row)}>{t.capture}</FanAction>)}
      {canWrite && row.status === "pending" && <div className={own.decision}>
        <FanAction size="sm" loading={busy === row.id} disabled={busy !== null} onClick={() => void decide(row, "accept")}>{t.accept}</FanAction>
        <select aria-label={t.rejectAs} value={codes[row.id] ?? "no_hashtag"} onChange={event => setCodes(current => ({ ...current, [row.id]: event.target.value as RejectCode }))}>
          {INSTA_REJECT_CODES.map(code => <option key={code} value={code}>{t[code]}</option>)}
        </select>
        <FanAction size="sm" variant="secondary" disabled={busy !== null} onClick={() => void decide(row, "reject")}>{t.reject}</FanAction>
      </div>}
      {canWrite && row.status === "accepted" && <div className={styles.revoke}>
        <input aria-label={t.reason} placeholder={t.reason} value={reasons[row.id] ?? ""} maxLength={300} onChange={event => setReasons(current => ({ ...current, [row.id]: event.target.value }))} />
        <FanAction size="sm" variant="danger" loading={busy === row.id} disabled={busy !== null || (reasons[row.id] ?? "").trim().length < 3} onClick={() => void revoke(row)}>{t.revoke}</FanAction>
      </div>}
    </li>)}</ul>}
    {hasMore && rows?.length ? <FanAction variant="text" onClick={() => void load(rows.at(-1)!.submittedAt)}>{t.more}</FanAction> : null}
  </section>;
}
