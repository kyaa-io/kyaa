"use client";

import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { AlertCircle, RefreshCw, UserCog, UserPlus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useOperatorChannels, type OperatorChannel } from "../operator/use-operator-channels";
import { channelOperatorListSchema, type ChannelOperatorGrant } from "@/features/operator/domain/channel-operator-grants";
import { AdminAccessState } from "./admin-access-state";
import { AdminOperationsShell, type AdminLocale } from "./operations-shell";
import { useAdminSession } from "./use-admin-session";
import { AlertDialog } from "../ui/overlay/accessible-overlay";
import styles from "./admin-directory-manager.module.css";

const copy = {
  ko: {
    eyebrow: "접근 권한", title: "채널 운영자", channel: "채널", email: "이메일", emailPlaceholder: "operator@example.com",
    grant: "운영자 지정", granting: "지정 중…", status: "상태", active: "운영 중", revoked: "해지됨", granted: "지정일", revokedAt: "해지일",
    actions: "작업", revoke: "해지", revoking: "해지 중…", cancel: "취소", loading: "운영자 명단을 불러오는 중입니다.",
    empty: "지정된 운영자가 없습니다.", loadError: "운영자 명단을 불러오지 못했습니다.", retry: "다시 시도", noChannels: "지정할 수 있는 채널이 없습니다.",
    granted_ok: "운영자를 지정했습니다.", replayed: "이미 지정된 운영자입니다.", revoked_ok: "운영자를 해지했습니다.",
    confirmTitle: "운영자를 해지할까요?", confirmBody: (email: string) => `${email}은 이 채널을 더 이상 운영할 수 없습니다.`,
    errors: {
      INVALID_INPUT: "이메일을 확인해 주세요.", CHANNEL_OPERATOR_CANDIDATE_NOT_FOUND: "가입한 회원 중에서 이 이메일을 찾을 수 없습니다.", CHANNEL_OPERATOR_CANDIDATE_AMBIGUOUS: "이 이메일로 가입한 계정이 둘 이상이라 지정할 수 없습니다.",
      CHANNEL_OPERATOR_NOT_FOUND: "채널 또는 지정 정보를 찾을 수 없습니다.", CHANNEL_OPERATOR_UNAVAILABLE: "지금은 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      FORBIDDEN: "전체 관리자만 사용할 수 있습니다.", UNAUTHENTICATED: "관리자 로그인이 필요합니다.",
    },
  },
  en: {
    eyebrow: "Access control", title: "Channel operators", channel: "Channel", email: "Email", emailPlaceholder: "operator@example.com",
    grant: "Grant operator", granting: "Granting…", status: "Status", active: "Active", revoked: "Revoked", granted: "Granted", revokedAt: "Revoked",
    actions: "Actions", revoke: "Revoke", revoking: "Revoking…", cancel: "Cancel", loading: "Loading operators.",
    empty: "No operators are assigned.", loadError: "Operators could not be loaded.", retry: "Try again", noChannels: "There are no channels to assign.",
    granted_ok: "Operator granted.", replayed: "This operator is already assigned.", revoked_ok: "Operator revoked.",
    confirmTitle: "Revoke this operator?", confirmBody: (email: string) => `${email} will no longer be able to operate this channel.`,
    errors: {
      INVALID_INPUT: "Check the email address.", CHANNEL_OPERATOR_CANDIDATE_NOT_FOUND: "No registered member has this email.", CHANNEL_OPERATOR_CANDIDATE_AMBIGUOUS: "More than one account uses this email, so it cannot be assigned.",
      CHANNEL_OPERATOR_NOT_FOUND: "The channel or assignment could not be found.", CHANNEL_OPERATOR_UNAVAILABLE: "Unavailable right now. Try again later.",
      FORBIDDEN: "Only full administrators can use this.", UNAUTHENTICATED: "Admin sign-in is required.",
    },
  },
} as const;

