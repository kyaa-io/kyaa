"use client";
import { EarnBadgeCorner } from "@/features/dukjil/ui/earn-badge";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { PointRewardBurst, usePointRewardBurst } from "@/components/fan-ui/point-reward-burst";
import { GroupArtistMark } from "@/features/groups/ui/group-artist-mark";
import { registrationReward } from "../domain/registration-reward";
import { useId, useRef, useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";
import { ActivityPointHint } from "./activity-point-hint";
import { RelativeTime } from "@/components/relative-time";
import { FanAction } from "@/components/fan-ui/fan-action";
import { ContentActions, ContentTranslation } from "@/features/content-safety/ui/content-actions";
import { useContentMutation } from "@/features/content-safety/ui/use-content-mutation";
import { cheerRepliesSchema } from "@/features/fanpage/domain/fan-community";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import styles from "@/features/content-safety/ui/content.module.css";
import detailStyles from "./post-detail.module.css";
import commentStyles from "./post-comments.module.css";

const parse = (value: unknown) => cheerRepliesSchema.parse(value);
export function CheerReplies({ detail = false, cheerId, slug, locale, returnTo, onChanged }: { /** On the cheer's own page it is the same comment area as a post. */ detail?: boolean; cheerId: string; slug: string; locale: AppLocale; returnTo: string; onChanged: () => void }) {
  const auth = useByUsAuth(), copy = contentCopy(locale), mutation = useContentMutation(locale), field = useId();
  const [cursor, setCursor] = useState<string | null>(null), [body, setBody] = useState("");
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const replies = useCommunityResource(`/api/cheers/${cheerId}/replies?locale=${toContentLocale(locale)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, parse);
  const { burst, add: addReward, clear: clearReward } = usePointRewardBurst();
  const refresh = () => { replies.retry(); onChanged(); };
  async function submit() {
    if (mutation.busy || !body.trim()) return;
    const value = body.trim();
    if (attempt.current?.body !== value) attempt.current = { body: value, key: crypto.randomUUID() };
    const result = await mutation.request(`/api/celebrities/${slug}/cheers?locale=${toContentLocale(locale)}`, "POST", { body: value, replyToId: cheerId, idempotencyKey: attempt.current.key });
    if (result) {
      const reward = registrationReward(result); if (reward) addReward(reward.points, reward.stamps);
      setBody(""); setCursor(null); attempt.current = null; notifyFanActivityUpdated(auth.user?.id, ["community"]); refresh();
    }
  }
  async function remove(id: string) {
    if (window.confirm(copy.deleteConfirm) && await mutation.request(`/api/cheers/${id}`, "DELETE")) refresh();
  }
  const total = replies.state.status === "ready" ? replies.state.data.total : undefined;
  return <section id={detail ? "comments" : undefined} className={detail ? detailStyles.comments : styles.section} aria-label={copy.comments} data-post-comments={detail ? "" : undefined}>
    {burst && <PointRewardBurst locale={locale} points={burst.points} stamps={burst.stamps} burstKey={burst.key} onDone={clearReward} />}
    {detail && <h2>{copy.comments}{total === undefined ? "" : ` ${total.toLocaleString(locale)}`}</h2>}
    {auth.ready && (auth.authenticated ? <form className={`${commentStyles.composer} ${detail ? detailStyles.commentForm : ""}`} data-filled={detail && body.length > 0 ? "" : undefined} aria-busy={mutation.busy} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className={detail ? detailStyles.commentLabel : commentStyles.label} htmlFor={field}>{copy.newComment}</label>
      <textarea id={field} rows={2} required maxLength={1000} disabled={mutation.busy} value={body} onChange={event => setBody(event.target.value)} />
      <ActivityPointHint slug={slug} action="comment" locale={locale} />
      <div className={detail ? detailStyles.commentTools : commentStyles.tools}>{detail && <span className={detailStyles.commentCounter}>{body.length.toLocaleString(locale)} / 1,000</span>}<EarnBadgeCorner action="comment" locale={locale}><FanAction type="submit" variant="neutral" ariaBusy={mutation.busy} loading={mutation.busy} disabled={!body.trim()}>{copy.send}</FanAction></EarnBadgeCorner></div>
    </form> : detail ? <div className={detailStyles.commentForm} data-guest-comment-box=""><span className={detailStyles.commentLabel}>{copy.newComment}</span><span className={detailStyles.guestField} /><div className={detailStyles.commentTools}><FanAction variant="neutral" href={`/login?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`}>{copy.login}</FanAction></div></div> : <FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`}>{copy.login}</FanAction>)}
    {mutation.error && <p className={styles.error} role="alert">{mutation.error}</p>}
    {replies.state.status === "ready" ? <>
      {replies.refreshFailed && <p role="status" className={styles.status}>{copy.failed}<button className={styles.button} onClick={replies.retry}>{copy.retry}</button></p>}
      <ul className={detail ? `${commentStyles.list} ${detailStyles.commentList}` : `${styles.list} ${commentStyles.list}`}>{replies.state.data.replies.map(reply => <li key={reply.id} className={detail ? undefined : styles.card}>
        <div className={detail ? detailStyles.commentMeta : `${styles.meta} ${commentStyles.metaRow}`}><img src={reply.avatarUrl} alt="" width={detail ? 32 : 28} height={detail ? 32 : 28} /><strong>{reply.nickname}</strong>{reply.artist && <GroupArtistMark locale={locale} />}<RelativeTime value={reply.createdAt} locale={locale} />{!reply.isOwner && <ContentActions targetType="cheer" targetId={reply.id} locale={locale} onChanged={refresh} />}</div>
        <ContentTranslation sourceText={reply.body} targetType="cheer" targetId={reply.id} locale={locale}><p className={styles.body}>{reply.body}</p></ContentTranslation>
        {reply.isOwner && <div className={styles.actions}><button type="button" disabled={mutation.busy} onClick={() => void remove(reply.id)}>{copy.delete}</button></div>}
      </li>)}</ul>
      {(cursor || replies.state.data.nextCursor) && <nav className={styles.pagination} aria-label={copy.comments}>{cursor && <button onClick={() => setCursor(null)}>{copy.newest}</button>}{replies.state.data.nextCursor && <button onClick={() => setCursor(replies.state.status === "ready" ? replies.state.data.nextCursor : null)}>{copy.older}</button>}</nav>}
    </> : replies.state.status === "loading" ? <FanSkeletonRows rows={2} variant="member" /> : <p role="alert" className={styles.status}>{copy.failed}<button className={styles.button} onClick={replies.retry}>{copy.retry}</button></p>}
  </section>;
}
