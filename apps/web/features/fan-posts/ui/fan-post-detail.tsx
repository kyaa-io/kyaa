"use client";
import {z} from 'zod';
import {CheerReplies} from './cheer-replies';
import {ActivityPointHint} from "./activity-point-hint";
import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { RelativeTime } from "@/components/relative-time";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { sanitizeReturnTo } from "@/components/login-intent";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { communityHref as hubHref } from "@/features/community/domain/navigation";
import { PointRewardBurst, usePointRewardBurst } from "@/components/fan-ui/point-reward-burst";
import { registrationRewardPoints } from "../domain/registration-reward";
import { postSchema, commentPageSchema } from "../domain/content";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
import { WavePrivacyNotice } from "@/features/fanpage/ui/wave-privacy";
import { MemberGate, isMemberGate } from './member-gate';
import { useGroupResource } from '@/features/groups/ui/use-group-resource';
import { postAttachmentPolicySchema } from '../domain/content';
import { PostCard } from "./post-card";
import { ContentActions, ContentTranslation } from "@/features/content-safety/ui/content-actions";
import { useContentMutation } from "@/features/content-safety/ui/use-content-mutation";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import styles from "@/features/content-safety/ui/content.module.css";
import boardStyles from "./board-detail.module.css";
import commentStyles from "./post-comments.module.css";
const parsePost = (value: unknown) => postSchema.parse((value as { post?: unknown })?.post);
const parseComments = (value: unknown) => commentPageSchema.parse(value);