type ErrorCode = keyof typeof copy.ko.errors;
const localeFrom = (value: string | null): AdminLocale => (value === "en" ? "en" : "ko");
const channelName = (channel: OperatorChannel, locale: AdminLocale) => (locale === "ko" ? channel.nameKo : channel.nameEn);
const formatDate = (value: string, locale: AdminLocale) => new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(value));
function errorCode(response: Response, body: unknown): ErrorCode {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  if (typeof code === "string" && code in copy.ko.errors) return code as ErrorCode;
  if (response.status === 401) return "UNAUTHENTICATED";
  if (response.status === 403) return "FORBIDDEN";
  return "CHANNEL_OPERATOR_UNAVAILABLE";
}

export function ChannelOperatorManager() {
  const session = useAdminSession();
  const params = useSearchParams();
  const locale = localeFrom(params.get("lang"));
  const channels = useOperatorChannels();
  if (session.status !== "authorized") return <AdminAccessState status={session.status} locale={locale} />;
  if (session.admin.role !== "admin") return <AdminAccessState status="denied" locale={locale} />;
  return <AdminOperationsShell locale={locale} adminRole="admin">
    <OperatorContent locale={locale} channels={channels.status === "authorized" ? channels.channels : null} />
  </AdminOperationsShell>;
}

