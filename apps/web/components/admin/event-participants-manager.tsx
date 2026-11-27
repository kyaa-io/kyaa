"use client";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { Download, RefreshCw, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { createCsv, downloadCsv } from "@/features/analytics/ui/performance-table";
import {
  eventParticipantPageSize, eventParticipantPresets, eventParticipantsSchema,
  type EventParticipant, type EventParticipantCursor, type EventSourceTotal, type EventParticipantPresetKey, type EventParticipantQuery, type EventParticipantsPage,
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
type Selection = "x-mission" | "signup-raffle" | EventParticipantPresetKey;
type Kind = EventParticipantQuery["event"];
const selections: readonly Selection[] = ["x-mission", "signup-raffle", ...eventParticipantPresets.map(preset => preset.key)];
const presetOf = (key: Selection) => eventParticipantPresets.find(preset => preset.key === key);
const queryOf = (key: Selection): EventParticipantQuery => {
  const preset = presetOf(key);
  return preset ? { event: preset.event, slug: preset.slug, from: preset.from, to: preset.to, campaign: preset.key } : { event: key as "x-mission" | "signup-raffle" };
};
const copy = {
  ko: {
    title: "이벤트 참여자", total: "참여자", unit: "명", refresh: "새로고침", exportCsv: "CSV 내려받기", exporting: "내려받는 중…", more: "더 보기",
    events: {
      "x-mission": "X 이벤트", "signup-raffle": "래플 이벤트", "x-opening-1116": "Opening 11/16", "elina-onboarding-1117": "엘리나 11/17",
      "changha-onboarding-1118": "창하 11/18", "yuna-onboarding-1119": "유나 11/19", "elina-passport-1120": "엘리나 패스포트 11/20~21", "changha-photo-1122": "창하 미공개사진 11/22~23",
    },
    heading: {
      "x-mission": "X 미션 이벤트 참여자", "signup-raffle": "신규 가입 래플 응모자", "x-opening-1116": "X Opening 이벤트 참여자", "elina-onboarding-1117": "엘리나 팬페이지 좋아요 참여자",
      "changha-onboarding-1118": "창하 팬페이지 좋아요 참여자", "yuna-onboarding-1119": "유나 팬페이지 좋아요 참여자", "elina-passport-1120": "엘리나 패스포트 발급자", "changha-photo-1122": "창하 미공개사진 이벤트 참여자",
    },
    order: { "x-mission": "좋아요 완료 최신순", "signup-raffle": "응모 최신순", "page-like": "좋아요 최신순", "passport-issued": "발급 최신순" },
    nickname: "닉네임", signedUpAt: "가입일", sourceHeading: "가입 경로", sourceColumn: "경로", noSource: "표시 없음", sources: { telegram: "텔레그램", x: "X", kol: "KoL" } as Record<string, string>, participatedAt: { "x-mission": "참여 시각", "signup-raffle": "응모 시각", "page-like": "좋아요 시각", "passport-issued": "발급 시각" }, status: "상태",
    state: { completed: "완료", entered: "응모", issued: "발급" },
    noNickname: "닉네임 없음",
    loading: "참여자 목록을 가져오고 있어요.", error: "참여자 목록을 불러오지 못했습니다.", retry: "다시 시도",
    empty: "아직 참여자가 없습니다.", exportError: "CSV를 내려받지 못했습니다.",
  },
  en: {
    title: "Event participants", total: "Participants", unit: "", refresh: "Refresh", exportCsv: "Download CSV", exporting: "Downloading…", more: "Show more",
    events: {
      "x-mission": "X event", "signup-raffle": "Raffle event", "x-opening-1116": "Opening 11/16", "elina-onboarding-1117": "Elina 11/17",
      "changha-onboarding-1118": "Changha 11/18", "yuna-onboarding-1119": "Yuna 11/19", "elina-passport-1120": "Elina Passport 11/20–21", "changha-photo-1122": "Changha photo 11/22–23",
    },
    heading: {
      "x-mission": "X mission participants", "signup-raffle": "Signup raffle entrants", "x-opening-1116": "X Opening participants", "elina-onboarding-1117": "Elina fan page likes",
      "changha-onboarding-1118": "Changha fan page likes", "yuna-onboarding-1119": "Yuna fan page likes", "elina-passport-1120": "Elina Passport holders", "changha-photo-1122": "Changha photo event participants",
    },
    order: { "x-mission": "Newest completion first", "signup-raffle": "Newest entry first", "page-like": "Newest like first", "passport-issued": "Newest issue first" },
    nickname: "Nickname", signedUpAt: "Joined", sourceHeading: "Inbound sources", sourceColumn: "Source", noSource: "No tag", sources: { telegram: "Telegram", x: "X", kol: "KoL" } as Record<string, string>, participatedAt: { "x-mission": "Participated", "signup-raffle": "Entered", "page-like": "Liked", "passport-issued": "Issued" }, status: "Status",
    state: { completed: "Completed", entered: "Entered", issued: "Issued" },
    noNickname: "No nickname",
    loading: "Loading participants.", error: "Participants could not be loaded.", retry: "Try again",
    empty: "No participants yet.", exportError: "The CSV could not be downloaded.",
  },
} as const;

type Snapshot = { asOf: string; total: number; rows: EventParticipant[]; next: EventParticipantCursor | null; sourceTotals?: EventSourceTotal[] };
type ListState = { status: "ready"; snapshot: Snapshot } | { status: "loading" | "error" | "unauthenticated" | "denied" };

class AccessError extends Error { constructor(readonly kind: "unauthenticated" | "denied") { super(kind); } }

async function fetchPage(getAccessToken: () => Promise<string | null>, target: EventParticipantQuery, limit: number, from?: { asOf: string; next: EventParticipantCursor }, signal?: AbortSignal): Promise<EventParticipantsPage> {
  const token = await getAccessToken();
  if (!token) throw new AccessError("unauthenticated");
  const query = new URLSearchParams({ event: target.event, limit: String(limit) });
  if ("slug" in target) { query.set("slug", target.slug); query.set("from", target.from); query.set("to", target.to); if (target.campaign) query.set("campaign", target.campaign); }
  if (from) { query.set("asOf", from.asOf); query.set("afterAt", from.next.at); query.set("afterId", from.next.id); }
  const response = await fetch(`/api/admin/event-participants?${query}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal });
  if (response.status === 401 || response.status === 403) throw new AccessError(response.status === 401 ? "unauthenticated" : "denied");
  if (!response.ok) throw new Error("EVENT_PARTICIPANTS_UNAVAILABLE");
  return eventParticipantsSchema.parse(await response.json());
}

// Reads the rest of one snapshot: every page carries the first page's instant, so the rows never shift while reading.
async function readAll(getAccessToken: () => Promise<string | null>, target: EventParticipantQuery, first: Snapshot): Promise<EventParticipant[]> {
  const rows = [...first.rows];
  for (let next = first.next; next;) {
    const chunk = await fetchPage(getAccessToken, target, eventParticipantPageSize, { asOf: first.asOf, next });
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
  const [selection, setSelection] = useState<Selection>("x-mission");
  const [loadingMore, setLoadingMore] = useState(false);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const date = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" });
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });
  const stamp = (value: string) => `${date.format(new Date(value))} ${time.format(new Date(value))}`;
  const target = queryOf(selection);
  const kind: Kind = target.event;
  const preset = presetOf(selection);
  // The last minute of the window: `to` is exclusive, so 11/17 00:00 reads as 11/16 23:59.
  const period = preset ? `${stamp(preset.from)} ~ ${stamp(new Date(Date.parse(preset.to) - 60_000).toISOString())} · ` : "";

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void (async () => {
      try {
        const { asOf, total, rows, next, sourceTotals } = await fetchPage(getAccessToken, queryOf(selection), PAGE_SIZE, undefined, controller.signal);
        if (!controller.signal.aborted) setState({ status: "ready", snapshot: { asOf, total, rows, next, sourceTotals } });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({ status: error instanceof AccessError ? error.kind : "error" });
      }
    })();
    return () => controller.abort();
  }, [getAccessToken, selection, revision]);

  if (state.status === "unauthenticated" || state.status === "denied") return <AdminAccessState status={state.status} locale={locale} />;
  const snapshot = state.status === "ready" ? state.snapshot : null;

  async function showMore() {
    if (!snapshot?.next) return;
    setLoadingMore(true); setExportFailed(false);
    try {
      const chunk = await fetchPage(getAccessToken, target, PAGE_SIZE, { asOf: snapshot.asOf, next: snapshot.next });
      setState({ status: "ready", snapshot: { ...snapshot, rows: [...snapshot.rows, ...chunk.rows], next: chunk.next } });
    } catch (error) { setState({ status: error instanceof AccessError ? error.kind : "error" }); }
    finally { setLoadingMore(false); }
  }
  async function exportCsv() {
    if (!snapshot) return;
    setExporting(true); setExportFailed(false);
    try {
      const rows = await readAll(getAccessToken, target, snapshot);
      if (rows.length !== snapshot.total) throw new Error("EVENT_PARTICIPANTS_COUNT_MISMATCH");
      downloadCsv(`event-participants-${selection}.csv`, createCsv<EventParticipant>([
        { key: "nickname", label: t.nickname, value: item => item.nickname },
        { key: "signedUpAt", label: t.signedUpAt, value: item => stamp(item.signedUpAt) },
        { key: "participatedAt", label: t.participatedAt[kind], value: item => stamp(item.participatedAt) },
        { key: "status", label: t.status, value: item => t.state[item.status] },
        ...(snapshot.sourceTotals ? [{ key: "source" as const, label: t.sourceColumn, value: (item: EventParticipant) => sourceLabel(item.sourceTag) }] : []),
      ], rows));
    } catch (error) {
      if (error instanceof AccessError) setState({ status: error.kind }); else setExportFailed(true);
    } finally { setExporting(false); }
  }
  const sourceLabel = (tag: EventParticipant["sourceTag"]) => tag ? `${t.sources[tag.source] ?? tag.source} · ${tag.content}` : t.noSource;
  const untagged = snapshot?.sourceTotals ? snapshot.total - snapshot.sourceTotals.reduce((sum, item) => sum + item.count, 0) : 0;
  const choose = (next: Selection) => { setSelection(next); setExportFailed(false); };

  return <AdminOperationsShell locale={locale} adminRole={adminRole}>
    <header className={styles.heading}>
      <FanHeading as="h1">{t.title}</FanHeading>
      <div className={styles.total} aria-live="polite"><span>{t.total}</span><strong>{snapshot ? snapshot.total.toLocaleString(locale) : "—"}<small>{t.unit}</small></strong></div>
    </header>
    <FanTabs className={styles.tabs} variant="chip" label={t.title} current={selection}
      items={selections.map(key => ({ key, label: t.events[key], onSelect: () => choose(key) }))} />
    <section className={styles.panel} aria-labelledby="event-participants-heading">
      <div className={styles.panelHeading}>
        <div><FanHeading id="event-participants-heading">{t.heading[selection]}</FanHeading><span className={styles.order}>{`${period}${t.order[kind]}`}</span></div>
        <div className={styles.actions}>
          <FanAction type="button" leadingIcon={<Download />} onClick={() => void exportCsv()} disabled={!snapshot || snapshot.total === 0 || exporting || loadingMore}>{exporting ? t.exporting : t.exportCsv}</FanAction>
          <FanAction type="button" leadingIcon={<RefreshCw />} onClick={() => setRevision(value => value + 1)} disabled={state.status === "loading"}>{t.refresh}</FanAction>
        </div>
      </div>
      {snapshot?.sourceTotals && snapshot.total > 0 && <section className={styles.sources} aria-label={t.sourceHeading}>
        <span>{t.sourceHeading}</span>
        <ul>
          {snapshot.sourceTotals.map(item => <li key={`${item.source}:${item.content}`}><span>{`${t.sources[item.source] ?? item.source} · ${item.content}`}</span><strong>{item.count.toLocaleString(locale)}{t.unit}</strong></li>)}
          <li><span>{t.noSource}</span><strong>{untagged.toLocaleString(locale)}{t.unit}</strong></li>
        </ul>
      </section>}
      {exportFailed && <p className={styles.message} role="alert">{t.exportError}</p>}
      {state.status === "loading" ? <div className={styles.skeleton} aria-busy="true"><span className={shared.srOnly} role="status">{t.loading}</span>{[0, 1, 2, 3, 4].map(index => <FanSkeleton key={index} height={24} />)}</div>
        : state.status === "error" ? <div className={shared.stateMessage} role="alert"><p>{t.error}</p><FanAction type="button" onClick={() => setRevision(value => value + 1)}>{t.retry}</FanAction></div>
          : !snapshot || snapshot.rows.length === 0 ? <div className={shared.stateMessage} role="status"><UsersRound aria-hidden="true" /><p>{t.empty}</p></div>
            : <>
              <div className={styles.tableScroll} role="region" aria-label={t.heading[selection]} tabIndex={0}>
                <table className={styles.table}>
                  <caption className={shared.srOnly}>{t.heading[selection]} · {`${period}${t.order[kind]}`}</caption>
                  <thead><tr><th scope="col">{t.nickname}</th><th scope="col">{t.signedUpAt}</th><th scope="col">{t.participatedAt[kind]}</th><th scope="col">{t.status}</th>{snapshot.sourceTotals && <th scope="col">{t.sourceColumn}</th>}</tr></thead>
                  <tbody>{snapshot.rows.map(item => <tr key={item.id}>
                    <th scope="row">{item.nickname || <span className={styles.secondary}>{t.noNickname}</span>}</th>
                    <td data-label={t.signedUpAt}><time dateTime={item.signedUpAt}>{stamp(item.signedUpAt)}</time></td>
                    <td data-label={t.participatedAt[kind]}><time dateTime={item.participatedAt}>{stamp(item.participatedAt)}</time></td>
                    <td className={styles.statusCell}><span className={styles.status}>{t.state[item.status]}</span></td>
                    {snapshot.sourceTotals && <td data-label={t.sourceColumn} className={styles.sourceCell}>{item.sourceTag ? sourceLabel(item.sourceTag) : <span className={styles.secondary}>{t.noSource}</span>}</td>}
                  </tr>)}</tbody>
                </table>
              </div>
              {snapshot.next && <div className={styles.more}><FanAction type="button" onClick={() => void showMore()} disabled={loadingMore || exporting} loading={loadingMore}>{t.more}</FanAction></div>}
            </>}
    </section>
  </AdminOperationsShell>;
}
