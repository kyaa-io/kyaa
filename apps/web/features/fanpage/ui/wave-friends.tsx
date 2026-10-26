"use client";
import { TranslatedText } from "@/features/content-safety/ui/use-automatic-translation";
import { useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { MessageCircle, QrCode, ScanLine, UsersRound, X } from "lucide-react";
import type { AppLocale } from "@/i18n/locales";
import { toContentLocale } from "@/i18n/locales";
import { waveFriendsCopy } from "@/i18n/catalogs/features__fanpage__wave-friends";
import { waveProgramsCopy } from "@/i18n/catalogs/features__fanpage__wave-programs";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSectionHeader } from "@/components/fan-ui/fan-heading";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { useByUsSession } from "@/components/byus-session-provider";
import { useContentMutation } from "@/features/content-safety/ui/use-content-mutation";
import { parseWaveFriends, parseWaveLink, parseWaveProfile, waveFriendToken, type WaveFriend } from "../domain/wave-friends";
import { useFanpageResource } from "./use-fanpage-resource";
import { waveSectionHref } from "./wave-navigation";
import { WaveFriendScanner } from "./wave-friend-scanner";
import styles from "./wave-friends.module.css";

const base = "/api/kyaa-wave/friends";
type Panel = { kind: "scan" } | { kind: "qr" } | { kind: "profile"; token: string } | { kind: "dm"; friend: WaveFriend };
const parseMessages = (value: unknown) => z.object({ messages: z.array(z.object({ id: z.uuid(), text: z.string(), createdAt: z.string(), isMine: z.boolean() })), hasMore: z.boolean().optional() }).parse(value);

