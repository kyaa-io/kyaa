"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { fanLoginHref } from "@/components/login-href";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { fanListTime } from "@/features/groups/ui/fan-list-time";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { useContentMutation } from "@/features/content-safety/ui/use-content-mutation";
import { CommentComposer } from "@/features/fan-posts/ui/fan-post-detail";
import { PostReactions, applyReaction, type PostReactionChoice, type PostReactionState } from "@/features/fan-posts/ui/post-reactions";
import { PostShareAction } from "@/features/fan-posts/ui/post-share-action";
import { postReactionCopy } from "@/features/fan-posts/ui/post-reaction-copy";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { homeNoticeParticipationSchema, homeNoticeCommentPageSchema, homeNoticeCommentWriteSchema } from "../domain/home-notice-participation";
import detailStyles from "@/features/fan-posts/ui/post-detail.module.css";
import styles from "./home-notice-participation.module.css";

const parseParticipation = (value: unknown) => homeNoticeParticipationSchema.parse(value);
const parseComments = (value: unknown) => homeNoticeCommentPageSchema.parse(value);
type Props = { slug: string; title: string; locale: AppLocale };

export function HomeNoticeParticipation(props: Props) {
  const auth = useByUsAuth(), session = useByUsSession();
  const scope = `${props.slug}:${props.locale}:${auth.ready}:${auth.authenticated}:${session.ownerId ?? auth.user?.id}:${session.generation}`;
  return <Participation key={scope} {...props} />;
}

function Participation({ slug, title, locale }: Props) {
  const auth = useByUsAuth(), copy = contentCopy(locale), rc = postReactionCopy(locale), fieldId = useId();
  const base = `/api/notices/${encodeURIComponent(slug)}`;
  const [cursor, setCursor] = useState<string | null>(null);
  const participation = useCommunityResource(`${base}/participation`, parseParticipation, false);
  const comments = useCommunityResource(`${base}/comments?locale=${toContentLocale(locale)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, parseComments, false);
  const mutation = useContentMutation(locale);
  const [optimistic, setOptimistic] = useState<{ base: unknown; state: PostReactionState } | null>(null);
  const [invalidResponse, setInvalidResponse] = useState(false);
  const draft = useRef("");
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const returnTo = `/notices/${slug}?locale=${locale}`;
  const loginHref: string = fanLoginHref(locale, returnTo);
  const data = participation.state.status === "ready" ? participation.state.data : null;
  const reaction = optimistic?.base === data ? optimistic.state : data;
  const refresh = () => { participation.retry(); comments.retry(); };

  async function react(choice: PostReactionChoice) {
    if (!data || !reaction || mutation.busy) return;
    setInvalidResponse(false);
    setOptimistic({ base: data, state: applyReaction(reaction, choice) });
    const result = await mutation.request(`${base}/reaction`, "PUT", { reaction: choice });
    const parsed = homeNoticeParticipationSchema.safeParse(result);
    if (parsed.success) setOptimistic({ base: data, state: parsed.data });
    else { setOptimistic(null); if (result) setInvalidResponse(true); }
  }
  async function submit(value: string) {
    const body = value.trim();
    if (!body || mutation.busy) return false;
    setInvalidResponse(false);
    if (!attempt.current || attempt.current.body !== body) attempt.current = { body, key: crypto.randomUUID() };
    const result = await mutation.request(`${base}/comments`, "POST", { body, idempotencyKey: attempt.current.key });
    if (!homeNoticeCommentWriteSchema.safeParse(result).success) { if (result) setInvalidResponse(true); return false; }
    draft.current = ""; attempt.current = null; setCursor(null); refresh();
    return true;
  }
  async function remove(id: string) {
    if (window.confirm(copy.deleteConfirm) && await mutation.request(`/api/home-notice-comments/${id}`, "DELETE")) refresh();
  }
  const error = mutation.error || (invalidResponse ? copy.failed : "");
  return <section className={styles.participation} data-home-notice-participation="">
    <div className={styles.actions}>
      {reaction && <PostReactions {...reaction} locale={locale} busy={mutation.busy || !auth.ready} loginHref={auth.ready && !auth.authenticated ? loginHref : undefined} onChange={choice => void react(choice)} />}
      <PostShareAction title={title} locale={locale} contentType="notice" />
    </div>
    {participation.state.status === "loading" ? <FanSkeletonRows rows={1} /> : participation.state.status === "error" || participation.refreshFailed ? <p role="status">{copy.failed} <FanAction variant="text" onClick={participation.retry}>{copy.retry}</FanAction></p> : null}
    {error && <p role="alert">{error}{mutation.failure === "auth" && <FanAction href={loginHref} variant="text">{copy.login}</FanAction>}</p>}
    <section id="comments" className={styles.comments} aria-labelledby={`${fieldId}-heading`}>
      <FanHeading as="h2" id={`${fieldId}-heading`}>{copy.comments}{data ? ` ${data.commentCount.toLocaleString(locale)}` : ""}</FanHeading>
      {auth.ready && (auth.authenticated ? <CommentComposer fieldId={fieldId} locale={locale} readDraft={() => draft.current} onDraft={(_, value) => { draft.current = value; }} replyTarget={null} gated={false} gate={null} busy={mutation.busy} error={null} onGate={() => {}} onSubmit={submit} onCancel={() => {}} showRewards={false} /> : <div className={detailStyles.commentForm}>
        <Link className={detailStyles.guestField} href={loginHref as Route}>{rc.placeholder}</Link>
        <div className={detailStyles.commentTools}><FanAction href={loginHref} variant="neutral" size="sm">{copy.login}</FanAction></div>
      </div>)}
      {comments.state.status === "loading" ? <FanSkeletonRows rows={2} variant="member" /> : comments.state.status === "error" ? <p role="status">{copy.failed} <FanAction variant="text" onClick={comments.retry}>{copy.retry}</FanAction></p> : <>
        {comments.refreshFailed && <p role="status">{copy.failed} <FanAction variant="text" onClick={comments.retry}>{copy.retry}</FanAction></p>}
        <ul className={styles.list}>{comments.state.data.items.map(comment => <li key={comment.id} data-row="comment">
          <div className={styles.meta}><img src={comment.author.avatarUrl} alt="" width={32} height={32} /><strong>{comment.author.nickname}</strong><time dateTime={comment.createdAt}>{fanListTime(comment.createdAt, locale)}</time>{comment.isOwner && <FanAction variant="text" disabled={mutation.busy} onClick={() => void remove(comment.id)}>{copy.delete}</FanAction>}</div>
          <p className={styles.body}>{comment.body}</p>
        </li>)}</ul>
        {(cursor || comments.state.data.nextCursor) && <nav className={styles.pagination} aria-label={copy.comments}>{cursor && <FanAction variant="text" onClick={() => setCursor(null)}>{copy.newest}</FanAction>}{comments.state.data.nextCursor && <FanAction variant="text" onClick={() => setCursor(comments.state.status === "ready" ? comments.state.data.nextCursor : null)}>{copy.older}</FanAction>}</nav>}
      </>}
    </section>
  </section>;
}
