"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { FanAction } from "@/components/fan-ui/fan-action";
import { runmusicAdminStateSchema, type RunmusicAdminState } from "@/features/runmusic/domain";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { AdminAccessState } from "./admin-access-state";
import { AdminOperationsShell, type AdminLocale } from "./operations-shell";
import { useAdminSession } from "./use-admin-session";
import styles from "./runmusic-manager.module.css";

const copy = {
  ko: { title: "RUN&MUSIC 응모 관리", description: "응모·결과 발표와 당첨자의 선물 수령 상태를 확인하세요.", participants: "응모자", winners: "당첨자", received: "수령 완료", refresh: "새로고침", settings: "운영 설정", entryOpensAt: "응모 시작", entryClosesAt: "응모 마감", resultsAt: "결과 발표", published: "이벤트 공개", auto: "마감 시 자동 추첨·결과 공개", autoHelp: "응모 마감과 결과 발표는 2026년 10월 24일 23:59 KST입니다. 모든 응모자의 당첨 확률은 같아요.", save: "설정 저장", saved: "저장했어요.", loading: "불러오는 중…", error: "처리하지 못했어요. 상태를 새로 확인한 뒤 다시 시도해 주세요.", conflict: "다른 관리자가 설정을 변경했어요. 새로고침 후 다시 확인해 주세요.", draw: "결과 처리 재시도", dueHelp: "발표 시각이 지난 뒤 자동 처리가 완료되지 않았을 때 사용하세요. 기존 추첨 결과는 유지돼요.", drawn: "결과 공개 완료", receipt: "수령 확인 번호", receive: "수령 완료 처리", receivedMessage: "수령 확인을 기록했어요.", publicLink: "참여 화면 열기", delivery: "알림 전송", pending: "대기", sent: "전송 완료", failed: "실패", skipped: "제외", winnerList: "당첨자 목록", contact: "연락처", reveal: "연락처 보기", hide: "연락처 숨기기", noContact: "미등록", noWinners: "아직 당첨자가 없어요." },
  en: { title: "RUN&MUSIC draw management", description: "Review entries, results and prize collection.", participants: "Entrants", winners: "Winners", received: "Collected", refresh: "Refresh", settings: "Event settings", entryOpensAt: "Entries open", entryClosesAt: "Entries close", resultsAt: "Results announced", published: "Publish event", auto: "Automatically draw and publish at the deadline", autoHelp: "Entries close and results are due on October 24, 2026 at 23:59 KST. Every entrant has the same chance of winning.", save: "Save settings", saved: "Saved.", loading: "Loading…", error: "Could not complete this. Refresh the status and try again.", conflict: "Another administrator changed the settings. Refresh and review them again.", draw: "Retry results processing", dueHelp: "Use after the results are due if automatic processing has not completed. Existing draw results are preserved.", drawn: "Results published", receipt: "Collection receipt number", receive: "Mark collected", receivedMessage: "Collection has been recorded.", publicLink: "Open participation page", delivery: "Notifications", pending: "Pending", sent: "Sent", failed: "Failed", skipped: "Skipped", winnerList: "Winners", contact: "Contact", reveal: "Reveal contact", hide: "Hide contact", noContact: "Not saved", noWinners: "No winners yet." },
};

