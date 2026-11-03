"use client";
import { useId, useRef, useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";
import { ActivityPointHint } from "./activity-point-hint";
import { FanAction } from "@/components/fan-ui/fan-action";
import { ContentActions, ContentTranslation } from "@/features/content-safety/ui/content-actions";
import { useContentMutation } from "@/features/content-safety/ui/use-content-mutation";
import { cheerRepliesSchema } from "@/features/fanpage/domain/fan-community";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import styles from "@/features/content-safety/ui/content.module.css";
import commentStyles from "./post-comments.module.css";

const parse = (value: unknown) => cheerRepliesSchema.parse(value);
export function CheerReplies({ cheerId, slug, locale, returnTo, onChanged }: { cheerId: string; slug: string; locale: AppLocale; returnTo: string; onChanged: () => void }) {
  const auth = useByUsAuth(), copy = contentCopy(locale), mutation = useContentMutation(locale), field = useId();
  const [cursor, setCursor] = useState<string | null>(null), [body, setBody] = useState("");
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const replies = useCommunityResource(`/api/cheers/${cheerId}/replies?locale=${toContentLocale(locale)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, parse);
  const refresh = () => { replies.retry(); onChanged(); };
  async function submit() {
    if (mutation.busy || !body.trim()) return;
    const value = body.trim();
    if (attempt.current?.body !== value) attempt.current = { body: value, key: crypto.randomUUID() };
    if (await mutation.request(`/api/celebrities/${slug}/cheers?locale=${toContentLocale(locale)}`, "POST", { body: value, replyToId: cheerId, idempotencyKey: attempt.current.key })) {
      setBody(""); setCursor(null); attempt.current = null; notifyFanActivityUpdated(auth.user?.id, ["community"]); refresh();
    }
  }
  async function remove(id: string) {
    if (window.confirm(copy.deleteConfirm) && await mutation.request(`/api/cheers/${id}`, "DELETE")) refresh();
  }
  return <section className={styles.section} aria-label={copy.comments}>
    {auth.ready && (auth.authenticated ? <form className={commentStyles.composer} aria-busy={mutation.busy} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className={commentStyles.label} htmlFor={field}>{copy.newComment}</label>
      <textarea id={field} rows={2} required maxLength={1000} disabled={mutation.busy} value={body} onChange={event => setBody(event.target.value)} />
      <ActivityPointHint slug={slug} action="comment" locale={locale} />
      <div className={commentStyles.tools}><FanAction type="submit" variant="neutral" ariaBusy={mutation.busy} disabled={mutation.busy || !body.trim()}>{mutation.busy ? copy.loading : copy.send}</FanAction></div>
    </form> : <FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(returnTo)}`}>{copy.login}</FanAction>)}
    {mutation.error && <p className={styles.error} role="alert">{mutation.error}</p>}
    {replies.state.status === "ready" ? <>
      {replies.refreshFailed && <p role="status" className={styles.status}>{copy.failed}<button className={styles.button} onClick={replies.retry}>{copy.retry}</button></p>}
      <ul className={`${styles.list} ${commentStyles.list}`}>{replies.state.data.replies.map(reply => <li key={reply.id} className={styles.card}>
        <div className={styles.meta}><img src={reply.avatarUrl} alt="" width={28} height={28} /><strong>{reply.nickname}</strong><time dateTime={reply.createdAt}>{new Intl.DateTimeFormat(locale, { calendar: "gregory", dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(reply.createdAt))}</time></div>
        <ContentTranslation sourceText={reply.body} targetType="cheer" targetId={reply.id} locale={locale}><p className={styles.body}>{reply.body}</p></ContentTranslation>
        <div className={styles.actions}>{reply.isOwner ? <button type="button" disabled={mutation.busy} onClick={() => void remove(reply.id)}>{copy.delete}</button> : <ContentActions targetType="cheer" targetId={reply.id} locale={locale} onChanged={refresh} />}</div>
      </li>)}</ul>
      {(cursor || replies.state.data.nextCursor) && <nav className={styles.pagination} aria-label={copy.comments}>{cursor && <button onClick={() => setCursor(null)}>{copy.newest}</button>}{replies.state.data.nextCursor && <button onClick={() => setCursor(replies.state.status === "ready" ? replies.state.data.nextCursor : null)}>{copy.older}</button>}</nav>}
    </> : <p role={replies.state.status === "error" ? "alert" : "status"} className={styles.status}>{replies.state.status === "loading" ? copy.loading : copy.failed}{replies.state.status === "error" && <button className={styles.button} onClick={replies.retry}>{copy.retry}</button>}</p>}
  </section>;
}
