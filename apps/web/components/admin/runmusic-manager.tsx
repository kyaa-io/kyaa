"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { FanAction } from "@/components/fan-ui/fan-action";
import { runmusicCampaignSchema } from "@/features/runmusic/domain";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { AdminAccessState } from "./admin-access-state";
import { AdminOperationsShell, type AdminLocale } from "./operations-shell";
import { useAdminSession } from "./use-admin-session";
import styles from "./runmusic-manager.module.css";

const adminSchema = z.object({ campaign: runmusicCampaignSchema, revision: z.number().int(), participantCount: z.number().int(), drawId: z.uuid().nullable(), winnerCount: z.number().int(), receivedCount: z.number().int() });
type State = z.infer<typeof adminSchema>;
const copy = {
  ko: { title: "RUN&MUSIC 참여 관리", description: "행사 시간과 참여 상태를 확인하고 추첨·수령을 관리하세요.", participants: "참여자", winners: "당첨자", received: "수령 완료", refresh: "새로고침", settings: "운영 설정", registrationOpensAt: "사전 참여 시작 (KST)", registrationClosesAt: "사전 참여 마감 (KST)", eventStartsAt: "당일 참여 시작 (KST)", eventEndsAt: "당일 참여 종료 (KST)", prizeCount: "당첨 인원", published: "참여 공개", resultsPublished: "결과 공개", save: "설정 저장", saved: "저장했어요.", loading: "불러오는 중…", error: "처리하지 못했어요. 상태를 새로 확인한 뒤 다시 시도해 주세요.", conflict: "다른 관리자가 설정을 변경했어요. 새로고침 후 다시 확인해 주세요.", code: "현장 코드 (16~128자)", rotate: "현장 코드 변경", codeHelp: "코드가 바뀌면 기존 현장 QR은 사용할 수 없어요. 새 코드로 현장 QR을 준비하세요.", checkinLink: "새 현장 QR에 사용할 주소", draw: "추첨 실행", confirm: "참여를 마감하고 추첨을 실행할 것을 확인했어요. 추첨 후 참여 내역은 고정돼요.", drawn: "추첨 완료", receipt: "당첨자의 수령 확인 번호", receive: "수령 완료 처리", receivedMessage: "수령 확인을 기록했어요.", receiveHelp: "당첨자 화면의 확인 번호를 대조한 뒤 처리하세요. 쿠폰 자동 발송 기능은 포함되지 않아요.", publicLink: "참여 화면 열기", confirmPublish: "추첨 결과를 참여자에게 공개합니다." },
  en: { title: "RUN&MUSIC participation", description: "Manage event times, participation, the draw and prize collection.", participants: "Participants", winners: "Winners", received: "Collected", refresh: "Refresh", settings: "Event settings", registrationOpensAt: "Pre-event opens (KST)", registrationClosesAt: "Pre-event closes (KST)", eventStartsAt: "Event-day opens (KST)", eventEndsAt: "Event-day closes (KST)", prizeCount: "Number of winners", published: "Open participation", resultsPublished: "Publish results", save: "Save settings", saved: "Saved.", loading: "Loading…", error: "Could not complete this. Refresh the status and try again.", conflict: "Another administrator changed the settings. Refresh and review them again.", code: "On-site code (16–128 characters)", rotate: "Change on-site code", codeHelp: "Changing the code invalidates the current on-site QR. Prepare a new QR with the new code.", checkinLink: "URL for the new on-site QR", draw: "Run draw", confirm: "I confirm participation has closed and want to run the draw. Entries are frozen after drawing.", drawn: "Draw completed", receipt: "Winner’s collection receipt number", receive: "Mark collected", receivedMessage: "Collection has been recorded.", receiveHelp: "Verify the number on the winner’s screen first. Coupons are not sent automatically.", publicLink: "Open participation page", confirmPublish: "Make the draw results visible to participants." },
};
export function toRunmusicKstInput(iso: string) { return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 16); }
export function fromRunmusicKstInput(value: string) { return new Date(`${value}:00+09:00`).toISOString(); }

