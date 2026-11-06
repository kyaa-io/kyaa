"use client";
import { useRef, useState, type FormEvent } from "react";
import { ImagePlus } from "lucide-react";
import { z } from "zod";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { fanLoginHref } from "@/components/login-href";
import { RelativeTime } from "@/components/relative-time";
import { useWaveMediaUpload } from "@/features/content-safety/ui/use-wave-media-upload";
import { EarnBadgeCorner } from "@/features/dukjil/ui/earn-badge";
import { threadComments } from "@/features/fan-posts/domain/comment-thread";
import detailStyles from "@/features/fan-posts/ui/post-detail.module.css";
import editorStyles from "@/components/editor/rich-text.module.css";
import type { AppLocale } from "@/i18n/locales";
import { boardCopy } from "./board-copy";
import { groupsCopy } from "./copy";
import { GroupArtistMark } from "./group-artist-mark";
import { GroupPostAsset } from "./group-post-asset";
import { interactionCopy } from "./interaction-copy";
import { attachmentLabel, managementCopy, sendLabel } from "./management-copy";
import { SourceStatePanel } from "./source-state-panel";
import { useGroupResource } from "./use-group-resource";

const assetsSchema = z.array(z.object({ id: z.uuid(), kind: z.enum(["image", "video"]), width: z.number().nullable().optional(), height: z.number().nullable().optional() })).optional();
const commentsSchema = z.object({ items: z.array(z.object({ id: z.uuid(), body: z.string(), profileId: z.string().nullable(), nickname: z.string(), avatarUrl: z.string().nullable(), anonymous: z.boolean(), artist: z.boolean().optional(), createdAt: z.string(), canDelete: z.boolean().optional(), parentId: z.uuid().nullable().optional(), assets: assetsSchema })), nextCursor: z.string().nullable() });
const parseComments = (value: unknown) => commentsSchema.parse(value);

