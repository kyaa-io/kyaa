"use client";

import { useCallback, useEffect, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import styles from "./proof-review-panel.module.css";

type Locale = "ko" | "en";
export type ProofRequest = (url: string, method?: string, body?: unknown) => Promise<{ ok: boolean; status: number; data: unknown }>;

type Row = {
  id: string; status: string; revision: number; createdAt: string; proofType: string; publishConsent: boolean; amountVisible: boolean;
  applicantName?: string | null; creatorName?: string | null; duplicateOf: string[]; rejectionReason?: string | null;
  uploadIds?: string[]; postBody?: string | null;
};

const TEXT = {
  ko: {
    status: "상태", pending: "대기", in_review: "검토 중", approved: "승인", rejected: "반려", changes_requested: "재제출 요청",
    applicant: "신청자", creator: "크리에이터", type: "인증 종류", consent: "공개 동의", amount: "금액 공개", flags: "경고", actions: "처리", submitted: "제출",
    yes: "예", no: "아니오", dup: "중복 의심", empty: "대기 중인 인증이 없습니다.", loading: "불러오는 중",
    pointReviews: "포인트 환수 검토", member: "회원", page: "페이지", stamp: "도장", points: "금액", pointReason: "사유", at: "시각", more: "더 보기", pointEmpty: "검토할 포인트 환수가 없습니다.", body: "게시글", viewImage: "이미지 보기", hideImage: "이미지 닫기", imageAlt: "제출 이미지", imageFailed: "이미지를 불러오지 못했습니다.", NOT_FOUND: "이미지를 찾을 수 없습니다.", reason: "사유", approve: "승인", reject: "반려", changes: "재제출 요청", refresh: "새로고침",
    done: "처리했습니다.", replayed: "이미 처리된 요청입니다. 이전 결과를 보여줍니다.",
    REVISION_CONFLICT: "다른 관리자가 먼저 처리했습니다. 새로고침하세요.", INVALID_TRANSITION: "이 상태에서는 처리할 수 없습니다.",
    PROOF_STAMP_UNAVAILABLE: "도장을 발급할 수 없어 승인하지 못했습니다.", FAN_WEB_ACTIVE_ACCOUNT_REQUIRED: "이용이 제한된 회원이라 승인할 수 없어요.", GROUP_WALLET_UNAVAILABLE: "지갑 기능이 꺼져 있어 처리하지 못했어요.", GROUP_WALLET_WRITE_FENCED: "지갑 쓰기가 잠시 막혀 있어 처리하지 못했어요.", REASON_REQUIRED: "사유를 3자 이상 적어 주세요.",
    ADMIN_REQUIRED: "관리자 권한이 필요합니다.", failed: "처리하지 못했습니다.",
    voidTitle: "도장 무효 처리", stampId: "도장 ID", sanction: "제재 포함", voidRun: "무효 처리", voided: "무효 처리했습니다.",
    STAMP_NOT_FOUND: "도장을 찾을 수 없습니다.", correction: "포인트 정정", review: "포인트 정정은 검토가 필요합니다.", corrected: "포인트를 정정했습니다.", none: "정정할 포인트가 없습니다.",
  },
  en: {
    status: "Status", pending: "Pending", in_review: "In review", approved: "Approved", rejected: "Rejected", changes_requested: "Resubmission requested",
    applicant: "Applicant", creator: "Creator", type: "Proof type", consent: "Public consent", amount: "Amount visible", flags: "Warnings", actions: "Actions", submitted: "Submitted",
    yes: "Yes", no: "No", dup: "Possible duplicate", empty: "No proofs waiting.", loading: "Loading",
    pointReviews: "Point clawback reviews", member: "Member", page: "Page", stamp: "Stamp", points: "Amount", pointReason: "Reason", at: "Time", more: "Load more", pointEmpty: "No point clawbacks to review.", body: "Post text", viewImage: "View image", hideImage: "Hide image", imageAlt: "Submitted image", imageFailed: "Could not load the image.", NOT_FOUND: "Image not found.", reason: "Reason", approve: "Approve", reject: "Reject", changes: "Request resubmission", refresh: "Refresh",
    done: "Done.", replayed: "Already handled. Showing the earlier result.",
    REVISION_CONFLICT: "Another admin handled this first. Refresh.", INVALID_TRANSITION: "Not allowed in this state.",
    PROOF_STAMP_UNAVAILABLE: "No stamp could be issued, so approval was not applied.", FAN_WEB_ACTIVE_ACCOUNT_REQUIRED: "This member is restricted, so this can't be approved.", GROUP_WALLET_UNAVAILABLE: "The wallet is turned off, so this couldn't be processed.", GROUP_WALLET_WRITE_FENCED: "Wallet changes are paused, so this couldn't be processed.", REASON_REQUIRED: "Enter a reason of at least 3 characters.",
    ADMIN_REQUIRED: "Admin rights are required.", failed: "Could not complete.",
    voidTitle: "Void a stamp", stampId: "Stamp ID", sanction: "Include sanction", voidRun: "Void", voided: "Stamp voided.",
    STAMP_NOT_FOUND: "Stamp not found.", correction: "Point correction", review: "Point correction needs review.", corrected: "Points corrected.", none: "No points to correct.",
  },
} as const;

type PointRow = { id: string; stampId: string; appUserId: string; celebrityId: string; amount: number; reason?: string | null; voidReason?: string | null; createdAt: string };
const short = (value: string) => value.slice(0, 8);

const FILTERS = ["pending", "in_review", "approved", "rejected", "changes_requested"] as const;

export function ProofReviewPanel({ locale, request, canWrite }: { locale: Locale; request: ProofRequest; canWrite: boolean }) {
  const t = TEXT[locale];
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("pending");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [stampId, setStampId] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [sanction, setSanction] = useState(false);
  const [view, setView] = useState<"queue" | "points">("queue");
  const [points, setPoints] = useState<PointRow[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [images, setImages] = useState<Record<string, string>>({});

  const codeText = (data: unknown) => {
    const code = (data as { error?: { code?: string } } | null)?.error?.code;
    return (code && (t as Record<string, string>)[code]) || t.failed;
  };

  const load = useCallback(async () => {
    setRows(null);
    const res = await request(`/api/admin/proof-submissions?status=${filter}`);
    if (!res.ok) { setMessage({ text: codeText(res.data), error: true }); setRows([]); return; }
    setRows(((res.data as { submissions?: Row[] }).submissions) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, request]);
  useEffect(() => { if (view === "queue") void load(); }, [load, view]);

  const loadPoints = useCallback(async (append: boolean, before?: string) => {
    if (!append) setPoints(null);
    const res = await request(`/api/admin/proof-submissions/point-reviews${before ? `?before=${encodeURIComponent(before)}` : ""}`);
    if (!res.ok) { setMessage({ text: codeText(res.data), error: true }); if (!append) setPoints([]); return; }
    const data = res.data as { reviews?: PointRow[]; hasMore?: boolean };
    setPoints((current) => [...(append ? current ?? [] : []), ...(data.reviews ?? [])]);
    setHasMore(Boolean(data.hasMore));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);
  useEffect(() => { if (view === "points") { setMessage(null); void loadPoints(false); } }, [view, loadPoints]);

  // The signed link lasts two minutes and is only kept in memory; it is dropped when it expires or fails to load.
  async function toggleImage(row: Row, uploadId: string) {
    if (images[uploadId]) { setImages(({ [uploadId]: _gone, ...rest }) => rest); return; }
    const res = await request(`/api/admin/proof-submissions/${row.id}/images/${uploadId}`);
    const image = (res.data as { image?: { url: string; expiresInSeconds: number } } | null)?.image;
    if (!res.ok || !image) { setMessage({ text: codeText(res.data), error: true }); return; }
    setImages((current) => ({ ...current, [uploadId]: image.url }));
    window.setTimeout(() => setImages(({ [uploadId]: _gone, ...rest }) => rest), image.expiresInSeconds * 1000);
  }

  async function decide(row: Row, decision: "approved" | "rejected" | "changes_requested") {
    const reason = reasons[row.id]?.trim();
    if (decision !== "approved" && (!reason || reason.length < 3)) { setMessage({ text: t.REASON_REQUIRED, error: true }); return; }
    setBusy(true); setMessage(null);
    const res = await request(`/api/admin/proof-submissions/${row.id}/review`, "POST", { expectedRevision: row.revision, decision, ...(reason ? { reason } : {}) });
    setBusy(false);
    if (!res.ok) { setMessage({ text: codeText(res.data), error: true }); return; }
    const replayed = (res.data as { submission?: { replayed?: boolean } }).submission?.replayed;
    setMessage({ text: replayed ? t.replayed : t.done, error: false });
    await load();
  }

  async function voidStamp() {
    if (voidReason.trim().length < 3) { setMessage({ text: t.REASON_REQUIRED, error: true }); return; }
    setBusy(true); setMessage(null);
    const res = await request(`/api/admin/passport-stamps/${stampId.trim()}/void`, "POST", {
      requestKey: `void-${stampId.trim()}`, reason: voidReason.trim(), sanction,
    });
    setBusy(false);
    if (!res.ok) { setMessage({ text: codeText(res.data), error: true }); return; }
    const r = (res.data as { result: { replayed: boolean; pointCorrection: "none" | "corrected" | "review" } }).result;
    setMessage({ text: `${r.replayed ? t.replayed : t.voided} ${t.correction}: ${t[r.pointCorrection]}`, error: false });
  }

  return (
    <section className={styles.panel}>
      <div className={styles.bar}>
        {FILTERS.map((f) => (
          <FanAction key={f} variant="neutral" aria-current={view === "queue" && f === filter ? "true" : undefined} onClick={() => { setView("queue"); setFilter(f); }}>{t[f]}</FanAction>
        ))}
        <FanAction variant="neutral" aria-current={view === "points" ? "true" : undefined} onClick={() => setView("points")}>{t.pointReviews}</FanAction>
        <FanAction variant="text" onClick={() => void (view === "points" ? loadPoints(false) : load())}>{t.refresh}</FanAction>
      </div>
      {message ? <p role={message.error ? "alert" : "status"} className={message.error ? styles.error : styles.status}>{message.text}</p> : null}
      {view === "points" ? (points === null ? <p className={styles.status}>{t.loading}</p> : points.length === 0 ? <p className={styles.status}>{t.pointEmpty}</p> : (
        <>
          <div className={styles.tableScroll} role="region" tabIndex={0} aria-label={t.pointReviews}>
            <table className={`${styles.table} ${styles.pointsTable}`}>
              <thead><tr><th>{t.at}</th><th>{t.points}</th><th>{t.member}</th><th>{t.page}</th><th>{t.stamp}</th><th>{t.pointReason}</th></tr></thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.id}>
                    <td className={styles.nowrap}>{p.createdAt.slice(0, 16).replace("T", " ")}</td>
                    <td className={styles.nowrap}>{p.amount}</td>
                    <td className={styles.nowrap}>{short(p.appUserId)}</td>
                    <td className={styles.nowrap}>{short(p.celebrityId)}</td>
                    <td className={styles.nowrap}>{short(p.stampId)}</td>
                    <td className={styles.body}>{p.voidReason ?? p.reason ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore ? <div className={styles.buttons}><FanAction variant="neutral" onClick={() => void loadPoints(true, points.at(-1)?.createdAt)}>{t.more}</FanAction></div> : null}
        </>
      )) : rows === null ? <p className={styles.status}>{t.loading}</p> : rows.length === 0 ? <p className={styles.status}>{t.empty}</p> : (
        <div className={styles.tableScroll} role="region" tabIndex={0} aria-label={t.actions}>
          <table className={styles.table}>
            <thead><tr>
              <th>{t.submitted}</th><th>{t.applicant}</th><th>{t.creator}</th><th>{t.type}</th><th>{t.body}</th><th>{t.consent}</th><th>{t.amount}</th><th>{t.flags}</th><th>{t.actions}</th>
            </tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.createdAt.slice(0, 16).replace("T", " ")}</td>
                  <td>{row.applicantName ?? "-"}</td>
                  <td>{row.creatorName ?? "-"}</td>
                  <td>
                    <div>{row.proofType}</div>
                    {(row.uploadIds ?? []).map((uid, i) => (
                      <div key={uid} className={styles.imageBox}>
                        <FanAction variant="text" onClick={() => void toggleImage(row, uid)}>{images[uid] ? t.hideImage : `${t.viewImage} ${i + 1}`}</FanAction>
                        {images[uid] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className={styles.image} src={images[uid]} alt={`${t.imageAlt} ${i + 1}`} referrerPolicy="no-referrer"
                            onError={() => { setImages(({ [uid]: _gone, ...rest }) => rest); setMessage({ text: t.imageFailed, error: true }); }} />
                        ) : null}
                      </div>
                    ))}
                  </td>
                  <td className={styles.body}>{row.postBody ?? "-"}</td>
                  <td>{row.publishConsent ? t.yes : t.no}</td>
                  <td>{row.amountVisible ? t.yes : t.no}</td>
                  <td>
                    {row.duplicateOf.length > 0 ? <span className={styles.warn}>{t.dup} ({row.duplicateOf.length})</span> : null}
                  </td>
                  <td>
                    {canWrite && (row.status === "pending" || row.status === "in_review") ? (
                      <div className={styles.actions}>
                        <textarea aria-label={t.reason} value={reasons[row.id] ?? ""} onChange={(e) => setReasons({ ...reasons, [row.id]: e.target.value })} />
                        <div className={styles.buttons}>
                          <FanAction variant="primary" disabled={busy} onClick={() => void decide(row, "approved")}>{t.approve}</FanAction>
                          <FanAction variant="neutral" disabled={busy} onClick={() => void decide(row, "rejected")}>{t.reject}</FanAction>
                          <FanAction variant="neutral" disabled={busy} onClick={() => void decide(row, "changes_requested")}>{t.changes}</FanAction>
                        </div>
                      </div>
                    ) : row.rejectionReason ?? t[row.status as keyof typeof t] ?? row.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canWrite && view === "queue" ? (
        <div className={styles.voidBox}>
          <strong>{t.voidTitle}</strong>
          <input type="text" aria-label={t.stampId} placeholder={t.stampId} value={stampId} onChange={(e) => setStampId(e.target.value)} />
          <textarea aria-label={t.reason} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
          <label><input type="checkbox" checked={sanction} onChange={(e) => setSanction(e.target.checked)} /> {t.sanction}</label>
          <div className={styles.buttons}><FanAction variant="neutral" disabled={busy || !stampId.trim()} onClick={() => void voidStamp()}>{t.voidRun}</FanAction></div>
        </div>
      ) : null}
    </section>
  );
}