export function RunmusicManager({ locale }: { locale: AdminLocale }) {
  const session = useAdminSession(), auth = usePrivy();
  if (session.status !== "authorized") return <AdminAccessState status={session.status} locale={locale} />;
  return <Manager key={`${auth.user?.id}:${session.admin.role}`} locale={locale} role={session.admin.role} getAccessToken={auth.getAccessToken} />;
}
function Manager({ locale, role, getAccessToken }: { locale: AdminLocale; role: string; getAccessToken: () => Promise<string | null> }) {
  const t = copy[locale];
  const [state, setState] = useState<RunmusicAdminState | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0), [contacts, setContacts] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now()), [access, setAccess] = useState<"unauthenticated" | "denied" | null>(null);
  const mutationBusy = useRef(false), alive = useRef(false), controller = useRef<AbortController | null>(null), drawKey = useRef<string | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const request = new AbortController(); setError(""); setContacts({});
    void withRequestDeadline(async signal => {
      const token = await getAccessToken(); signal.throwIfAborted(); if (!token) throw new Error("AUTH_REQUIRED");
      const response = await fetch("/api/admin/runmusic", { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal });
      if (response.status === 401 || response.status === 403) { if (!signal.aborted) setAccess(response.status === 401 ? "unauthenticated" : "denied"); return; }
      if (!response.ok) throw new Error("FAILED"); return runmusicAdminStateSchema.parse(await response.json());
    }, { signal: request.signal }).then(result => { if (result && !request.signal.aborted) setState(result); }).catch(() => { if (!request.signal.aborted) setError(t.error); });
    return () => request.abort();
  }, [getAccessToken, revision, t.error]);
  async function mutate(path: string, method: string, payload: unknown) {
    if (mutationBusy.current || role === "viewer") return;
    mutationBusy.current = true; setBusy(true); setError(""); setNotice("");
    const request = new AbortController(); controller.current = request;
    try {
      const result = await withRequestDeadline(async signal => {
        const token = await getAccessToken(); signal.throwIfAborted(); if (!token) throw new Error("AUTH_REQUIRED");
        const response = await fetch(`/api/admin/runmusic${path}`, { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store", signal });
        if (response.status === 401 || response.status === 403) { if (!signal.aborted) setAccess(response.status === 401 ? "unauthenticated" : "denied"); throw new Error("AUTH_REQUIRED"); }
        const body = await response.json(); if (!response.ok) throw new Error(body?.error?.code ?? "FAILED"); return body;
      }, { signal: request.signal });
      if (!alive.current || request.signal.aborted) return;
      if (path === "/contact") {
        const revealed = z.object({ kakaoId: z.string() }).parse(result);
        setContacts(current => ({ ...current, [(payload as { appUserId: string }).appUserId]: revealed.kakaoId }));
      } else if (path === "/receive") {
        z.object({ receivedAt: z.string(), replayed: z.boolean() }).parse(result); setNotice(t.receivedMessage); setRevision(value => value + 1);
      } else { setState(runmusicAdminStateSchema.parse(result)); setNotice(t.saved); }
    } catch (problem) { if (alive.current && !request.signal.aborted) setError(problem instanceof Error && problem.message === "RUNMUSIC_CONFLICT" ? t.conflict : t.error); }
    finally { if (alive.current) { mutationBusy.current = false; setBusy(false); } }
  }
  if (access) return <AdminAccessState status={access} locale={locale} />;
  const readonly = busy || role === "viewer";
  const date = (value: string) => new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" }).format(new Date(value));
  return <AdminOperationsShell locale={locale} adminRole={role}><div className={styles.main}>
    <header className={styles.heading}><div><h1>{t.title}</h1><p>{t.description}</p></div><FanAction href={`/connect/runmusic?locale=${locale}`}>{t.publicLink}</FanAction><FanAction disabled={busy} onClick={() => { setRevision(value => value + 1); setNotice(""); }}>{t.refresh}</FanAction></header>
    {state ? <>
      <dl className={styles.totals}>{([[t.participants, state.participantCount], [t.winners, state.winnerCount], [t.received, state.receivedCount]] as const).map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl>
      <section className={styles.panel}><h2>{t.settings}</h2><p>{t.autoHelp}</p>
        <dl className={styles.schedule}>{(["entryOpensAt", "entryClosesAt", "resultsAt"] as const).map(key => <div key={key}><dt>{t[key]}</dt><dd>{date(state.campaign[key])} KST</dd></div>)}</dl>
        <ul className={styles.prizes}>{state.campaign.prizes.map(prize => <li key={prize.code}>{prize.label} · {prize.count}</li>)}</ul>
        <form key={state.revision} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void mutate("", "PATCH", { expectedRevision: state.revision, published: data.get("published") === "on", autoPublishEnabled: data.get("autoPublishEnabled") === "on" }); }}>
          <fieldset className={styles.checks} disabled={readonly}>
            <label><input type="checkbox" name="published" defaultChecked={state.campaign.published} />{t.published}</label>
            <label><input type="checkbox" name="autoPublishEnabled" defaultChecked={state.autoPublishEnabled} />{t.auto}</label>
          </fieldset>
          <FanAction type="submit" disabled={readonly}>{t.save}</FanAction>
        </form>
      </section>
      <section className={styles.panel}><h2>{state.campaign.resultsPublished ? t.drawn : t.draw}</h2><p>{t.dueHelp}</p>
        <FanAction disabled={readonly || now < Date.parse(state.campaign.resultsAt)} onClick={() => { drawKey.current ??= crypto.randomUUID(); void mutate("/draw", "POST", { requestKey: drawKey.current }); }}>{t.draw}</FanAction>
        <h3>{t.delivery}</h3><dl className={styles.delivery}>{(["pending", "sent", "failed", "skipped"] as const).map(key => <div key={key}><dt>{t[key]}</dt><dd>{state.delivery[key]}</dd></div>)}</dl>
      </section>
      <section className={styles.panel}><h2>{t.winnerList}</h2>{!state.winners.length ? <p>{t.noWinners}</p> : <ul className={styles.winners}>{state.winners.map(winner => <li key={winner.appUserId}>
        <div><h3>{state.campaign.prizes.find(prize => prize.code === winner.prizeCode)?.label}</h3><p className={styles.meta}>{winner.appUserId}</p></div>
        <div><span className={styles.meta}>{t.contact}</span><p>{contacts[winner.appUserId] ?? winner.contactMasked ?? t.noContact}</p>
          {winner.contactSaved ? <FanAction variant="text" disabled={readonly} onClick={() => {
            if (contacts[winner.appUserId]) setContacts(current => { const next = { ...current }; delete next[winner.appUserId]; return next; });
            else void mutate("/contact", "POST", { appUserId: winner.appUserId });
          }}>{contacts[winner.appUserId] ? t.hide : t.reveal}</FanAction> : null}
        </div>
        <div><span className={styles.meta}>{t.receipt}</span><p>{winner.receiptId}</p>{winner.receivedAt ? <p>{t.received} · {date(winner.receivedAt)} KST</p> : <FanAction disabled={readonly || !state.campaign.resultsPublished} onClick={() => void mutate("/receive", "POST", { receiptId: winner.receiptId })}>{t.receive}</FanAction>}</div>
      </li>)}</ul>}</section>
    </> : <p role="status">{t.loading}</p>}
    {notice ? <p role="status">{notice}</p> : null}{error ? <p role="alert" className={styles.error}>{error}</p> : null}
  </div></AdminOperationsShell>;
}
