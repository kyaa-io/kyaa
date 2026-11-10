"use client";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";

import { useRef, useState } from "react";
import { MessageCircle, Share2 } from "@/components/fan-ui/fan-icons";
import { z } from "zod";
import { FanSheet } from "@/components/fan-ui/fan-dialog";
import { fanLoginHref } from "@/components/login-href";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { useContentMutation } from "@/features/content-safety/ui/use-content-mutation";
import { PostReactions, type PostReactionChoice } from "@/features/fan-posts/ui/post-reactions";
import { postReactionCopy } from "@/features/fan-posts/ui/post-reaction-copy";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import styles from "./home-shorts.module.css";

const reactionSchema = z.object({ reaction: z.enum(["like", "dislike"]).nullable(), likeCount: z.number(), dislikeCount: z.number(), commentCount: z.number() });
const commentsSchema = z.object({ items: z.array(z.object({ id: z.string(), body: z.string(), createdAt: z.string(), isOwner: z.boolean(), author: z.object({ nickname: z.string(), avatarUrl: z.string().nullable().optional() }) })), nextCursor: z.string().nullable() });
const parseReaction = (value: unknown) => reactionSchema.parse(value);
const parseComments = (value: unknown) => commentsSchema.parse(value);

export function ShortsEngagement({ videoId, locale, offset }: { videoId: string; locale: AppLocale; offset: number }) {
  const auth = useByUsAuth(), copy = contentCopy(locale), reactionCopy = postReactionCopy(locale), mutation = useContentMutation(locale);
  const [open, setOpen] = useState(false), [cursor, setCursor] = useState<string | null>(null), [body, setBody] = useState(""), [shareError, setShareError] = useState(false);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const url = `/shorts?locale=${encodeURIComponent(locale)}${offset ? `&offset=${offset}` : ""}&video=${encodeURIComponent(videoId)}`;
  const loginHref = fanLoginHref(locale, url);
  const reactions = useCommunityResource(`/api/shorts/${encodeURIComponent(videoId)}/reactions`, parseReaction, false);
  const comments = useCommunityResource(open ? `/api/shorts/${encodeURIComponent(videoId)}/comments?locale=${toContentLocale(locale)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}` : null, parseComments, false);
  const change = async (reaction: PostReactionChoice) => { if (await mutation.request(`/api/shorts/${encodeURIComponent(videoId)}/reactions`, "PUT", { reaction })) reactions.retry(); };
  const submit = async () => {
    const value = body.trim(); if (!value || mutation.busy) return;
    if (attempt.current?.body !== value) attempt.current = { body: value, key: crypto.randomUUID() };
    if (await mutation.request(`/api/shorts/${encodeURIComponent(videoId)}/comments`, "POST", { body: value, idempotencyKey: attempt.current.key })) { setBody(""); attempt.current = null; setCursor(null); comments.retry(); reactions.retry(); }
  };
  const remove = async (id: string) => { if (window.confirm(copy.deleteConfirm) && await mutation.request(`/api/short-comments/${encodeURIComponent(id)}`, "DELETE")) { comments.retry(); reactions.retry(); } };
  const share = async () => { setShareError(false); try { const link = new URL(url, window.location.origin).href; if (navigator.share) await navigator.share({ url: link }); else await navigator.clipboard.writeText(link); } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setShareError(true); } };
  return <div className={styles.engagement}>
    <span className={styles.brand}>kyaa</span>
    {reactions.state.status === "ready" ? <PostReactions locale={locale} {...reactions.state.data} busy={mutation.busy || !auth.ready} loginHref={auth.ready && !auth.authenticated ? loginHref : undefined} onChange={choice => void change(choice)} /> : reactions.state.status === "error" ? <FanAction variant="text" onClick={reactions.retry}>{copy.retry}</FanAction> : <span aria-live="polite">…</span>}
    <FanAction variant="text" type="button" onClick={() => setOpen(true)} ariaLabel={copy.comments}><FanIcon icon={MessageCircle} />{reactions.state.status === "ready" ? reactions.state.data.commentCount : ""}</FanAction>
    <FanAction variant="text" type="button" onClick={() => void share()} ariaLabel={locale === "ko" ? "공유" : "Share"}><FanIcon icon={Share2} /></FanAction>
    {shareError && <span role="alert">{copy.failed}</span>}
    {mutation.error && <span role="alert">{mutation.error}</span>}
    <FanSheet open={open} onOpenChange={setOpen} title={copy.comments} closeLabel={locale === "ko" ? "닫기" : "Close"} snap="full">
      {auth.ready && (auth.authenticated ? <form onSubmit={e => { e.preventDefault(); void submit(); }} className={styles.commentForm}>
        <label htmlFor={`short-comment-${videoId}`}>{reactionCopy.placeholder}</label><textarea id={`short-comment-${videoId}`} maxLength={1000} value={body} onChange={e => setBody(e.target.value)} disabled={mutation.busy} />
        <FanAction variant="text" type="submit" disabled={!body.trim() || mutation.busy}>{copy.send}</FanAction>
      </form> : <a href={loginHref}>{copy.login}</a>)}
      {mutation.error && <p role="alert">{mutation.error}</p>}
      {comments.state.status === "ready" ? <><ul className={styles.comments}>{comments.state.data.items.map(comment => <li key={comment.id} data-row="short-comment"><strong>{comment.author.nickname}</strong><p>{comment.body}</p><time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString(locale)}</time>{comment.isOwner && <FanAction variant="text" type="button" disabled={mutation.busy} onClick={() => void remove(comment.id)}>{copy.delete}</FanAction>}</li>)}</ul>
        {(cursor || comments.state.data.nextCursor) && <nav>{cursor && <FanAction variant="text" onClick={() => setCursor(null)}>{copy.newest}</FanAction>}{comments.state.data.nextCursor && <FanAction variant="text" onClick={() => setCursor(comments.state.status === "ready" ? comments.state.data.nextCursor : null)}>{copy.older}</FanAction>}</nav>}</> : comments.state.status === "error" ? <p role="alert">{copy.failed} <FanAction variant="text" onClick={comments.retry}>{copy.retry}</FanAction></p> : <p aria-live="polite">…</p>}
    </FanSheet>
  </div>;
}