export function FanPostDetail(props: { postId: string; locale: AppLocale; presentation?: "board";expectedSlug?:string }) {
  const auth = usePrivy(), query = useSearchParams();
  if(query.get('source')==='cheer')return <CheerDetail key={`${props.postId}:${auth.authenticated}:${auth.user?.id}`} postId={props.postId} locale={props.locale} expectedSlug={props.expectedSlug}/>;
  return <DetailForOwner key={`${props.postId}:${props.locale}:${auth.authenticated}:${auth.user?.id}`} {...props} />;
}
function DetailForOwner({ postId, locale, presentation }: { postId: string; locale: AppLocale; presentation?: "board" }) {
  const copy = contentCopy(locale), auth = usePrivy(), mutation = useContentMutation(locale), fieldId = useId(), router = useRouter(), searchParams = useSearchParams();
  const [cursor, setCursor] = useState<string | null>(null), [body, setBody] = useState(""), [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({}), [replyTarget, setReplyTarget] = useState<{ id: string; nickname: string; body: string } | null>(null);
  const parentId = replyTarget?.id ?? null, { burst, add: addReward, clear: clearReward } = usePointRewardBurst();
  const draft = parentId ? replyDrafts[parentId] ?? "" : body;
  const attempt = useRef<{ snapshot: string; key: string } | null>(null);
  const replyTrigger = useRef<HTMLButtonElement | null>(null), restoreReplyFocus = useRef(false);
  const post = useCommunityResource(`/api/posts/${postId}?locale=${toContentLocale(locale)}`, parsePost);
  const comments = useCommunityResource(`/api/posts/${postId}/comments?locale=${toContentLocale(locale)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, parseComments);
  const gateSlug = post.state.status === "ready" && auth.authenticated && post.state.data.celebritySlug !== WAVE_FANPAGE_SLUG ? post.state.data.celebritySlug : null;
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
  const refresh = () => { post.retry(); comments.retry(); };
  async function submit() {
    if (mutation.busy || !draft.trim()) return;
    const value = { body: draft.trim(), parentId }, snapshot = JSON.stringify(value);
    if (!attempt.current || attempt.current.snapshot !== snapshot) attempt.current = { snapshot, key: crypto.randomUUID() };
    const result = await mutation.request(`/api/posts/${postId}/comments`, "POST", { ...value, idempotencyKey: attempt.current.key });
    if (result) {
      const points = registrationRewardPoints(result); if (points) addReward(points);
      if (parentId) setReplyDrafts(previous => ({ ...previous, [parentId]: "" }));
      else setBody("");
      restoreReplyFocus.current = Boolean(parentId);
      setReplyTarget(null); setCursor(null); attempt.current = null; refresh();
    }
  }
  async function remove(id: string) { if (window.confirm(copy.deleteConfirm) && await mutation.request(`/api/post-comments/${id}`, "DELETE")) refresh(); }
  if (post.state.status !== "ready") return <p role="status" className={styles.status}>{post.state.status === "loading" ? copy.loading : copy.unavailable}{post.state.status === "error" && <button className={styles.button} onClick={post.retry}>{copy.retry}</button>}</p>;
  const data = post.state.data, requestedReturn = searchParams.get("returnTo"), safeReturn = sanitizeReturnTo(requestedReturn);
  const communityHref = (requestedReturn && (safeReturn !== "/" || requestedReturn === "/") ? safeReturn : hubHref(data.celebritySlug, locale)) as Route;
  const returnTo = `/c/${data.celebritySlug}/community/${postId}?locale=${locale}&returnTo=${encodeURIComponent(communityHref)}`;
  const composer = <form className={commentStyles.composer} aria-busy={mutation.busy} onSubmit={event => { event.preventDefault(); void submit(); }}>
    {gated && <MemberGate slug={data.celebritySlug} locale={locale} />}<fieldset className={styles.gateFields} disabled={gated}>
    {replyTarget && <div id={`${fieldId}-reply-target`} className={commentStyles.target}>
      <span>{copy.replying}: <strong>{replyTarget.nickname}</strong></span>
      <p>{replyTarget.body.length > 80 ? `${replyTarget.body.slice(0, 80)}…` : replyTarget.body}</p>
    </div>}
    <label className={commentStyles.label} htmlFor={fieldId}>{replyTarget ? copy.reply : copy.newComment}</label>
    {presentation==="board"&&<ActivityPointHint slug={data.celebritySlug} action="comment" locale={locale}/>}
    <textarea id={fieldId} rows={2} required maxLength={1000} disabled={mutation.busy} value={draft} aria-describedby={replyTarget ? `${fieldId}-reply-target` : undefined} onChange={event => {
      const value = event.target.value;
      if (parentId) setReplyDrafts(previous => ({ ...previous, [parentId]: value }));
      else setBody(value);
    }} />
    {mutation.error && replyTarget && <p role="alert" className={styles.error}>{mutation.error}</p>}
    <div className={commentStyles.tools}>
      {presentation==="board"&&<span className={boardStyles.commentCounter}>{draft.length.toLocaleString(locale)} / 1,000</span>}
      {replyTarget && <FanAction type="button" variant="text" disabled={mutation.busy} onClick={() => { restoreReplyFocus.current = true; setReplyTarget(null); }}>{copy.cancel}</FanAction>}
      <FanAction type="submit" variant="neutral" ariaBusy={mutation.busy} loading={mutation.busy} disabled={!draft.trim()}>{mutation.busy ? copy.loading : copy.send}</FanAction>
    </div>
  </fieldset></form>;
  return <section className={`${styles.section} ${styles.postDetail} ${presentation === "board" ? boardStyles.detail : ""}`}>
    {burst && <PointRewardBurst locale={locale} points={burst.points} burstKey={burst.key} onDone={clearReward} />}
    <FanAction href={communityHref} variant="text" leadingIcon={<ArrowLeft />}>{copy.back}</FanAction>
    <FanHeading as="h1" variant="personal-page">{presentation === "board" ? data.body.split("\n")[0] || copy.community : copy.community}</FanHeading>{data.celebritySlug === WAVE_FANPAGE_SLUG && <WavePrivacyNotice locale={locale} />}<PostCard presentation={presentation} post={data} locale={locale} returnTo={communityHref} onChanged={refresh} onDeleted={() => router.replace(communityHref)} detail />
    {post.refreshFailed && <p role="status" className={styles.status}>{copy.failed}<button type="button" className={styles.button} onClick={post.retry}>{copy.retry}</button></p>}
    <section className={styles.section} aria-labelledby={`${fieldId}-heading`}><h2 id={`${fieldId}-heading`}>{copy.comments} {data.commentCount.toLocaleString(locale)}</h2>
      {auth.ready && (auth.authenticated ? !replyTarget && composer : <FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`}>{copy.login}</FanAction>)}
      {mutation.error && !replyTarget && <p role="alert" className={styles.error}>{mutation.error}</p>}
      {comments.state.status === "ready" ? <>
        {comments.refreshFailed && <p role="status" className={styles.status}>{copy.failed}<button type="button" className={styles.button} onClick={comments.retry}>{copy.retry}</button></p>}
        {!comments.state.data.items.length ? null : <ul className={`${styles.list} ${commentStyles.list}`}>{comments.state.data.items.map(comment => <li key={comment.id} id={`comment-${comment.id}`} className={`${styles.card} ${comment.parentId ? styles.reply : ""}`}>
          <div className={`${styles.meta} ${commentStyles.metaRow}`}><img src={comment.author.avatarUrl} alt="" width={28} height={28} /><strong>{comment.author.nickname}</strong>{comment.parentId && <span>{copy.reply}</span>}<RelativeTime value={comment.createdAt} locale={locale} />{!comment.isOwner && <ContentActions targetType="fan_post_comment" targetId={comment.id} locale={locale} onChanged={refresh} />}</div>
          <ContentTranslation sourceText={comment.body} targetType="fan_post_comment" targetId={comment.id} sourceRevision={comment.revision} locale={locale}><p className={styles.body}>{comment.body}</p></ContentTranslation>
          {((auth.authenticated && !comment.parentId) || comment.isOwner) && <div className={styles.actions}>{auth.authenticated && !comment.parentId && <button type="button" disabled={mutation.busy} onClick={event => { replyTrigger.current = event.currentTarget; setReplyTarget({ id: comment.id, nickname: comment.author.nickname, body: comment.body }); }}>{copy.reply}</button>}{comment.isOwner && <button type="button" disabled={mutation.busy} onClick={() => void remove(comment.id)}>{copy.delete}</button>}</div>}
          {replyTarget?.id === comment.id && <div className={commentStyles.inlineReply}>{composer}</div>}
        </li>)}</ul>}
        {(cursor || comments.state.data.nextCursor) && <nav className={styles.pagination} aria-label={copy.comments}>{cursor && <button onClick={() => setCursor(null)}>{copy.newest}</button>}{comments.state.data.nextCursor && <button onClick={() => setCursor(comments.state.status === "ready" ? comments.state.data.nextCursor : null)}>{copy.older}</button>}</nav>}
        {replyTarget && !comments.state.data.items.some(comment => comment.id === replyTarget.id) && composer}
      </> : <><p role="status" className={styles.status}>{comments.state.status === "loading" ? copy.loading : copy.failed}{comments.state.status === "error" && <button className={styles.button} onClick={comments.retry}>{copy.retry}</button>}</p>{replyTarget && composer}</>}
    </section>
  </section>;
}

