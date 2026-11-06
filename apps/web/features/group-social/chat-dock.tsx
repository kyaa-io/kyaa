"use client";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Maximize2, UsersRound, X } from "lucide-react";
import { z } from "zod";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { GroupRequestError, useGroupResource } from "@/features/groups/ui/use-group-resource";
import { waveFriendsCopy } from "@/i18n/catalogs/features__fanpage__wave-friends";
import type { AppLocale } from "@/i18n/locales";
import { chatDockOwner, closeChatDock, setChatDockConversation, takeChatDockFocus, type ChatDockTarget } from "./chat-dock-store";
import { Conversation, parseConversations } from "./conversation";
import { socialCopy } from "./copy";
import { profileConnectionCopy } from "./profile-copy";
import { reachText } from "./reach-copy";
import styles from "./chat-dock.module.css";

const LIVE = new Set(["accepted", "incoming_request", "outgoing_request"]);
const created = z.object({ id: z.uuid() });

/** Bottom right from 768px, full screen below. Not modal: the page stays usable behind it. */
export function ChatDock({ locale, target }: { locale: AppLocale; target: ChatDockTarget }) {
  const chats = useGroupResource("/api/me/social/conversations", parseConversations);
  const title = useId(), root = useRef<HTMLElement>(null), opener = useRef<HTMLElement | null>(null);
  const t = waveFriendsCopy(locale), s = socialCopy(locale);
  const [pending, setPending] = useState(false), [failed, setFailed] = useState(false);
  const owned = chats.ready && chats.authenticated && chatDockOwner(chats.ownerKey) === target.owner;
  useEffect(() => { if (chats.ready && !owned) closeChatDock(); }, [chats.ready, owned]);
  const [wantsFocus] = useState(takeChatDockFocus);
  // The message box appears once the conversation list has answered. The profile modal hands focus back 250ms after it closes, so this has to come later.
  useEffect(() => {
    if (!wantsFocus || chats.loading) return;
    const focus = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body && !root.current?.contains(active)) opener.current = active;
      root.current?.querySelector<HTMLElement>("textarea")?.focus();
    };
    focus();
    const later = window.setTimeout(focus, 300);
    return () => window.clearTimeout(later);
  }, [wantsFocus, chats.loading]);
  if (!owned) return null;

  const chat = chats.data?.conversations.find(item => item.profileId === target.profileId);
  const live = chat && (LIVE.has(chat.status) || chat.canSend) ? chat : undefined;
  const close = () => { closeChatDock(); if (opener.current?.isConnected) opener.current.focus(); };
  const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.nativeEvent.isComposing) { event.stopPropagation(); close(); } };
  const expand = `/my/friends?${new URLSearchParams(live ? { locale, conversationId: live.id } : { locale, profileId: target.profileId })}`;

  async function resolve(action: "accept" | "reject" | "cancel") {
    if (!live || pending) return;
    setPending(true); setFailed(false);
    try { await chats.request(`/api/me/social/conversations/${live.id}`, { method: "PATCH", body: JSON.stringify({ action, requestId: crypto.randomUUID() }) }); chats.retry(); if (action !== "accept") close(); }
    catch { setFailed(true); }
    finally { setPending(false); }
  }

  return <section ref={root} className={styles.dock} role="dialog" aria-labelledby={title} onKeyDown={onKeyDown} data-chat-dock>
    <header className={styles.header}>
      {target.avatarUrl ? <img src={target.avatarUrl} alt="" width={32} height={32} className={styles.avatar}/> : <span className={styles.avatar}><UsersRound size={18} aria-hidden/></span>}
      <h2 id={title} className={styles.name}>{target.nickname}</h2>
      <Link href={expand as Route} className={styles.icon} aria-label={reachText(locale, "expand")} title={reachText(locale, "expand")} onClick={closeChatDock}><Maximize2 size={18} aria-hidden/></Link>
      <FanAction variant="text" ariaLabel={profileConnectionCopy(locale).close} onClick={close} leadingIcon={<X size={20} aria-hidden/>}/>
    </header>
    <div className={styles.body}>
      {chats.loading ? <FanSkeletonRows rows={3} variant="plain"/>
        : chats.error ? <div className={styles.state} role="alert"><p>{t.error}</p><FanAction onClick={chats.retry}>{t.retry}</FanAction></div>
        : live ? <Conversation embedded key={live.id} locale={locale} id={live.id} conversation={live} pending={pending} onBack={close} onResolve={action => void resolve(action)}/>
        : <FirstMessage locale={locale} target={target} request={chats.request} onSent={id => { setChatDockConversation(id); chats.retry(); }} cannotSend={s.cannotSend}/>}
      {failed && <p className={styles.error} role="alert">{t.error}</p>}
    </div>
  </section>;
}

function FirstMessage({ locale, target, request, onSent, cannotSend }: { locale: AppLocale; target: ChatDockTarget; request: (url: string, init?: RequestInit) => Promise<unknown>; onSent: (id: string) => void; cannotSend: string }) {
  const t = waveFriendsCopy(locale), [body, setBody] = useState(""), [sending, setSending] = useState(false), [failure, setFailure] = useState<string>();
  const attempt = useRef<{ text: string; id: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    if (attempt.current?.text !== text) attempt.current = { text, id: crypto.randomUUID() };
    setSending(true); setFailure(undefined);
    try { onSent(created.parse(await request("/api/me/social/conversations", { method: "POST", body: JSON.stringify({ profileId: target.profileId, text, requestId: attempt.current.id }) })).id); }
    catch (error) {
      const status = error instanceof GroupRequestError ? error.status : 0;
      setFailure(status === 429 ? reachText(locale, "limit") : status === 403 || status === 409 ? cannotSend : t.error);
    } finally { setSending(false); }
  }
  return <>
    <div className={styles.empty}><p>{t.noMessages}</p></div>
    {failure && <p className={styles.error} role="alert">{failure}</p>}
    <form className={styles.compose} onSubmit={submit}>
      <textarea rows={1} aria-label={t.messageLabel} placeholder={t.messagePlaceholder} maxLength={1000} required value={body} disabled={sending} onChange={event => setBody(event.target.value)}/>
      <FanAction type="submit" variant="primary" ariaLabel={t.send} disabled={sending || !body.trim()} leadingIcon={<ArrowUp size={20} aria-hidden/>}/>
    </form>
  </>;
}
