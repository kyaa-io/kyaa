"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Download, RefreshCw, UsersRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createCsv, downloadCsv } from "@/features/analytics/ui/performance-table";
import { participationAdminPageSchema } from "@/features/connect/kyaa-wave-participation";
import { rsvpAttendeesSchema, type RsvpAttendee } from "@/features/connect/rsvp-admin";
import { AdminAccessState } from "./admin-access-state";
import { AdminListSearch, AdminPagination, useAdminPagination } from "./admin-pagination";
import { AdminOperationsShell, type AdminLocale } from "./operations-shell";
import { useAdminSession } from "./use-admin-session";
import shared from "./operations.module.css";
import styles from "./byus-day-rsvp-manager.module.css";

const copy = {
  ko: {
    title: "kyaa wave 참가 신청", description: "kyaa wave 참가 신청 명단을 확인하세요.", total: "누적 접수", unit: "명",
    attendees: "참가자 명단", order: "최신 접수순", refresh: "새로고침", searchHelp: "이름, 소속, 직책, 이메일, 전화번호로 검색할 수 있어요.",
    name: "접수자", affiliation: "소속", occupation: "직책", contact: "연락처", nationality: "국적", date: "접수일 (KST)",
    loading: "접수 명단을 불러오는 중입니다.", error: "접수 명단을 불러오지 못했습니다.", retry: "다시 시도",
    empty: "아직 접수된 참가자가 없습니다.", noResults: "검색 결과가 없습니다.", clear: "검색 초기화",
    scroll: "표를 좌우로 움직여 전체 정보를 확인하세요.",
    exportCsv: "전체 명단 CSV", koreanName: "한글 이름", englishName: "영문 이름", phone: "전화번호", email: "이메일",
  },
  en: {
    title: "kyaa wave registrations", description: "View the people registered for kyaa wave.", total: "Total registrations", unit: "",
    attendees: "Attendee list", order: "Newest first", refresh: "Refresh", searchHelp: "Search by name, organization, role, email or phone number.",
    name: "Attendee", affiliation: "Organization", occupation: "Role", contact: "Contact", nationality: "Nationality", date: "Registered (KST)",
    loading: "Loading registrations.", error: "Registrations could not be loaded.", retry: "Try again",
    empty: "No one has registered yet.", noResults: "No registrations match your search.", clear: "Clear search",
    scroll: "Scroll horizontally to see all attendee details.",
    exportCsv: "Export all to CSV", koreanName: "Korean name", englishName: "English name", phone: "Phone", email: "Email",
  },
} as const;

type ListState = { status: "ready"; attendees: RsvpAttendee[] }
  | { status: "loading" | "error" | "unauthenticated" | "denied" };

export function ByusDayRsvpManager({ locale }: { locale: AdminLocale }) {
  const session = useAdminSession();
  const { user, getAccessToken } = usePrivy();
  if (session.status !== "authorized") return <AdminAccessState status={session.status} locale={locale} />;
  return <Attendees key={`${user?.id}:${session.admin.email}:${session.admin.role}`} locale={locale}
    adminRole={session.admin.role} getAccessToken={getAccessToken} />;
}

