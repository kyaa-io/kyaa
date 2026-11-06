"use client";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { editorText } from "@/components/editor/editor-copy";
import { LazyRichEditor } from "@/components/editor/lazy-rich-editor";
import { useRichPostBody } from "@/components/editor/use-rich-post-body";
import { useRichPostUploads } from "@/components/editor/use-rich-post-uploads";
import type { RichAttachment } from "@/components/editor/rich-document";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import type { AppLocale } from "@/i18n/locales";
import { GroupPostAsset } from "./group-post-asset";
import editorStyles from "@/components/editor/rich-text.module.css";

export type GroupPostAssetRef = { id: string; kind: "image" | "video"; width?: number | null; height?: number | null };
export const GROUP_POST_BODY_MAX = 20000;
export const GROUP_POST_MEDIA_MAX = 5;

/**
 * Body field of a group post, for the board write form and the operator notice form (same `group_posts` row, same route).
 * Put `field` in the form and send `submission(title)` with the rest of the input. `blocked` is true while it cannot be sent.
 * Call `commit()` after the save succeeds. It owns uploads and their limits: 5 photos or 1 video, photo 8MB, mp4/mov 50MB.
 */
export function useGroupPostBody({ locale, label, placeholder, disabled = false, initial }: { locale: AppLocale; label: string; placeholder?: string; disabled?: boolean; initial?: { body?: string; bodyDoc?: unknown; bodyDocUnavailable?: boolean; assets?: readonly GroupPostAssetRef[] } }) {
  const body = useRichPostBody(useMemo(() => ({ body: initial?.body, bodyDoc: initial?.bodyDoc, attachments: (initial?.assets ?? []).map(asset => ({ assetId: asset.id, kind: asset.kind })) }), [initial?.body, initial?.bodyDoc, initial?.assets]));
  const uploads = useRichPostUploads({ purpose: "group_post", limit: GROUP_POST_MEDIA_MAX, body });
  const [limited, setLimited] = useState(false);
  const existing = useMemo(() => new Map((initial?.assets ?? []).map(asset => [asset.id, asset])), [initial?.assets]);
  const { previewOf } = uploads;
  const renderAttachment = useCallback((attachment: RichAttachment): ReactNode => {
    const preview = previewOf(attachment.assetId);
    if (preview) return attachment.kind === "video" ? <video src={preview} controls playsInline preload="metadata" /> : <img src={preview} alt="" />;
    const asset = existing.get(attachment.assetId);
    return asset ? <GroupPostAsset asset={asset} locale={locale} /> : null;
  }, [previewOf, existing, locale]);
  const add = (files: File[]) => {
    const attached = body.latestAttachments.current, hasVideo = attached.some(item => item.kind === "video"), addsVideo = files.some(file => file.type.startsWith("video/"));
    if (hasVideo || (addsVideo && (attached.length > 0 || files.length > 1)) || attached.length + uploads.pendingItems.length + files.length > GROUP_POST_MEDIA_MAX) { setLimited(true); return; }
    setLimited(false);
    uploads.add(files);
  };
  const showLimit = limited || uploads.invalid, unavailable = Boolean(initial?.bodyDocUnavailable), tooLong = body.plainText.length > GROUP_POST_BODY_MAX;
  const field = unavailable ? <p role="alert" style={{ margin: 0, color: "var(--color-error)", fontSize: 13, lineHeight: "20px" }}>{editorText(locale, "bodyDocUnavailable")}</p> : <>
    <LazyRichEditor label={label} value={body.value} onChange={body.onChange} handleRef={body.handle} locale={locale} placeholder={placeholder} disabled={disabled} invalid={body.tooLarge} length={body.plainText.length} maxLength={GROUP_POST_BODY_MAX} media={{
      onPickPhotos: add,
      onPickVideo: file => add([file]),
      renderAttachment,
      status: uploads.pendingItems.length ? <div className={editorStyles.uploads}>{uploads.pendingItems.map(item => <div key={item.key} className={editorStyles.upload} role={item.failed ? "alert" : "status"}><span>{editorText(locale, item.failed ? "uploadFailed" : "uploading", [item.file.name])}</span>{item.failed ? <FanAction variant="text" onClick={() => uploads.retry(item)}>{editorText(locale, "retry")}</FanAction> : <FanSkeleton width={64} height={8} />}<FanAction variant="text" onClick={() => uploads.remove(item.key)}>{editorText(locale, "remove")}</FanAction></div>)}</div> : undefined,
    }} />
    {showLimit && <p role="alert" style={{ margin: 0, color: "var(--color-error)", fontSize: 13, lineHeight: "20px" }}>{editorText(locale, "mediaLimit", [GROUP_POST_MEDIA_MAX])}</p>}
    {(body.tooLarge || tooLong) && <p role="alert" style={{ margin: 0, color: "var(--color-error)", fontSize: 13, lineHeight: "20px" }}>{editorText(locale, body.tooLarge ? "documentTooLarge" : "tooLong")}</p>}
  </>;
  return {
    field,
    busy: uploads.busy,
    dirty: body.dirty,
    hasContent: body.hasContent,
    blocked: unavailable || uploads.busy || uploads.failed || !body.document || !body.hasContent || tooLong,
    /** Send with title, visibility and category. The server makes `body` from the document, so the same text is not sent twice. */
    submission: () => ({ bodyDoc: body.document, assetIds: body.attachments.map(item => item.assetId) }),
    commit: uploads.commit,
  };
}