/** Comments of a group post, in the same tinted area as the fan board. The write box comes first and grows when focused. */
export function GroupPostComments({ pageId, postId, locale, commentCount, canWrite, onJoin, joinPending = false, joinLabel }: { joinLabel?: string; pageId: string; postId: string; locale: AppLocale; commentCount?: number; canWrite: boolean; onJoin?: () => void; joinPending?: boolean }) {
  const t = groupsCopy(locale), b = boardCopy(locale), m = managementCopy(locale), c = interactionCopy(locale), upload = useWaveMediaUpload("group_post", 5), base = `/api/groups/${pageId}/posts/${postId}/comments`;
  const [cursor, setCursor] = useState<string>(), [previous, setPrevious] = useState<{ key: string; items: z.infer<typeof commentsSchema>["items"] }>({ key: "", items: [] }), r = useGroupResource(`${base}${cursor ? `?cursor=${cursor}` : ""}`, parseComments);
  const [draft, setDraft] = useState(""), [parentId, setParentId] = useState<string | null>(null), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), request = useRef<{ signature: string; requestId: string } | undefined>(undefined);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !draft.trim() || upload.busy || upload.items.some(item => item.failed) || (upload.items.length && !upload.ready)) return;
    const input = { body: draft.trim(), parentId, assetIds: upload.items.map(item => item.assetId) }, signature = JSON.stringify(input);
    if (request.current?.signature !== signature) request.current = { signature, requestId: crypto.randomUUID() };
    setBusy(true); setFailed(false);
    try {
      await r.request(base, { method: "POST", body: JSON.stringify({ ...input, requestId: request.current.requestId }) });
      request.current = undefined; setDraft(""); setParentId(null);
      for (const item of upload.items) upload.markUsed(item.key);
      setCursor(undefined); setPrevious({ key: "", items: [] }); r.retry();
    } catch { setFailed(true); } finally { setBusy(false); }
  };
  const comments = [...(previous.key === r.ownerKey ? previous.items : []), ...(r.data?.items ?? [])];
  const ordered = threadComments(comments.map(comment => ({ ...comment, parentId: comment.parentId ?? null })));
  const returnTo = `/pages/groups/${pageId}?locale=${locale}&tab=board&post=${postId}`;
  const notReady = busy || !draft.trim() || upload.busy || upload.items.some(item => item.failed) || Boolean(upload.items.length && !upload.ready);
  return <section className={detailStyles.comments} data-post-comments="">
    <h3>{b.comments} {(commentCount ?? comments.length).toLocaleString(locale)}</h3>
    {canWrite ? <form className={detailStyles.commentForm} data-filled={draft.length > 0 || undefined} onSubmit={submit}>
      {parentId && <div className={detailStyles.commentTools} style={{ justifyContent: "space-between" }}><span className={detailStyles.commentLabel}>{c.reply} · {comments.find(item => item.id === parentId)?.nickname}</span><FanAction variant="text" onClick={() => setParentId(null)}>{t.cancel}</FanAction></div>}
      {!parentId && <label className={detailStyles.commentLabel} htmlFor={`${postId}-comment`}>{b.comments}</label>}
      <textarea id={`${postId}-comment`} aria-label={b.comments} value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} disabled={busy} required rows={2} />
      {upload.items.map(item => <div className={editorStyles.upload} key={item.key}><span>{item.file.name}</span>{item.failed && <FanAction variant="text" onClick={() => upload.retry(item)}>{t.retry}</FanAction>}<FanAction variant="text" onClick={() => upload.remove(item.key)}>{m.remove}</FanAction></div>)}
      {upload.invalid && <p role="alert" className={detailStyles.commentsEmpty}>{t.error}</p>}
      <div className={detailStyles.commentTools}>
        <span className={detailStyles.commentCounter}>{draft.length.toLocaleString(locale)} / 2,000</span>
        <label className={detailStyles.commentAction}><ImagePlus size={18} aria-hidden="true" />{attachmentLabel[locale]}<input className={editorStyles.fileInput} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" multiple disabled={busy || upload.busy} onChange={event => { upload.add(Array.from(event.target.files ?? [])); event.target.value = ""; }} /></label>
        <EarnBadgeCorner action="comment" locale={locale}><FanAction type="submit" variant="neutral" ariaBusy={busy} loading={busy} disabled={notReady}>{sendLabel[locale]}</FanAction></EarnBadgeCorner>
      </div>
    </form> : <div className={detailStyles.commentForm}>
      <span className={detailStyles.commentLabel}>{b.comments}</span><span className={detailStyles.guestField} />
      <div className={detailStyles.commentTools}>{r.authenticated
        ? onJoin ? <FanAction variant="neutral" disabled={joinPending} onClick={onJoin}>{joinLabel ?? t.join}</FanAction> : <FanAction variant="neutral" href={returnTo}>{t.join}</FanAction>
        : <FanAction variant="neutral" href={fanLoginHref(locale, returnTo)}>{t.login}</FanAction>}</div>
    </div>}
    {failed && <p role="alert" className={detailStyles.commentsEmpty}>{t.error}</p>}
    {r.error ? <SourceStatePanel fill sourceId="CqipF" title={locale === "ko" ? "댓글을 불러오지 못했어요" : t.error} description={t.error} role="alert" actions={[{ label: t.retry, onClick: r.retry, variant: "primary" }]} />
      : r.loading && !comments.length ? <FanSkeletonRows rows={2} variant="member" />
      : ordered.length > 0 && <ul className={detailStyles.commentList}>{ordered.map(comment => <li key={comment.id} id={`comment-${comment.id}`} data-reply={comment.parentId ? "" : undefined}>
        <div className={detailStyles.commentMeta}><img src={comment.avatarUrl ?? "/images/avatars/star-pink.webp"} alt="" width={32} height={32} /><strong>{comment.nickname}</strong>{comment.artist && <GroupArtistMark locale={locale} />}<RelativeTime value={comment.createdAt} locale={locale} absolute={(value, language) => new Date(value).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" })} /></div>
        <p>{comment.body}</p>
        {comment.assets?.map(asset => <GroupPostAsset className={detailStyles.commentAsset} key={asset.id} asset={asset} locale={locale} />)}
        <div className={detailStyles.commentActions}>
          {!comment.parentId && (canWrite ? <FanAction variant="text" onClick={() => setParentId(comment.id)}>{c.reply}</FanAction> : !r.authenticated && <a className={detailStyles.commentAction} href={fanLoginHref(locale, returnTo)}>{c.reply}</a>)}
          {comment.canDelete && <FanAction variant="text" onClick={() => { if (window.confirm(c.remove)) void r.request(`${base}/${comment.id}`, { method: "DELETE" }).then(() => { setPrevious({ key: "", items: [] }); setCursor(undefined); r.retry(); }).catch(() => setFailed(true)); }}>{m.remove}</FanAction>}
        </div>
      </li>)}</ul>}
    {r.data?.nextCursor && <FanAction variant="neutral" onClick={() => { setPrevious({ key: r.ownerKey, items: comments }); setCursor(r.data!.nextCursor ?? undefined); }}>{t.more}</FanAction>}
  </section>;
}