function Attendees({ locale, adminRole, getAccessToken }: {
  locale: AdminLocale; adminRole: string; getAccessToken: () => Promise<string | null>;
}) {
  const t = copy[locale];
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [revision, setRevision] = useState(0);
  const [query, setQuery] = useState("");
  // ponytail: one event roster; move search and pagination into the RPC if registrations reach thousands.
  const attendees = state.status === "ready" ? state.attendees : [];
  const needle = query.trim().toLocaleLowerCase(locale);
  const filtered = attendees.filter(item => [item.koreanName, item.englishName, item.affiliation, item.occupation, item.email, item.phone]
    .some(value => value.toLocaleLowerCase(locale).includes(needle)));
  const pagination = useAdminPagination(filtered, needle);
  const regions = new Intl.DisplayNames([locale], { type: "region" });
  const date = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" });
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    void (async () => {
      try {
        const token = await getAccessToken();
        if (controller.signal.aborted) return;
        if (!token) { setState({ status: "unauthenticated" }); return; }
        const response = await fetch("/api/admin/byus-day-rsvps", {
          headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          setState({ status: response.status === 401 ? "unauthenticated" : "denied" }); return;
        }
        if (!response.ok) throw new Error("RSVP_ADMIN_UNAVAILABLE");
        const result = rsvpAttendeesSchema.parse(await response.json());
        if (!controller.signal.aborted) setState({ status: "ready", attendees: result.attendees });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    })();
    return () => controller.abort();
  }, [getAccessToken, revision]);

  if (state.status === "unauthenticated" || state.status === "denied") return <AdminAccessState status={state.status} locale={locale} />;
  const refresh = () => setRevision(value => value + 1);
  const exportCsv = () => downloadCsv("byus-day-rsvps.csv", createCsv<RsvpAttendee>([
    { key: "koreanName", label: t.koreanName, value: item => item.koreanName },
    { key: "englishName", label: t.englishName, value: item => item.englishName },
    { key: "affiliation", label: t.affiliation, value: item => item.affiliation },
    { key: "occupation", label: t.occupation, value: item => item.occupation },
    { key: "phone", label: t.phone, value: item => item.phone },
    { key: "email", label: t.email, value: item => item.email },
    { key: "nationality", label: t.nationality, value: item => regions.of(item.nationality) ?? item.nationality },
    { key: "createdAt", label: t.date, value: item => `${date.format(new Date(item.createdAt))} ${time.format(new Date(item.createdAt))}` },
  ], attendees));
  return <AdminOperationsShell locale={locale} adminRole={adminRole}>
    <header className={styles.heading}>
      <div><h1>{t.title}</h1><p>{t.description}</p></div>
      <div className={styles.total} aria-live="polite"><span>{t.total}</span><strong>{state.status === "ready" ? attendees.length.toLocaleString(locale) : "—"}<small>{t.unit}</small></strong></div>
    </header>
    <section className={styles.panel} aria-labelledby="rsvp-attendees-heading">
      <div className={styles.panelHeading}>
        <div><h2 id="rsvp-attendees-heading">{t.attendees}</h2><span>{t.order}</span></div>
        <div className={styles.actions}>
          <button className={`${shared.secondaryButton} ${styles.refresh}`} type="button" onClick={exportCsv} disabled={state.status !== "ready" || attendees.length === 0}>
            <Download aria-hidden="true" />{t.exportCsv}
          </button>
          <button className={`${shared.secondaryButton} ${styles.refresh}`} type="button" onClick={refresh} disabled={state.status === "loading"}>
            <RefreshCw aria-hidden="true" />{t.refresh}
          </button>
        </div>
      </div>
      <div className={styles.search}>
        <AdminListSearch value={query} onChange={setQuery} locale={locale} disabled={state.status !== "ready"} />
        <p>{t.searchHelp}</p>
      </div>
      {state.status === "loading" ? <p className={styles.message} role="status">{t.loading}</p>
        : state.status === "error" ? <div className={shared.stateMessage} role="alert"><p>{t.error}</p><button type="button" onClick={refresh}>{t.retry}</button></div>
          : filtered.length === 0 ? <div className={shared.stateMessage} role="status"><UsersRound aria-hidden="true" /><h3>{attendees.length ? t.noResults : t.empty}</h3>{attendees.length > 0 && <button type="button" onClick={() => setQuery("")}>{t.clear}</button>}</div>
            : <>
              <p id="rsvp-scroll-help" className={styles.scrollHelp}>{t.scroll}</p>
              <div className={styles.tableScroll} role="region" aria-label={t.attendees} aria-describedby="rsvp-scroll-help" tabIndex={0}>
                <table className={styles.table}>
                  <caption className={shared.srOnly}>{t.attendees} · {t.order}</caption>
                  <thead><tr>{[t.name, t.affiliation, t.occupation, t.contact, t.nationality, t.date].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
                  <tbody>{pagination.items.map(item => <tr key={item.id}>
                    <th scope="row"><strong>{item.koreanName}</strong><span lang="en">{item.englishName}</span></th>
                    <td>{item.affiliation}</td><td>{item.occupation}</td>
                    <td><span>{item.phone}</span><span className={styles.secondary}>{item.email}</span></td>
                    <td>{regions.of(item.nationality) ?? item.nationality}</td>
                    <td><time dateTime={item.createdAt}><span>{date.format(new Date(item.createdAt))}</span><span className={styles.secondary}>{time.format(new Date(item.createdAt))}</span></time></td>
                  </tr>)}</tbody>
                </table>
              </div>
              <AdminPagination {...pagination} locale={locale} />
            </>}
    </section>
    <ParticipationList locale={locale} adminRole={adminRole} getAccessToken={getAccessToken} />
  </AdminOperationsShell>;
}


function ParticipationList({ locale, adminRole, getAccessToken }: { locale: AdminLocale; adminRole: string; getAccessToken: () => Promise<string | null> }) {
  const t = copy[locale];
  const labels = locale === "ko" ? { title: "참여 확인", description: "프로그램북 QR 또는 참여 코드로 확인을 마친 명단이에요. 참가 신청 명단과 별도로 관리해요. 퀴즈 정답자는 성함 옆에서 도장을 지급해 주세요.", empty: "아직 참여 확인을 마친 분이 없어요.", loading: "참여 확인 명단을 불러오고 있어요.", error: "참여 확인 명단을 불러오지 못했어요.", next: "다음 참여 명단", first: "처음부터 보기", name: "성함", date: "확인 일시 (KST)" }
    : { title: "Participation confirmations", description: "People who completed confirmation through the program QR or participation code. This list is separate from RSVPs. Grant a stamp next to each person who answered the quiz correctly.", empty: "No participation confirmations yet.", loading: "Loading participation confirmations.", error: "Participation confirmations could not be loaded.", next: "Next confirmations", first: "Back to first page", name: "Name", date: "Confirmed at (KST)" };
  const [page, setPage] = useState<ReturnType<typeof participationAdminPageSchema.parse> | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unauthenticated" | "denied">("loading");
  const [cursor, setCursor] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading"); setPage(null);
    void (async () => {
      try {
        const token = await getAccessToken();
        if (controller.signal.aborted) return;
        if (!token) { setStatus("unauthenticated"); return; }
        const query = cursor ? `?${new URLSearchParams({ cursor })}` : "";
        const response = await fetch(`/api/admin/kyaa-wave-participants${query}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) { setStatus(response.status === 401 ? "unauthenticated" : "denied"); return; }
        if (!response.ok) throw new Error("PARTICIPATION_UNAVAILABLE");
        const result = participationAdminPageSchema.parse(await response.json());
        if (!controller.signal.aborted) { setPage(result); setStatus("ready"); }
      } catch { if (!controller.signal.aborted) setStatus("error"); }
    })();
    return () => controller.abort();
  }, [getAccessToken, cursor, revision]);
  return <section className={`${styles.panel} ${styles.participationPanel}`} aria-labelledby="participation-list-heading">
    <div className={styles.panelHeading}><div><h2 id="participation-list-heading">{labels.title}</h2><p>{labels.description}</p></div>
      <button className={shared.secondaryButton} type="button" disabled={status === "loading"} onClick={() => { setCursor(null); setRevision(value => value + 1); }}>{locale === "ko" ? "참여 명단 새로고침" : "Refresh confirmations"}</button></div>
    {status === "unauthenticated" || status === "denied" ? <AdminAccessState status={status} locale={locale} />
      : status === "loading" ? <p role="status">{labels.loading}</p>
        : status === "error" ? <div role="alert"><p>{labels.error}</p><button className={shared.secondaryButton} type="button" onClick={() => setRevision(value => value + 1)}>{t.retry}</button></div>
          : page?.participants.length ? <>
            <div className={styles.tableScroll} role="region" aria-label={labels.title} tabIndex={0}><table className={`${styles.table} ${styles.participationTable}`}>
              <caption className={shared.srOnly}>{labels.title}</caption><thead><tr><th scope="col">{labels.name}</th><th scope="col">{labels.date}</th><th scope="col">{locale === "ko" ? "퀴즈 정답 도장" : "Correct-answer stamp"}</th></tr></thead>
              <tbody>{page.participants.map(item => <tr key={item.id}><th scope="row">{item.name}</th><td><time dateTime={item.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(item.createdAt))}</time></td><td><QuizStampControl key={`${item.id}:${item.quizCorrectAt}`} participant={item} locale={locale} canWrite={adminRole === "admin" || adminRole === "operator"} getAccessToken={getAccessToken} /></td></tr>)}</tbody>
            </table></div>
            <nav className={styles.actions} aria-label={labels.title}>{cursor && <button className={shared.secondaryButton} type="button" onClick={() => setCursor(null)}>{labels.first}</button>}{page.nextCursor && <button className={shared.secondaryButton} type="button" onClick={() => setCursor(page.nextCursor)}>{labels.next}</button>}</nav>
          </> : <p role="status">{labels.empty}</p>}
  </section>;
}

function QuizStampControl({ participant, locale, canWrite, getAccessToken }: {
  participant: { id: string; name: string; quizCorrectAt: string | null }; locale: AdminLocale;
  canWrite: boolean; getAccessToken: () => Promise<string | null>;
}) {
  const [grantedAt, setGrantedAt] = useState(participant.quizCorrectAt);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const ko = locale === "ko";
  async function grant() {
    if (!canWrite || grantedAt || pending.current) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setError("");
    try {
      const token = await getAccessToken();
      if (controller.signal.aborted) return;
      if (!token) throw new Error("auth");
      const response = await fetch(`/api/admin/kyaa-wave-participants/${participant.id}/quiz-stamp`, {
        method: "POST", headers: { authorization: `Bearer ${token}` }, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (response.status === 409) { setError(ko ? "추첨이 시작되어 도장을 지급할 수 없어요." : "The draw has started. Stamps can no longer be granted."); return; }
      if (!response.ok) throw new Error();
      const result = await response.json();
      if (result.id !== participant.id || typeof result.quizCorrectAt !== "string" || !Number.isFinite(Date.parse(result.quizCorrectAt))) throw new Error();
      if (!controller.signal.aborted) setGrantedAt(result.quizCorrectAt);
    } catch { if (!controller.signal.aborted) setError(ko ? "지급하지 못했어요. 다시 시도해 주세요." : "Couldn’t grant the stamp. Please try again."); }
    finally { if (!controller.signal.aborted) { pending.current = null; setBusy(false); } }
  }
  return <div>{grantedAt ? <span role="status">{ko ? "지급 완료" : "Granted"}</span> : canWrite ? <button type="button" className={shared.secondaryButton} disabled={busy} aria-label={ko ? `${participant.name} 퀴즈 정답 도장 지급` : `Grant correct-answer stamp to ${participant.name}`} onClick={() => void grant()}>{busy ? (ko ? "지급 중…" : "Granting…") : (ko ? "도장 지급" : "Grant stamp")}</button> : <span>{ko ? "미지급" : "Not granted"}</span>}{error && <p role="alert">{error}</p>}</div>;
}