export function RunmusicManager({ locale }: { locale: AdminLocale }) {
  const session = useAdminSession(), auth = usePrivy();
  if (session.status !== "authorized") return <AdminAccessState status={session.status} locale={locale} />;
  return <Manager key={`${auth.user?.id}:${session.admin.role}`} locale={locale} role={session.admin.role} getAccessToken={auth.getAccessToken} />;
}
function Manager({ locale, role, getAccessToken }: { locale: AdminLocale; role: string; getAccessToken: () => Promise<string | null> }) {
  const t = copy[locale];
  const [state, setState] = useState<State | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0), [code, setCode] = useState(""), [qrUrl, setQrUrl] = useState("");
  const [confirmed, setConfirmed] = useState(false), [receipt, setReceipt] = useState("");
  const [access, setAccess] = useState<"unauthenticated" | "denied" | null>(null);
  const mutationBusy = useRef(false), alive = useRef(false), controller = useRef<AbortController | null>(null), drawKey = useRef<string | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => {
    const request = new AbortController(); setError("");
    void withRequestDeadline(async signal => {
      const token = await getAccessToken(); signal.throwIfAborted(); if (!token) throw new Error("AUTH_REQUIRED");
      const response = await fetch("/api/admin/runmusic", { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal });
      if (response.status === 401 || response.status === 403) { setAccess(response.status === 401 ? "unauthenticated" : "denied"); return; }
      if (!response.ok) throw new Error("FAILED"); return adminSchema.parse(await response.json());
    }, { signal: request.signal }).then(result => { if (result && !request.signal.aborted) setState(result); }).catch(() => { if (!request.signal.aborted) setError(t.error); });
    return () => request.abort();
  }, [getAccessToken, revision, t.error]);
  async function mutate(path: string, method: string, payload: unknown) {
    if (mutationBusy.current || role === "viewer") return false;
    mutationBusy.current = true; setBusy(true); setError(""); setNotice("");
    const request = new AbortController(); controller.current = request;
    try {
      await withRequestDeadline(async signal => {
        const token = await getAccessToken(); signal.throwIfAborted(); if (!token) throw new Error("AUTH_REQUIRED");
        const response = await fetch(`/api/admin/runmusic${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(payload), signal });
        if (response.status === 401 || response.status === 403) { if (alive.current) setAccess(response.status === 401 ? "unauthenticated" : "denied"); throw new Error("AUTH_REQUIRED"); }
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error?.code ?? "FAILED");
        if (!alive.current) return;
        if (path === "/receive") { z.object({ receivedAt: z.string(), replayed: z.boolean() }).parse(result); setNotice(t.receivedMessage); setReceipt(""); setRevision(value => value + 1); }
        else { setState(adminSchema.parse(result)); setNotice(t.saved); }
      }, { signal: request.signal });
      return alive.current;
    } catch (problem) { if (alive.current && !request.signal.aborted) setError(problem instanceof Error && problem.message === "RUNMUSIC_CONFLICT" ? t.conflict : t.error); return false; }
    finally { if (alive.current) { mutationBusy.current = false; setBusy(false); } }
  }
  if (access) return <AdminAccessState status={access} locale={locale} />;
  const timeFields = ["registrationOpensAt", "registrationClosesAt", "eventStartsAt", "eventEndsAt"] as const;
  return <AdminOperationsShell locale={locale} adminRole={role}><div className={styles.main}>
    <header className={styles.heading}><div><h1>{t.title}</h1><p>{t.description}</p></div><FanAction href={`/connect/runmusic?locale=${locale}`}>{t.publicLink}</FanAction><FanAction disabled={busy} onClick={() => { setRevision(value => value + 1); setNotice(""); }}>{t.refresh}</FanAction></header>
    {state ? <>
      <dl className={styles.totals}>{([[t.participants, state.participantCount], [t.winners, state.winnerCount], [t.received, state.receivedCount]] as const).map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
      <section className={styles.panel}><h2>{t.settings}</h2><form key={state.revision} onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        void mutate("", "PATCH", { expectedRevision: state.revision, ...(!state.drawId ? { ...Object.fromEntries(timeFields.map(key => [key, fromRunmusicKstInput(String(data.get(key)))])), prizeCount: Number(data.get("prizeCount")) } : {}), published: data.get("published") === "on", resultsPublished: data.get("resultsPublished") === "on" });
      }}><fieldset disabled={busy || role === "viewer" || !!state.drawId} className={styles.fields}>{timeFields.map(key => <label key={key}>{t[key]}<input name={key} type="datetime-local" defaultValue={toRunmusicKstInput(state.campaign[key])} required /></label>)}<label>{t.prizeCount}<input name="prizeCount" type="number" min={1} max={1000} required defaultValue={state.campaign.prizeCount} /></label></fieldset>
        <fieldset className={styles.checks} disabled={busy || role === "viewer"}><label><input type="checkbox" name="published" defaultChecked={state.campaign.published} />{t.published}</label><label><input type="checkbox" name="resultsPublished" disabled={!state.drawId} defaultChecked={state.campaign.resultsPublished} />{t.resultsPublished}</label><p>{t.confirmPublish}</p><FanAction type="submit" variant="primary">{t.save}</FanAction></fieldset>
      </form></section>
      <section className={styles.panel}><h2>{t.code}</h2><p id="runmusic-admin-code-help">{t.codeHelp}</p><form onSubmit={event => { event.preventDefault(); void mutate("/rotate-code", "POST", { code }).then(ok => { if (ok) { setQrUrl(`${window.location.origin}/connect/runmusic#checkin=${encodeURIComponent(code)}`); setCode(""); } }); }}><fieldset disabled={busy || role === "viewer" || !!state.drawId} className={styles.fields}><label>{t.code}<input value={code} minLength={16} maxLength={128} onChange={event => setCode(event.target.value)} required autoComplete="off" aria-describedby="runmusic-admin-code-help" /></label><FanAction type="submit">{t.rotate}</FanAction></fieldset></form>{qrUrl && <label className={styles.url}>{t.checkinLink}<input readOnly value={qrUrl} onFocus={event => event.target.select()} /></label>}</section>
      <section className={styles.panel}><h2>{state.drawId ? t.drawn : t.draw}</h2>{!state.drawId && <><label className={styles.confirm}><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy || role === "viewer"} />{t.confirm}</label><FanAction disabled={busy || !confirmed || role === "viewer"} onClick={() => { drawKey.current ??= crypto.randomUUID(); void mutate("/draw", "POST", { requestKey: drawKey.current }); }}>{t.draw}</FanAction></>}</section>
      <section className={styles.panel}><h2>{t.receive}</h2><p id="runmusic-receive-help">{t.receiveHelp}</p><form onSubmit={event => { event.preventDefault(); if (!z.uuid().safeParse(receipt).success) { setError(t.error); return; } void mutate("/receive", "POST", { receiptId: receipt }); }}><fieldset disabled={busy || role === "viewer" || !state.campaign.resultsPublished} className={styles.fields}><label>{t.receipt}<input value={receipt} onChange={event => setReceipt(event.target.value.trim())} required maxLength={36} autoComplete="off" aria-describedby="runmusic-receive-help" /></label><FanAction type="submit">{t.receive}</FanAction></fieldset></form></section>
    </> : !error && <p role="status">{t.loading}</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}{notice && <p role="status">{notice}</p>}
  </div></AdminOperationsShell>;
}
