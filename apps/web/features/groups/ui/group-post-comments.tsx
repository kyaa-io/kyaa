"use client";
import { useRef, useState, type FormEvent } from "react";
import { Ellipsis, ImagePlus } from "lucide-react";
import { z } from "zod";
import { FanAction, fanActionClassName } from "@/components/fan-ui/fan-action";
import { FanDialog } from "@/components/fan-ui/fan-dialog";
import { FanMenu } from "@/components/fan-ui/fan-menu";
import { showFanToast } from "@/components/fan-ui/fan-toast";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
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
import { groupCommentCopy } from "./group-comment-copy";
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
  const k = groupCommentCopy(locale);
  // The main box writes top-level comments only; a reply has its own box under the comment it answers.
  const [draft, setDraft] = useState(""), [reply, setReply] = useState<{ parentId: string; draft: string } | null>(null), [busy, setBusy] = useState<"comment" | "reply" | null>(null), request = useRef<{ signature: string; requestId: string } | undefined>(undefined);
  const [removing, setRemoving] = useState<string | null>(null), [reporting, setReporting] = useState<{ id: string; reason: string } | null>(null), [actionBusy, setActionBusy] = useState(false);
  const refresh = () => { setCursor(undefined); setPrevious({ key: "", items: [] }); r.retry(); };
  const send = async (kind: "comment" | "reply") => {
    const body = (kind === "reply" ? reply?.draft : draft)?.trim();
    if (busy || !body) return;
    if (kind === "comment" && (upload.busy || upload.items.some(item => item.failed) || (upload.items.length && !upload.ready))) return;
    const input = { body, parentId: kind === "reply" ? reply?.parentId ?? null : null, assetIds: kind === "comment" ? upload.items.map(item => item.assetId) : [] }, signature = JSON.stringify(input);
    if (request.current?.signature !== signature) request.current = { signature, requestId: crypto.randomUUID() };
    setBusy(kind);
    try {
      await r.request(base, { method: "POST", body: JSON.stringify({ ...input, requestId: request.current.requestId }) });
      request.current = undefined;
      if (kind === "reply") setReply(null);
      else { setDraft(""); for (const item of upload.items) upload.markUsed(item.key); }
      refresh();
    } catch { showFanToast({ title: k.saveFailed, tone: "error", action: { label: t.retry, onClick: () => { void send(kind); } } }); } finally { setBusy(null); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void send("comment"); };
  const submitReply = (event: FormEvent) => { event.preventDefault(); void send("reply"); };
  const remove = async () => {
    if (!removing) return;
    setActionBusy(true);
    try { await r.request(`${base}/${removing}`, { method: "DELETE" }); setRemoving(null); refresh(); }
    catch { showFanToast({ title: k.deleteFailed, tone: "error" }); } finally { setActionBusy(false); }
  };
  const report = async () => {
    if (!reporting?.reason.trim()) return;
    setActionBusy(true);
    try { await r.request(`/api/groups/${pageId}/reports`, { method: "POST", body: JSON.stringify({ targetType: "comment", targetId: reporting.id, reason: reporting.reason.trim(), requestId: crypto.randomUUID() }) }); setReporting(null); showFanToast({ title: k.reportSent, tone: "success" }); }
    catch { showFanToast({ title: k.reportFailed, tone: "error" }); } finally { setActionBusy(false); }
  };
  const copyText = (body: string) => { void navigator.clipboard?.writeText(body).then(() => showFanToast({ title: k.copied, tone: "success" }), () => undefined); };
  const comments = [...(previous.key === r.ownerKey ? previous.items : []), ...(r.data?.items ?? [])];
  const ordered = threadComments(comments.map(comment => ({ ...comment, parentId: comment.parentId ?? null })));
  const returnTo = `/pages/groups/${pageId}?locale=${locale}&tab=board&post=${postId}`;
  const notReady = Boolean(busy) || !draft.trim() || upload.busy || upload.items.some(item => item.failed) || Boolean(upload.items.length && !upload.ready);
  return <section className={detailStyles.comments} data-post-comments="">
    <h3>{b.comments} {(commentCount ?? comments.length).toLocaleString(locale)}</h3>
    {canWrite ? <form className={detailStyles.commentForm} data-filled={draft.length > 0 || undefined} onSubmit={submit}>
      <label className={detailStyles.commentLabel} htmlFor={`${postId}-comment`}>{b.comments}</label>
      <textarea id={`${postId}-comment`} aria-label={b.comments} value={draft} onChange={event => setDraft(event.target.value)} maxLength={2000} disabled={busy === "comment"} required rows={2} />
      {upload.items.map(item => <div className={editorStyles.upload} key={item.key} data-failed={item.failed || undefined}><span>{item.file.name}</span>{item.failed && <span role="alert" className={detailStyles.commentUploadError}>{k.uploadFailed}</span>}{item.failed && <FanAction variant="text" onClick={() => upload.retry(item)}>{t.retry}</FanAction>}<FanAction variant="text" onClick={() => upload.remove(item.key)}>{m.remove}</FanAction></div>)}
      {upload.invalid && <p role="alert" className={detailStyles.commentsEmpty}>{t.error}</p>}
      <div className={detailStyles.commentTools}>
        <span className={detailStyles.commentCounter}>{draft.length.toLocaleString(locale)} / 2,000</span>
        <label className={detailStyles.commentAction}><ImagePlus size={18} aria-hidden="true" />{attachmentLabel[locale]}<input className={editorStyles.fileInput} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" multiple disabled={Boolean(busy) || upload.busy} onChange={event => { upload.add(Array.from(event.target.files ?? [])); event.target.value = ""; }} /></label>
        <EarnBadgeCorner action="comment" locale={locale}><FanAction type="submit" variant="neutral" ariaBusy={busy === "comment"} loading={busy === "comment"} disabled={notReady}>{sendLabel[locale]}</FanAction></EarnBadgeCorner>
      </div>
    </form> : <div className={detailStyles.commentForm}>
      <span className={detailStyles.commentLabel}>{b.comments}</span><span className={detailStyles.guestField} />
      <div className={detailStyles.commentTools}>{r.authenticated
        ? onJoin ? <FanAction variant="neutral" disabled={joinPending} onClick={onJoin}>{joinLabel ?? t.join}</FanAction> : <FanAction variant="neutral" href={returnTo}>{t.join}</FanAction>
        : <FanAction variant="neutral" href={fanLoginHref(locale, returnTo)}>{t.login}</FanAction>}</div>
    </div>}
    {r.error ? <SourceStatePanel fill sourceId="CqipF" title={locale === "ko" ? "댓글을 불러오지 못했어요" : t.error} description={t.error} role="alert" actions={[{ label: t.retry, onClick: r.retry, variant: "primary" }]} />
      : r.loading && !comments.length ? <FanSkeletonRows rows={2} variant="member" />
      : ordered.length > 0 && <ul className={detailStyles.commentList}>{ordered.map(comment => <li key={comment.id} id={`comment-${comment.id}`} data-reply={comment.parentId ? "" : undefined}>
        <div className={detailStyles.commentMeta}><img src={comment.avatarUrl ?? "/images/avatars/star-pink.webp"} alt="" width={32} height={32} /><strong>{comment.nickname}</strong>{comment.artist && <GroupArtistMark locale={locale} />}<RelativeTime value={comment.createdAt} locale={locale} absolute={(value, language) => new Date(value).toLocaleString(language, { dateStyle: "medium", timeStyle: "short" })} /></div>
        <p>{comment.body}</p>
        {comment.assets?.map(asset => <GroupPostAsset className={detailStyles.commentAsset} key={asset.id} asset={asset} locale={locale} />)}
        <div className={detailStyles.commentActions}>
          {!comment.parentId && (canWrite ? <FanAction variant="text" aria-expanded={reply?.parentId === comment.id} onClick={() => setReply(reply?.parentId === comment.id ? null : { parentId: comment.id, draft: "" })}>{c.reply}</FanAction> : !r.authenticated && <a className={detailStyles.commentAction} href={fanLoginHref(locale, returnTo)}>{c.reply}</a>)}
          <FanMenu label={k.menu} trigger={<button type="button" className={fanActionClassName("text", { size: "sm" })} aria-label={k.menu}><Ellipsis size={18} aria-hidden="true" /></button>}>
            <FanMenu.Item onSelect={() => copyText(comment.body)}>{k.copy}</FanMenu.Item>
            {r.authenticated && !comment.canDelete && <FanMenu.Item onSelect={() => setReporting({ id: comment.id, reason: "" })}>{b.report}</FanMenu.Item>}
            {comment.canDelete && <FanMenu.Item destructive onSelect={() => setRemoving(comment.id)}>{m.remove}</FanMenu.Item>}
          </FanMenu>
        </div>
        {reply?.parentId === comment.id && <form className={`${detailStyles.commentForm} ${detailStyles.replyForm}`} data-filled={reply.draft.length > 0 || undefined} onSubmit={submitReply}>
          <label className={detailStyles.commentLabel} htmlFor={`${comment.id}-reply`}>{k.replyTo.replace("{0}", comment.nickname)}</label>
          <textarea id={`${comment.id}-reply`} value={reply.draft} onChange={event => setReply({ parentId: comment.id, draft: event.target.value })} maxLength={2000} disabled={busy === "reply"} required rows={2} autoFocus />
          <div className={detailStyles.commentTools}>
            <span className={detailStyles.commentCounter}>{reply.draft.length.toLocaleString(locale)} / 2,000</span>
            <FanAction variant="text" onClick={() => setReply(null)}>{t.cancel}</FanAction>
            <FanAction type="submit" variant="neutral" ariaBusy={busy === "reply"} loading={busy === "reply"} disabled={Boolean(busy) || !reply.draft.trim()}>{sendLabel[locale]}</FanAction>
          </div>
        </form>}
      </li>)}</ul>}
    {r.data?.nextCursor && <FanAction variant="neutral" onClick={() => { setPrevious({ key: r.ownerKey, items: comments }); setCursor(r.data!.nextCursor ?? undefined); }}>{t.more}</FanAction>}
    <FanDialog open={removing !== null} onOpenChange={open => { if (!open) setRemoving(null); }} alert size="sm" title={k.deleteTitle} closeLabel={fanUiText(locale, "close")} primary={{ label: m.remove, onClick: () => { void remove(); }, loading: actionBusy, variant: "danger" }} secondary={{ label: t.cancel, onClick: () => setRemoving(null) }}>{null}</FanDialog>
    <FanDialog open={reporting !== null} onOpenChange={open => { if (!open) setReporting(null); }} size="sm" title={b.report} closeLabel={fanUiText(locale, "close")} primary={{ label: b.report, onClick: () => { void report(); }, loading: actionBusy, disabled: !reporting?.reason.trim() }} secondary={{ label: t.cancel, onClick: () => setReporting(null) }}>
      <label className={detailStyles.commentLabel} htmlFor={`${postId}-report`}>{b.reason}</label>
      <textarea id={`${postId}-report`} className={detailStyles.reportReason} value={reporting?.reason ?? ""} onChange={event => setReporting(current => current && { ...current, reason: event.target.value })} maxLength={1000} rows={3} />
    </FanDialog>
  </section>;
}