export function WaveFriends({ locale }: { locale: AppLocale }) {
  const auth = usePrivy(), session = useByUsSession(), copy = waveFriendsCopy(locale), common = waveProgramsCopy(locale);
  if (!auth.ready) return <p role="status">{copy.loading}</p>;
  if (!auth.authenticated) return <section><FanSectionHeader title={copy.title} /><FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(waveSectionHref("friends", locale))}`}>{common.login}</FanAction></section>;
  return <Friends key={`${session.ownerId ?? auth.user?.id}:${session.generation}`} locale={locale} />;
}

function Friends({ locale }: { locale: AppLocale }) {
  const copy = waveFriendsCopy(locale), heading = useId();
  const resource = useFanpageResource(`${base}?locale=${toContentLocale(locale)}`, parseWaveFriends);
  const mutation = useContentMutation(locale), attempt = useRef({ value: "", id: "" });
  const [panel, setPanel] = useState<Panel | null>(null), [messageBusy, setMessageBusy] = useState(false);
  useEffect(() => {
    const token = waveFriendToken(location.href, location.origin);
    if (token) setPanel({ kind: "profile", token });
  }, []);
  async function act(path: string, method: string, body: Record<string, string>) {
    const value = JSON.stringify([path, method, body]);
    if (attempt.current.value !== value) attempt.current = { value, id: crypto.randomUUID() };
    const result = await mutation.request(path, method, { ...body, requestId: attempt.current.id });
    if (result) { attempt.current = { value: "", id: "" }; resource.retry(); }
    return result;
  }
  const friends = resource.state.status === "ready" ? resource.state.data.friendships : [];
  const accepted = friends.filter(friend => friend.status === "friends");
  const incoming = friends.filter(friend => friend.status === "incoming"), outgoing = friends.filter(friend => friend.status === "outgoing");
  const close = () => { setPanel(null); if (new URL(location.href).searchParams.has("friend")) { const url = new URL(location.href); url.searchParams.delete("friend"); history.replaceState(history.state, "", url); } };
  return <section className={styles.section} aria-label={copy.title}>
    <FanSectionHeader title={copy.title} />
    <div className={styles.actions}>
      <FanAction variant="primary" leadingIcon={<ScanLine size={22} />} onClick={() => setPanel({ kind: "scan" })}>{copy.add}</FanAction>
      <FanAction leadingIcon={<QrCode size={22} />} onClick={() => setPanel({ kind: "qr" })}>{copy.myQr}</FanAction>
    </div>
    {mutation.error && <p role="alert" className={styles.problem}>{copy.error}</p>}
    {resource.state.status === "loading" ? <p role="status" className={styles.muted}>{copy.loading}</p> : resource.state.status === "error" ? <div role="alert" className={styles.state}><p>{copy.error}</p><FanAction onClick={resource.retry}>{copy.retry}</FanAction></div> : <>
      <div className={styles.listHeading}><h3>{copy.friendCount.replace("{count}", new Intl.NumberFormat(locale).format(accepted.length))}</h3></div>
      {accepted.length ? <ul className={styles.list}>{accepted.map(friend => <li key={friend.id}><img src={friend.avatarUrl} width={48} height={48} alt="" /><strong>{friend.nickname}</strong><FanAction leadingIcon={<MessageCircle size={18} />} ariaLabel={`${friend.nickname} · ${copy.dm}`} onClick={() => setPanel({ kind: "dm", friend })}>{copy.dm}</FanAction></li>)}</ul> : <div className={styles.empty}>
        <div className={styles.emptyArt} aria-hidden="true"><UsersRound size={64} strokeWidth={1.25} /><span><ScanLine size={24} /></span></div>
        <h3>{copy.emptyTitle}</h3><p>{copy.emptyDescription}</p>
      </div>}
      {([incoming, outgoing] as const).map((list, index) => list.length > 0 && <section key={index} className={styles.requests} aria-label={index ? copy.outgoing : copy.incoming}><h3>{index ? copy.outgoing : copy.incoming} <span>{list.length}</span></h3><ul className={styles.list}>{list.map(friend => <li key={friend.id}><img src={friend.avatarUrl} width={40} height={40} alt="" /><strong>{friend.nickname}</strong><div className={styles.rowActions}>{!index && <FanAction disabled={mutation.busy} onClick={() => void act(`${base}/${friend.id}`, "PATCH", { action: "accept" })}>{copy.accept}</FanAction>}<FanAction variant="text" disabled={mutation.busy} onClick={() => void act(`${base}/${friend.id}`, "PATCH", { action: index ? "cancel" : "reject" })}>{index ? copy.cancel : copy.reject}</FanAction></div></li>)}</ul></section>)}
    </>}
    {panel && <AccessibleOverlay open onClose={close} labelledBy={heading} backdropClassName={styles.backdrop} contentClassName={styles.dialog} contentAs="section" variant="dialog" busy={mutation.busy || messageBusy}>
      <header className={styles.dialogHeader}><h2 id={heading}>{panel.kind === "qr" ? copy.qrTitle : panel.kind === "dm" ? panel.friend.nickname : copy.scanTitle}</h2><button type="button" className={styles.close} aria-label={copy.close} disabled={mutation.busy || messageBusy} onClick={close}><X size={22} /></button></header>
      {panel.kind === "scan" ? <WaveFriendScanner locale={locale} onScan={token => setPanel({ kind: "profile", token })} />
        : panel.kind === "qr" ? <MyQr locale={locale} />
        : panel.kind === "profile" ? <ScannedProfile locale={locale} token={panel.token} act={act} busy={mutation.busy} error={mutation.error} onBack={() => setPanel({ kind: "scan" })} />
        : <Conversation locale={locale} friend={panel.friend} onBusy={setMessageBusy} />}
    </AccessibleOverlay>}
  </section>;
}

function MyQr({ locale }: { locale: AppLocale }) {
  const copy = waveFriendsCopy(locale), resource = useFanpageResource(`${base}/profile-link`, parseWaveLink), canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false), [copied, setCopied] = useState(false), [drawn, setDrawn] = useState(false);
  const token = resource.state.status === "ready" ? resource.state.data.token : null;
  const href = token && typeof location !== "undefined" ? `${location.origin}/kyaa-wave-fanpage?tab=friends&locale=${locale}&friend=${token}#celebrity-content` : "";
  useEffect(() => {
    let disposed = false;
    if (href && canvas.current) void import("qrcode").then(({ toCanvas }) => { if (!disposed && canvas.current) return toCanvas(canvas.current, href, { width: 256, margin: 4, errorCorrectionLevel: "M" }); }).then(() => { if (!disposed) setDrawn(true); }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; };
  }, [href]);
  return <div className={styles.qr}><p className={styles.muted}>{copy.qrHint}</p>
    <canvas ref={canvas} role="img" aria-label={copy.qrTitle} hidden={!drawn} />
    {(resource.state.status === "loading" || (token && !drawn && !error)) && <p role="status">{copy.loading}</p>}
    {(resource.state.status === "error" || error) && <div role="alert"><p>{copy.error}</p><FanAction onClick={() => { setError(false); setDrawn(false); resource.retry(); }}>{copy.retry}</FanAction></div>}
    {drawn && <><p className={styles.meta}>{copy.qrExpiry}</p><FanAction onClick={() => { void navigator.clipboard.writeText(href).then(() => setCopied(true)).catch(() => setError(true)); }}>{copied ? copy.copied : copy.copyLink}</FanAction></>}
  </div>;
}