function OperatorContent({ locale, channels }: { locale: AdminLocale; channels: OperatorChannel[] | null }) {
  const t = copy[locale];
  const { getAccessToken } = usePrivy();
  const [channelId, setChannelId] = useState("");
  const [items, setItems] = useState<ChannelOperatorGrant[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState<ChannelOperatorGrant | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const selected = channelId || channels?.[0]?.id || "";

  useEffect(() => () => abortRef.current?.abort(), []);

  const load = useCallback(async () => {
    if (!selected) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState("loading");
    try {
      const token = await getAccessToken();
      if (!token || controller.signal.aborted) throw new Error("missing token");
      const response = await fetch(`/api/admin/celebrities/${selected}/operators`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
      const body = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      const parsed = channelOperatorListSchema.safeParse(body);
      if (!response.ok || !parsed.success) throw new Error("load failed");
      setItems(parsed.data.items);
      setState("ready");
    } catch { if (!controller.signal.aborted) setState("error"); }
  }, [getAccessToken, selected]);

  useEffect(() => { setMessage(null); void load(); }, [load]);

  async function send(path: string, init: RequestInit, onDone: (body: unknown, response: Response) => void) {
    setBusy(true);
    setMessage(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("missing token");
      const response = await fetch(path, { ...init, cache: "no-store", headers: { authorization: `Bearer ${token}`, ...(init.body ? { "content-type": "application/json" } : {}) } });
      const body = await response.json().catch(() => null);
      if (!response.ok) { setMessage({ type: "error", text: t.errors[errorCode(response, body)] }); return; }
      onDone(body, response);
      await load();
    } catch { setMessage({ type: "error", text: t.errors.CHANNEL_OPERATOR_UNAVAILABLE }); }
    finally { setBusy(false); setPending(null); }
  }

  function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || busy || !selected) return;
    void send(`/api/admin/celebrities/${selected}/operators`, { method: "POST", body: JSON.stringify({ email: email.trim() }) }, (body) => {
      const replayed = (body as { item?: { replayed?: boolean } } | null)?.item?.replayed === true;
      setEmail("");
      setMessage({ type: "success", text: replayed ? t.replayed : t.granted_ok });
    });
  }

  function revoke() {
    if (!pending || busy) return;
    void send(`/api/admin/celebrities/${selected}/operators/${pending.id}`, { method: "DELETE" }, () => setMessage({ type: "success", text: t.revoked_ok }));
  }

  return <>
    <header className={styles.heading}><div><p>{t.eyebrow}</p><h1>{t.title}</h1></div><UserCog aria-hidden="true" /></header>
    {channels !== null && channels.length === 0 && <div className={styles.stateMessage}><AlertCircle aria-hidden="true" /><h3>{t.noChannels}</h3></div>}
    {channels !== null && channels.length > 0 && <>
      <section className={styles.addPanel} aria-labelledby="channel-operator-grant-title">
        <h2 id="channel-operator-grant-title">{t.grant}</h2>
        <form onSubmit={grant}>
          <label><span>{t.channel}</span><select value={selected} disabled={busy} onChange={(event) => { setChannelId(event.target.value); setItems([]); }}>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channelName(channel, locale)}</option>)}</select></label>
          <label className={styles.emailField}><span>{t.email}</span><input type="email" autoComplete="off" required value={email} placeholder={t.emailPlaceholder} disabled={busy} onChange={(event) => setEmail(event.target.value)} /></label>
          <button className={styles.primaryButton} type="submit" disabled={busy || !email.trim()}><UserPlus aria-hidden="true" />{busy ? t.granting : t.grant}</button>
        </form>
      </section>
      <section className={styles.directory} aria-labelledby="channel-operator-list-title">
        <div className={styles.toolbar}><div><h2 id="channel-operator-list-title">{t.title}</h2></div></div>
        {message && <div className={message.type === "error" ? styles.errorMessage : styles.successMessage} role={message.type === "error" ? "alert" : "status"}><span>{message.text}</span></div>}
        {(state === "loading" || state === "idle") && <div className={styles.skeletonList} role="status" aria-label={t.loading}>{[1, 2, 3].map((number) => <div key={number} />)}</div>}
        {state === "error" && <div className={styles.stateMessage}><AlertCircle aria-hidden="true" /><h3>{t.loadError}</h3><button type="button" onClick={() => void load()}><RefreshCw aria-hidden="true" />{t.retry}</button></div>}
        {state === "ready" && items.length === 0 && <div className={styles.stateMessage}><AlertCircle aria-hidden="true" /><h3>{t.empty}</h3></div>}
        {state === "ready" && items.length > 0 && <div className={styles.tableWrap}><table><thead><tr><th>{t.email}</th><th>{t.status}</th><th>{t.granted}</th><th>{t.revokedAt}</th><th>{t.actions}</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className={item.status === "revoked" ? styles.inactiveRow : undefined}>
          <td data-label={t.email}><strong>{item.email}</strong></td>
          <td data-label={t.status}><span className={item.status === "active" ? styles.activeBadge : styles.inactiveBadge}><i aria-hidden="true" />{item.status === "active" ? t.active : t.revoked}</span></td>
          <td data-label={t.granted}><time dateTime={item.grantedAt}>{formatDate(item.grantedAt, locale)}</time></td>
          <td data-label={t.revokedAt}>{item.revokedAt ? <time dateTime={item.revokedAt}>{formatDate(item.revokedAt, locale)}</time> : "—"}</td>
          <td data-label={t.actions}><div className={styles.rowActions}>{item.status === "active" && <button className={styles.revokeButton} type="button" disabled={busy} onClick={() => setPending(item)}>{t.revoke}</button>}</div></td>
        </tr>)}</tbody></table></div>}
      </section>
    </>}
    {pending && <AlertDialog open onClose={() => setPending(null)} labelledBy="operator-revoke-title" describedBy="operator-revoke-description" backdropClassName={styles.confirmBackdrop} contentClassName={styles.confirmDialog} busy={busy}>
      <h2 id="operator-revoke-title">{t.confirmTitle}</h2><p id="operator-revoke-description">{t.confirmBody(pending.email)}</p>
      <div><button type="button" data-autofocus disabled={busy} onClick={() => setPending(null)}>{t.cancel}</button><button className={styles.confirmDanger} type="button" disabled={busy} onClick={revoke}>{busy ? t.revoking : t.revoke}</button></div>
    </AlertDialog>}
  </>;
}
