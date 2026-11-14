"use client";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { Download, RefreshCw, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { createCsv, downloadCsv } from "@/features/analytics/ui/performance-table";
import {
  eventParticipantPageSize, eventParticipantsSchema,
  type EventParticipant, type EventParticipantCursor, type EventParticipantEvent, type EventParticipantsPage,
} from "@/features/admin/event-participants";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { AdminAccessState } from "./admin-access-state";
import { AdminOperationsShell, type AdminLocale } from "./operations-shell";
import { useAdminSession } from "./use-admin-session";
import shared from "./operations.module.css";
import styles from "./event-participants-manager.module.css";

const PAGE_SIZE = 50;
const copy = {
  ko: {
    title: "이벤트 참여자", total: "참여자", unit: "명", refresh: "새로고침", exportCsv: "CSV 내려받기", exporting: "내려받는 중…", more: "더 보기",
    events: { "x-mission": "X 이벤트", "signup-raffle": "래플 이벤트" },
    heading: { "x-mission": "X 미션 이벤트 참여자", "signup-raffle": "신규 가입 래플 응모자" },
    order: { "x-mission": "좋아요 완료 최신순", "signup-raffle": "응모 최신순" },
    nickname: "닉네임", signedUpAt: "가입일", participatedAt: { "x-mission": "참여 시각", "signup-raffle": "응모 시각" }, status: "상태",
    state: { completed: "완료", entered: "응모" },
    noNickname: "닉네임 없음",
    loading: "참여자 목록을 가져오고 있어요.", error: "참여자 목록을 불러오지 못했습니다.", retry: "다시 시도",
    empty: "아직 참여자가 없습니다.", exportError: "CSV를 내려받지 못했습니다.",
  },
  en: {
    title: "Event participants", total: "Participants", unit: "", refresh: "Refresh", exportCsv: "Download CSV", exporting: "Downloading…", more: "Show more",
    events: { "x-mission": "X event", "signup-raffle": "Raffle event" },
    heading: { "x-mission": "X mission participants", "signup-raffle": "Signup raffle entrants" },
    order: { "x-mission": "Newest completion first", "signup-raffle": "Newest entry first" },
    nickname: "Nickname", signedUpAt: "Joined", participatedAt: { "x-mission": "Participated", "signup-raffle": "Entered" }, status: "Status",
    state: { completed: "Completed", entered: "Entered" },
    noNickname: "No nickname",
    loading: "Loading participants.", error: "Participants could not be loaded.", retry: "Try again",
    empty: "No participants yet.", exportError: "The CSV could not be downloaded.",
  },
} as const;

type Snapshot = { asOf: string; total: number; rows: EventParticipant[]; next: EventParticipantCursor | null };
type ListState = { status: "ready"; snapshot: Snapshot } | { status: "loading" | "error" | "unauthenticated" | "denied" };

class AccessError extends Error { constructor(readonly kind: "unauthenticated" | "denied") { super(kind); } }

async function fetchPage(getAccessToken: () => Promise<string | null>, event: EventParticipantEvent, limit: number, from?: { asOf: string; next: EventParticipantCursor }, signal?: AbortSignal): Promise<EventParticipantsPage> {
  const token = await getAccessToken();
  if (!token) throw new AccessError("unauthenticated");
  const query = new URLSearchParams({ event, limit: String(limit) });
  if (from) { query.set("asOf", from.asOf); query.set("afterAt", from.next.at); query.set("afterId", from.next.id); }
  const response = await fetch(`/api/admin/event-participants?${query}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal });
  if (response.status === 401 || response.status === 403) throw new AccessError(response.status === 401 ? "unauthenticated" : "denied");
  if (!response.ok) throw new Error("EVENT_PARTICIPANTS_UNAVAILABLE");
  return eventParticipantsSchema.parse(await response.json());
}

// Reads the rest of one snapshot: every page carries the first page's instant, so the rows never shift while reading.
async function readAll(getAccessToken: () => Promise<string | null>, event: EventParticipantEvent, first: Snapshot): Promise<EventParticipant[]> {
  const rows = [...first.rows];
  for (let next = first.next; next;) {
    const chunk = await fetchPage(getAccessToken, event, eventParticipantPageSize, { asOf: first.asOf, next });
    rows.push(...chunk.rows);
    next = chunk.next;
  }
  return rows;
}

export function EventParticipantsManager({ locale }: { locale: AdminLocale }) {
  const session = useAdminSession();
  const { user, getAccessToken } = usePrivy();
  if (session.status !== "authorized") return <AdminAccessState status={session.status} locale={locale} />;
  return <Participants key={`${user?.id}:${session.admin.email}:${session.admin.role}`} locale={locale} adminRole={session.admin.role} getAccessToken={getAccessToken} />;
}

function Participants({ locale, adminRole, getAccessToken }: { locale: AdminLocale; adminRole: string; getAccessToken: () => Promise<string | null> }) {
  const t = copy[locale];
  const [event, setEvent] = useState<EventParticipantEvent>("x-mission");
  const [loadingMore, setLoadingMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const date = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" });
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
  const stamp = (value: string) => `${date.format(new Date(value))} ${time.format(new Date(value))}`;

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void (async () => {
      try {
        const { asOf, total, rows, next } = await fetchPage(getAccessToken, event, PAGE_SIZE, undefined, controller.signal);
        if (!controller.signal.aborted) setState({ status: "ready", snapshot: { asOf, total, rows, next } });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ status: error instanceof AccessError ? error.kind : "error" });
      }
    })();
    return () => controller.abort();
  }, [getAccessToken, event, revision]);

  if (state.status === "unauthenticated" || state.status === "denied") return <AdminAccessState status={state.status} locale={locale} />;
  const snapshot = state.status === "ready" ? state.snapshot : null;

  async function showMore() {
    if (!snapshot?.next) return;
    setLoadingMore(true); setExportFailed(false);
    try {
      const chunk = await fetchPage(getAccessToken, event, PAGE_SIZE, { asOf: snapshot.asOf, next: snapshot.next });
      setState({ status: "ready", snapshot: { ...snapshot, rows: [...snapshot.rows, ...chunk.rows], next: chunk.next } });
    } catch (error) { setState({ status: error instanceof AccessError ? error.kind : "error" }); }
    finally { setLoadingMore(false); }
  }
  async function exportCsv() {
    if (!snapshot) return;
    setExporting(true); setExportFailed(false);
    try {
      const rows = await readAll(getAccessToken, event, snapshot);
      if (rows.length !== snapshot.total) throw new Error("EVENT_PARTICIPANTS_COUNT_MISMATCH");
      downloadCsv(`event-participants-${event}.csv`, createCsv<EventParticipant>([
        { key: "nickname", label: t.nickname, value: item => item.nickname },
        { key: "signedUpAt", label: t.signedUpAt, value: item => stamp(item.signedUpAt) },
        { key: "participatedAt", label: t.participatedAt[event], value: item => stamp(item.participatedAt) },
        { key: "status", label: t.status, value: item => t.state[item.status] },
      ], rows));
    } catch (error) {
      if (error instanceof AccessError) setState({ status: error.kind }); else setExportFailed(true);
    } finally { setExporting(false); }
  }
  const choose = (next: EventParticipantEvent) => { setEvent(next); setExportFailed(false); };

  return <AdminOperationsShell locale={locale} adminRole={adminRole}>
    <header className={styles.heading}>
      <FanHeading as="h1">{t.title}</FanHeading>
      <div className={styles.total} aria-live="polite"><span>{t.total}</span><strong>{snapshot ? snapshot.total.toLocaleString(locale) : "—"}<small>{t.unit}</small></strong></div>
    </header>
    <FanTabs className={styles.tabs} variant="segment" label={t.title} current={event}
      items={(["x-mission", "signup-raffle"] as const).map(key => ({ key, label: t.events[key], onSelect: () => choose(key) }))} />
    <section className={styles.panel} aria-labelledby="event-participants-heading">
      <div className={styles.panelHeading}>
        <div><FanHeading id="event-participants-heading">{t.heading[event]}</FanHeading><span className={styles.order}>{t.order[event]}</span></div>
        <div className={styles.actions}>
          <FanAction type="button" leadingIcon={<Download />} onClick={() => void exportCsv()} disabled={!snapshot || snapshot.total === 0 || exporting || loadingMore}>{exporting ? t.exporting : t.exportCsv}</FanAction>
          <FanAction type="button" leadingIcon={<RefreshCw />} onClick={() => setRevision(value => value + 1)} disabled={state.status === "loading"}>{t.refresh}</FanAction>
        </div>
      </div>
      {exportFailed && <p className={styles.message} role="alert">{t.exportError}</p>}
      {state.status === "loading" ? <div className={styles.skeleton} aria-busy="true"><span className={shared.srOnly} role="status">{t.loading}</span>{[0, 1, 2, 3, 4].map(index => <FanSkeleton key={index} height={24} />)}</div>
        : state.status === "error" ? <div className={shared.stateMessage} role="alert"><p>{t.error}</p><FanAction type="button" onClick={() => setRevision(value => value + 1)}>{t.retry}</FanAction></div>
          : !snapshot || snapshot.rows.length === 0 ? <div className={shared.stateMessage} role="status"><UsersRound aria-hidden="true" /><p>{t.empty}</p></div>
            : <>
              <div className={styles.tableScroll} role="region" aria-label={t.heading[event]} tabIndex={0}>
                <table className={styles.table}>
                  <caption className={shared.srOnly}>{t.heading[event]} · {t.order[event]}</caption>
                  <thead><tr><th scope="col">{t.nickname}</th><th scope="col">{t.signedUpAt}</th><th scope="col">{t.participatedAt[event]}</th><th scope="col">{t.status}</th></tr></thead>
                  <tbody>{snapshot.rows.map(item => <tr key={item.id}>
                    <th scope="row">{item.nickname || <span className={styles.secondary}>{t.noNickname}</span>}</th>
                    <td data-label={t.signedUpAt}><time dateTime={item.signedUpAt}>{stamp(item.signedUpAt)}</time></td>
                    <td data-label={t.participatedAt[event]}><time dateTime={item.participatedAt}>{stamp(item.participatedAt)}</time></td>
                    <td className={styles.statusCell}><span className={styles.status}>{t.state[item.status]}</span></td>
                  </tr>)}</tbody>
                </table>
              </div>
              {snapshot.next && <div className={styles.more}><FanAction type="button" onClick={() => void showMore()} disabled={loadingMore || exporting} loading={loadingMore}>{t.more}</FanAction></div>}
            </>}
    </section>
  </AdminOperationsShell>;
}