type Act = (path: string, method: string, body: Record<string, string>) => Promise<unknown>;
function ScannedProfile({ locale, token, act, busy, error, onBack }: { locale: AppLocale; token: string; act: Act; busy: boolean; error: string; onBack: () => void }) {
  const copy = waveFriendsCopy(locale), resource = useFanpageResource(`${base}/profile-links/${token}?locale=${toContentLocale(locale)}`, parseWaveProfile);
  const [sent, setSent] = useState(false);
  if (resource.state.status === "loading") return <p role="status">{copy.loading}</p>;
  if (resource.state.status === "error") return <div className={styles.state} role="alert"><p>{copy.invalidQr}</p><FanAction onClick={resource.retry}>{copy.retry}</FanAction><FanAction variant="text" onClick={onBack}>{copy.back}</FanAction></div>;
  const { profile, relationship, isSelf } = resource.state.data;
  return <div className={styles.profile}><img src={profile.avatarUrl} alt="" width={80} height={80} /><h3>{profile.nickname}</h3>
    {error && <p role="alert">{copy.error}</p>}
    {isSelf ? <p>{copy.selfQr}</p> : sent || relationship.status === "outgoing" ? <p role="status">{copy.requested}</p> : relationship.status === "friends" ? <p role="status">{copy.alreadyFriends}</p>
      : relationship.status === "incoming" ? <FanAction variant="primary" disabled={busy} onClick={async () => { if (await act(`${base}/${relationship.friendshipId}`, "PATCH", { action: "accept" })) resource.retry(); }}>{copy.accept}</FanAction>
      : <FanAction variant="primary" disabled={busy} onClick={async () => { if (await act(base, "POST", { profileId: profile.id })) setSent(true); }}>{copy.requestFriend}</FanAction>}
    <FanAction variant="text" disabled={busy} onClick={onBack}>{copy.back}</FanAction>
  </div>;
}

function Conversation({ locale, friend, onBusy }: { locale: AppLocale; friend: WaveFriend; onBusy: (busy: boolean) => void }) {
  const copy = waveFriendsCopy(locale), url = `${base}/${friend.profileId}/messages`, resource = useFanpageResource(url, parseMessages, true), mutation = useContentMutation(locale);
  const [text, setText] = useState(""), [sent, setSent] = useState(false), attempt = useRef({ text: "", id: "" }), label = useId();
  const refresh = useRef(resource.retry), list = useRef<HTMLOListElement>(null);
  useEffect(() => { onBusy(mutation.busy); }, [mutation.busy, onBusy]);
  const lastId = resource.state.status === "ready" ? resource.state.data.messages.at(-1)?.id : null;
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [lastId]);
  useEffect(() => { refresh.current = resource.retry; });
  useEffect(() => { const timer = setInterval(() => { if (document.visibilityState === "visible") refresh.current(); }, 15000); return () => clearInterval(timer); }, []);
  async function send() {
    const body = text.trim(); if (!body) return;
    if (attempt.current.text !== body) attempt.current = { text: body, id: crypto.randomUUID() };
    const result = await mutation.request(url, "POST", { text: body, requestId: attempt.current.id });
    if (result) { setText(""); setSent(true); attempt.current = { text: "", id: "" }; resource.retry(); }
  }
  return <div className={styles.conversation}>
    {resource.state.status === "loading" ? <p role="status">{copy.loading}</p> : resource.state.status === "error" ? <div role="alert"><p>{copy.unavailable}</p><FanAction onClick={resource.retry}>{copy.retry}</FanAction></div> : <ol ref={list} className={styles.messages}>{resource.state.data.messages.length ? resource.state.data.messages.map(message => <li key={message.id} data-mine={message.isMine}><TranslatedText as="p" text={message.text} locale={locale} /><time dateTime={message.createdAt}>{new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(message.createdAt))}</time></li>) : <li className={styles.noMessages}>{copy.noMessages}</li>}</ol>}
    {resource.state.status === "ready" && resource.state.data.hasMore && <p className={styles.meta}>{copy.recentMessages}</p>}
    <form onSubmit={event => { event.preventDefault(); void send(); }} className={styles.messageForm}><label htmlFor={label}>{copy.messageLabel}</label><textarea id={label} value={text} maxLength={1000} required rows={3} placeholder={copy.messagePlaceholder} onChange={event => { setText(event.target.value); setSent(false); }} />
      {mutation.error && <p role="alert">{copy.error}</p>}{sent && <p role="status">{copy.sent}</p>}<FanAction variant="primary" type="submit" disabled={mutation.busy || !text.trim() || resource.state.status !== "ready"}>{copy.send}</FanAction>
    </form>
  </div>;
}