const parseCheerDetail=(value:unknown)=>z.object({source:z.literal('cheer'),id:z.uuid(),celebritySlug:z.string().min(1),body:z.string().min(1).max(1000)}).strict().parse(value);
function CheerDetail({postId,locale,expectedSlug}:{postId:string;locale:AppLocale;expectedSlug?:string}){
 const copy=contentCopy(locale),query=useSearchParams(),resource=useCommunityResource(`/api/cheers/${postId}?locale=${toContentLocale(locale)}`,parseCheerDetail);
 if(resource.state.status!=='ready')return <p role='status' className={styles.status}>{resource.state.status==='loading'?copy.loading:copy.unavailable}{resource.state.status==='error'&&<button className={styles.button} onClick={resource.retry}>{copy.retry}</button>}</p>;
 const data=resource.state.data;
 if(data.id!==postId||(expectedSlug&&data.celebritySlug!==expectedSlug))return <p role='alert'>{copy.unavailable}</p>;
 const requested=query.get('returnTo'),safe=sanitizeReturnTo(requested),back=(requested&&(safe!=='/'||requested==='/')?safe:hubHref(data.celebritySlug,locale)) as Route;
 const returnTo=`/c/${data.celebritySlug}/community/${postId}?source=cheer&locale=${locale}&returnTo=${encodeURIComponent(back)}`;
 return <section className={`${styles.section} ${styles.postDetail} ${boardStyles.detail}`} data-cheer-detail-id={data.id}>
 <FanAction href={back} variant='text' leadingIcon={<ArrowLeft/>}>{copy.back}</FanAction>
 <FanHeading as='h1' variant='personal-page'>{data.body.split('\n')[0]}</FanHeading>
 <article className={boardStyles.article}><ContentTranslation sourceText={data.body} targetType='cheer' targetId={data.id} locale={locale}><p className={styles.body}>{data.body}</p></ContentTranslation></article>
 <CheerReplies cheerId={data.id} slug={data.celebritySlug} locale={locale} returnTo={returnTo} onChanged={resource.retry}/>
 </section>;
}
