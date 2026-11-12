"use client";
import { ProfileAuthor } from "@/features/group-social/profile-window";
import { EarnBadgeCorner } from "@/features/dukjil/ui/earn-badge";
import { FanSkeleton, FanSkeletonRows, FanSkeletonStatus } from "@/components/fan-ui/fan-skeleton";
import { fanLoginHref } from "@/components/login-href";
import { boardCopy } from "@/features/groups/ui/board-copy";
import { PostDetailSkeleton } from "./post-detail-header";
import detailStyles from "./post-detail.module.css";
import { EditedMark } from "./edited-mark";
import { isEdited } from "../domain/edited";
import {z} from 'zod';
import { GroupArtistMark } from "@/features/groups/ui/group-artist-mark";
import {CheerReplies} from './cheer-replies';
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { memo, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { RelativeTime } from "@/components/relative-time";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { sanitizeReturnTo } from "@/components/login-intent";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { communityHref as hubHref } from "@/features/community/domain/navigation";
import { showMissionRewardToast } from "./mission-reward-toast";
import { registrationReward } from "../domain/registration-reward";
import { announceMissionSkip } from "./mission-skip-notice";
import { postSchema, commentPageSchema } from "../domain/content";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
import { WavePrivacyNotice } from "@/features/fanpage/ui/wave-privacy";
import { MemberGate, isMemberGate } from './member-gate';
import { postReactionCopy } from './post-reaction-copy';
import { useGroupResource } from '@/features/groups/ui/use-group-resource';
import { postAttachmentPolicySchema } from '../domain/content';
import { PostCard } from "./post-card";
import { CommentLike } from "./comment-like";
import { ContentActions, ContentTranslation } from "@/features/content-safety/ui/content-actions";
import { useContentMutation } from "@/features/content-safety/ui/use-content-mutation";
import { PassportRequiredDialog, usePassportRequired } from "@/features/content-safety/ui/passport-required-dialog";
import { useNetworkOnline } from "@/features/content-safety/ui/use-network-online";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import styles from "@/features/content-safety/ui/content.module.css";
import boardStyles from "./board-detail.module.css";
import { threadComments } from "../domain/comment-thread";
import commentStyles from "./post-comments.module.css";
const parsePost = (value: unknown) => postSchema.parse((value as { post?: unknown })?.post);
const parseComments = (value: unknown) => commentPageSchema.parse(value);

export function FanPostDetail(props: { postId: string; locale: AppLocale; presentation?: "board";expectedSlug?:string }) {
  const auth = usePrivy(), query = useSearchParams();
  if(query.get('source')==='cheer')return <CheerDetail key={`${props.postId}:${auth.authenticated}:${auth.user?.id}`} postId={props.postId} locale={props.locale} expectedSlug={props.expectedSlug}/>;
  return <DetailForOwner key={`${props.postId}:${props.locale}:${auth.authenticated}:${auth.user?.id}`} {...props} />;
}
function DetailForOwner({ postId, locale, presentation: requestedPresentation }: { postId: string; locale: AppLocale; presentation?: "board" }) {
  const online = useNetworkOnline();
  const copy = contentCopy(locale), auth = usePrivy(), mutation = useContentMutation(locale), fieldId = useId(), router = useRouter(), searchParams = useSearchParams();
  const [cursor, setCursor] = useState<string | null>(null), [replyTarget, setReplyTarget] = useState<{ id: string; nickname: string; body: string } | null>(null);
  const parentId = replyTarget?.id ?? null;
  // K5: drafts live outside render state. Typing re-renders only the composer, never the post, its body or the comment list.
  const drafts = useRef<Record<string, string>>({});
  const attempt = useRef<{ snapshot: string; key: string } | null>(null);
  const replyTrigger = useRef<HTMLButtonElement | null>(null), restoreReplyFocus = useRef(false);
  const post = useCommunityResource(`/api/posts/${postId}?locale=${toContentLocale(locale)}&format=rich`, parsePost);
  const passportRequired = usePassportRequired(mutation.failure, post.state.status === "ready" ? post.state.data.celebritySlug : undefined, locale);
  const comments = useCommunityResource(`/api/posts/${postId}/comments?locale=${toContentLocale(locale)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, parseComments, true, false, false, true);
  // M4-2: a refresh that failed while offline is not shown (the action's own line already says to reconnect); it runs again once online.
  const retryPost = post.retry, retryComments = comments.retry, postStale = post.refreshFailed, commentsStale = comments.refreshFailed;
  useEffect(() => { if (!online) return; if (postStale) retryPost(); if (commentsStale) retryComments(); }, [online]); // eslint-disable-line react-hooks/exhaustive-deps
  const gateSlug = post.state.status === "ready" && auth.authenticated && post.state.data.celebritySlug !== WAVE_FANPAGE_SLUG ? post.state.data.celebritySlug : null;
  const [gateOpen, setGateOpen] = useState(false), rc = postReactionCopy(locale);
  const gated = isMemberGate(useGroupResource(gateSlug ? `/api/celebrities/${gateSlug}/attachment-policy` : null, postAttachmentPolicySchema.parse).failure);
  useEffect(() => {
    if (post.state.status !== "ready") return;
    if (replyTarget) {
      const field = document.getElementById(fieldId);
      field?.focus({ preventScroll: true });
      field?.closest("form")?.scrollIntoView({ block: "nearest" });
    }
    else if (restoreReplyFocus.current) {
      restoreReplyFocus.current = false;
      (replyTrigger.current?.isConnected ? replyTrigger.current : document.getElementById(fieldId))?.focus();
    }
  }, [replyTarget, fieldId, post.state.status]);
  // The comment link on a feed card lands here: at the comment area, ready to type. Only once, and only for that link.
  const anchored = useRef(false);
  useEffect(() => {
    if (post.state.status !== "ready" || !auth.ready || anchored.current || window.location.hash !== "#comments") return;
    anchored.current = true;
    document.getElementById("comments")?.scrollIntoView({ block: "start" });
    document.getElementById(fieldId)?.focus({ preventScroll: true });
  }, [post.state.status, auth.ready, fieldId]);
  const refresh = () => { post.retry(); comments.retry(); };
  /** 261107-2 D7: draw the reply box and focus it inside the tap itself. iOS opens the keyboard only for a focus made during the
   * user's gesture, so a focus from an effect after render looked like a dead button. */
  const openReply = (target: { id: string; nickname: string; body: string }) => {
    flushSync(() => setReplyTarget(target));
    const field = document.getElementById(fieldId);
    field?.focus({ preventScroll: true });
    field?.closest("form")?.scrollIntoView?.({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  async function submit(draft: string) {
    if (gated) { setGateOpen(true); return false; }
    if (mutation.busy || !draft.trim()) return false;
    const value = { body: draft.trim(), parentId }, snapshot = JSON.stringify(value);
    if (!attempt.current || attempt.current.snapshot !== snapshot) attempt.current = { snapshot, key: crypto.randomUUID() };
    const result = await mutation.request(`/api/posts/${postId}/comments`, "POST", { ...value, idempotencyKey: attempt.current.key });
    if (result) {
      const reward = registrationReward(result); if (reward) showMissionRewardToast(locale, "comment", reward); else announceMissionSkip(locale, "comment", result);
      drafts.current[parentId ?? ""] = "";
      restoreReplyFocus.current = Boolean(parentId);
      setReplyTarget(null); setCursor(null); attempt.current = null; refresh();
      return true;
    }
    return false;
  }
  const readDraft = (target: string) => drafts.current[target] ?? "";
  const keepDraft = (target: string, value: string) => { drafts.current[target] = value; };
  const cancelReply = () => { restoreReplyFocus.current = true; setReplyTarget(null); };
  async function remove(id: string) { if (window.confirm(copy.deleteConfirm) && await mutation.request(`/api/post-comments/${id}`, "DELETE")) refresh(); }
  if (post.state.status === "loading") return <><FanSkeletonStatus locale={locale} /><PostDetailSkeleton /></>;
  if (post.state.status !== "ready") return <p role="status" className={styles.status}>{copy.unavailable}<button className={styles.button} onClick={post.retry}>{copy.retry}</button></p>;
  const data = post.state.data, presentation = requestedPresentation ?? (data.bodyDoc ? "board" as const : undefined), requestedReturn = searchParams.get("returnTo"), safeReturn = sanitizeReturnTo(requestedReturn);
  const communityHref = (requestedReturn && (safeReturn !== "/" || requestedReturn === "/") ? safeReturn : hubHref(data.celebritySlug, locale)) as Route;
  const returnTo = `/c/${data.celebritySlug}/community/${postId}?locale=${locale}&returnTo=${encodeURIComponent(communityHref)}`;
  const loginHref = fanLoginHref(locale, returnTo);
  const mutationError = mutation.error && !passportRequired && <p role="alert" className={styles.error}>{mutation.error}{mutation.failure === "auth" && <FanAction href={loginHref} variant="text">{copy.signInAgain}</FanAction>}</p>;
  const composer = <CommentComposer key={parentId ?? ""} fieldId={fieldId} locale={locale} readDraft={readDraft} onDraft={keepDraft} replyTarget={replyTarget} gated={gated} gate={gated && gateOpen ? <MemberGate slug={data.celebritySlug} locale={locale} inline /> : null}
    busy={mutation.busy} error={replyTarget ? mutationError : null} onGate={setGateOpen} onSubmit={submit} onCancel={cancelReply} />;
  return <section className={`${styles.section} ${styles.postDetail} ${presentation === "board" ? boardStyles.detail : ""}`}>
    <FanAction href={communityHref} variant="text" leadingIcon={<ArrowLeft />}>{presentation === "board" ? boardCopy(locale).back : copy.back}</FanAction>
    {presentation !== "board" && <FanHeading as="h1" variant="personal-page">{copy.community}</FanHeading>}{data.celebritySlug === WAVE_FANPAGE_SLUG && <WavePrivacyNotice locale={locale} />}<PostCard presentation={presentation} post={data} locale={locale} returnTo={communityHref} onChanged={refresh} onDeleted={() => router.replace(communityHref)} detail />
    {post.refreshFailed && online && <p role="status" className={styles.status}>{copy.failed}<button type="button" className={styles.button} onClick={post.retry}>{copy.retry}</button></p>}
    <PassportRequiredDialog failure={mutation.failure} slug={data.celebritySlug} locale={locale} onClose={mutation.dismiss} />
    <section id="comments" className={detailStyles.comments} aria-labelledby={`${fieldId}-heading`} data-post-comments=""><h2 id={`${fieldId}-heading`}>{copy.comments} {data.commentCount.toLocaleString(locale)}</h2>
      {auth.ready && (auth.authenticated ? !replyTarget && composer : <div className={detailStyles.commentForm}><Link className={detailStyles.guestField} href={loginHref as Route}>{rc.placeholder}</Link><div className={detailStyles.commentTools}><FanAction href={loginHref} variant="neutral" size="sm">{copy.login}</FanAction></div></div>)}
      {!replyTarget && mutationError}
      {comments.state.status === "ready" ? <>
        {comments.refreshFailed && online && <p role="status" className={styles.status}>{copy.failed}<button type="button" className={styles.button} onClick={comments.retry}>{copy.retry}</button></p>}
        {!comments.state.data.items.length ? null : <ul className={`${commentStyles.list} ${detailStyles.commentList}`}>{threadComments(comments.state.data.items).map(comment => <li key={comment.id} id={`comment-${comment.id}`} data-reply={comment.parentId ? "" : undefined}>
          <div className={detailStyles.commentMeta}><img src={comment.author.avatarUrl} alt="" width={32} height={32} /><strong><ProfileAuthor contentRef={{ kind: "fan_post_comment", id: comment.id }} nickname={comment.author.nickname} avatarUrl={comment.author.avatarUrl}>{comment.author.nickname}</ProfileAuthor></strong>{comment.artist && <GroupArtistMark locale={locale} />}<RelativeTime value={comment.createdAt} locale={locale} />{isEdited(comment) && <EditedMark className={detailStyles.editedMark} locale={locale} />}{!comment.isOwner && <ContentActions targetType="fan_post_comment" targetId={comment.id} locale={locale} onChanged={refresh} />}</div>
          <ContentTranslation sourceText={comment.body} targetType="fan_post_comment" targetId={comment.id} sourceRevision={comment.revision} locale={locale}><p className={styles.body}>{comment.body}</p></ContentTranslation>
          <div className={detailStyles.commentActions}>{auth.authenticated ? <CommentLike commentId={comment.id} locale={locale} reactions={comment.reactions ?? []} /> : auth.ready && <CommentLike commentId={comment.id} locale={locale} reactions={comment.reactions ?? []} loginHref={loginHref} />}{auth.ready && !comment.parentId && (auth.authenticated ? <FanAction variant="text" disabled={mutation.busy} onClick={event => { replyTrigger.current = event.currentTarget; openReply({ id: comment.id, nickname: comment.author.nickname, body: comment.body }); }}>{copy.reply}</FanAction> : <Link className={detailStyles.commentAction} href={loginHref}>{copy.reply}</Link>)}{comment.isOwner && <FanAction variant="text" disabled={mutation.busy} onClick={() => void remove(comment.id)}>{copy.delete}</FanAction>}</div>
          {replyTarget?.id === comment.id && <div className={commentStyles.inlineReply}>{composer}</div>}
        </li>)}</ul>}
        {(cursor || comments.state.data.nextCursor) && <nav className={styles.pagination} aria-label={copy.comments}>{cursor && <button onClick={() => setCursor(null)}>{copy.newest}</button>}{comments.state.data.nextCursor && <button onClick={() => setCursor(comments.state.status === "ready" ? comments.state.data.nextCursor : null)}>{copy.older}</button>}</nav>}
        {replyTarget && !comments.state.data.items.some(comment => comment.id === replyTarget.id) && composer}
      </> : comments.state.status === "loading" ? <><FanSkeletonRows rows={2} variant="member" />{replyTarget && composer}</> : <><p role="status" className={styles.status}>{copy.failed}<button className={styles.button} onClick={comments.retry}>{copy.retry}</button></p>{replyTarget && composer}</>}
    </section>
  </section>;
}

type ComposerProps = { showRewards?: boolean; fieldId: string; locale: AppLocale; readDraft: (target: string) => string; onDraft: (target: string, value: string) => void; replyTarget: { id: string; nickname: string; body: string } | null; gated: boolean; gate: ReactNode;
  busy: boolean; error: ReactNode; onGate: (open: boolean) => void; onSubmit: (draft: string) => Promise<boolean>; onCancel: () => void };
/** K5: the draft is this component's own state, so a keystroke renders only the field, its counter and the send button. The post above
 * and the comment list are not rendered again (they flickered on every letter). The parent keeps the text per target (`onDraft`)
 * without rendering, so moving between the new-comment box and a reply box keeps what was typed. */
export const CommentComposer = memo(function CommentComposer({ showRewards = true, fieldId, locale, readDraft, onDraft, replyTarget, gated, gate, busy, error, onGate, onSubmit, onCancel }: ComposerProps) {
  const copy = contentCopy(locale), rc = postReactionCopy(locale), target = replyTarget?.id ?? "";
  const [draft, setDraft] = useState(() => readDraft(target));
  return <form className={`${commentStyles.composer} ${detailStyles.commentForm}`} data-filled={draft.length > 0 || undefined} data-expanded={replyTarget ? "" : undefined} aria-busy={busy} onSubmit={event => { event.preventDefault(); void onSubmit(draft).then(sent => { if (sent) setDraft(""); }); }}>
    <fieldset className={styles.gateFields}>
    {replyTarget && <div id={`${fieldId}-reply-target`} className={commentStyles.target}>
      <span>{copy.replying}: <strong>{replyTarget.nickname}</strong></span>
      <p>{replyTarget.body.length > 80 ? `${replyTarget.body.slice(0, 80)}…` : replyTarget.body}</p>
    </div>}
    <label className={detailStyles.srOnly} htmlFor={fieldId}>{replyTarget ? copy.reply : copy.newComment}</label>
    {/* A fan without this page's passport sees why only when trying to write (focus or send), not before. */}
    <textarea id={fieldId} rows={1} required maxLength={1000} readOnly={gated} placeholder={rc.placeholder} disabled={busy} value={draft} aria-describedby={replyTarget ? `${fieldId}-reply-target` : undefined} onFocus={() => { if (gated) onGate(true); }} onChange={event => {
      const value = event.target.value;
      onDraft(target, value);
      setDraft(value);
    }} />
    {gate}
    {error}
    <div className={detailStyles.commentTools}>
      <span className={detailStyles.commentCounter}>{draft.length.toLocaleString(locale)} / 1,000</span>
      {replyTarget && <FanAction type="button" variant="text" disabled={busy} onClick={onCancel}>{copy.cancel}</FanAction>}
      {(() => { const send = <FanAction type="submit" variant="neutral" size="sm" ariaBusy={busy} loading={busy} disabled={!gated && !draft.trim()}>{rc.post}</FanAction>; return showRewards ? <EarnBadgeCorner action="comment" locale={locale}>{send}</EarnBadgeCorner> : send; })()}
    </div>
  </fieldset></form>;
});

const parseCheerDetail=(value:unknown)=>z.object({source:z.literal('cheer'),id:z.uuid(),celebritySlug:z.string().min(1),body:z.string().min(1).max(1000)}).strict().parse(value);
function CheerDetail({postId,locale,expectedSlug}:{postId:string;locale:AppLocale;expectedSlug?:string}){
 const copy=contentCopy(locale),query=useSearchParams(),resource=useCommunityResource(`/api/cheers/${postId}?locale=${toContentLocale(locale)}`,parseCheerDetail);
 if(resource.state.status==='loading')return <section className={`${styles.section} ${styles.postDetail}`} aria-busy='true'><FanSkeletonStatus locale={locale}/><FanSkeleton width='60%' height={28}/><FanSkeleton shape='block' height={96}/></section>;
 if(resource.state.status!=='ready')return <p role='status' className={styles.status}>{copy.unavailable}<button className={styles.button} onClick={resource.retry}>{copy.retry}</button></p>;
 const data=resource.state.data;
 if(data.id!==postId||(expectedSlug&&data.celebritySlug!==expectedSlug))return <p role='alert'>{copy.unavailable}</p>;
 const requested=query.get('returnTo'),safe=sanitizeReturnTo(requested),back=(requested&&(safe!=='/'||requested==='/')?safe:hubHref(data.celebritySlug,locale)) as Route;
 const returnTo=`/c/${data.celebritySlug}/community/${postId}?source=cheer&locale=${locale}&returnTo=${encodeURIComponent(back)}`;
 return <section className={`${styles.section} ${styles.postDetail} ${boardStyles.detail}`} data-cheer-detail-id={data.id}>
 <FanAction href={back} variant='text' leadingIcon={<ArrowLeft/>}>{copy.back}</FanAction>
 <FanHeading as='h1' variant='personal-page'>{data.body.split('\n')[0]}</FanHeading>
 <article className={boardStyles.article}><ContentTranslation sourceText={data.body} targetType='cheer' targetId={data.id} locale={locale}><p className={styles.body}>{data.body}</p></ContentTranslation></article>
 <CheerReplies detail cheerId={data.id} slug={data.celebritySlug} locale={locale} returnTo={returnTo} onChanged={resource.retry}/>
 </section>;
}
