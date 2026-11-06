"use client";
import { EarnBadgeCorner } from "@/features/dukjil/ui/earn-badge";
import { LazyRichEditor } from "@/components/editor/lazy-rich-editor";
import { useRichPostBody } from "@/components/editor/use-rich-post-body";
import { editorText } from "@/components/editor/editor-copy";
import type { RichAttachment } from "@/components/editor/rich-document";
import editorStyles from "@/components/editor/rich-text.module.css";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import {ActivityPointHint} from "./activity-point-hint";
import {SourceDiscardDialog} from "@/features/groups/ui/source-confirm-dialog";
import { throwIfAborted } from "@/features/reliability/client/throw-if-aborted";
import { WAVE_FANPAGE_SLUG, type WaveProgramKey } from "@/features/fanpage/domain/wave-programs";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ImagePlus } from "lucide-react";
import { discoveryCopy } from "@/i18n/catalogs/features__fan_posts__discovery";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { assetSchema, type ContentAsset, type FanPost } from "../domain/content";
import { AuthenticatedMedia } from "@/features/content-safety/ui/authenticated-media";
import { useWaveMediaUpload } from "@/features/content-safety/ui/use-wave-media-upload";
import { waveMediaCopy } from "@/i18n/catalogs/features__fanpage__wave-media";
import { ContentAssetImage } from "@/features/content-safety/ui/content-asset";
import { useContentMutation } from "@/features/content-safety/ui/use-content-mutation";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import type { AppLocale } from "@/i18n/locales";
import { waveEngagementCopy } from "@/i18n/catalogs/features__fanpage__wave-engagement";
import { wavePrivacyCopy } from "@/i18n/catalogs/features__fanpage__wave-privacy";
import { MAX_POST_PHOTO_BYTES, preparePostPhoto } from "./prepare-post-photo";
import {useGroupRequest,useGroupResource} from '@/features/groups/ui/use-group-resource';
import {postAttachmentPolicySchema} from '../domain/content';
import {MemberGate,isMemberGate} from './member-gate';
import {fanBoardMediaCopy} from './fan-board-media-copy';
import boardStyles from "./board-composer.module.css";
import { managementCopy } from "@/features/groups/ui/management-copy";
import { registrationRewardPoints } from "../domain/registration-reward";
import styles from "@/features/content-safety/ui/content.module.css";

type PostComposerProps = { board?: boolean; introduction?: boolean; program?: WaveProgramKey; slug: string; locale: AppLocale; post?: FanPost; onSaved: (reward?: { points: number }) => void; onCancel?: () => void; featured?: boolean; autoFocus?: boolean; allowMembers?: boolean };
export function PostComposer(props:PostComposerProps){const auth=useGroupRequest();return <PostComposerForOwner key={`${auth.ownerKey}:${props.slug}:${props.post?.id??'new'}`} {...props}/>;}
function PostComposerForOwner({ board = false, introduction = false, program, slug, locale, post, onSaved, onCancel, featured = false, autoFocus = false, allowMembers = true }:PostComposerProps){
  const introductionCopy = wavePrivacyCopy(locale), isWave = slug === WAVE_FANPAGE_SLUG;
  const insightCopy = program === "live-insight" ? waveEngagementCopy(locale) : null;
  const requireBody = introduction || Boolean(program);
  const policy=useGroupResource(isWave||program?null:`/api/celebrities/${slug}/attachment-policy`,postAttachmentPolicySchema.parse),sourceMedia=fanBoardMediaCopy(locale);
  const gated=isMemberGate(policy.failure),policyReady=isWave||Boolean(program)||Boolean(policy.data),photoLimit=policy.data?.photoLimit??4,allowVideo=isWave||Boolean(!program&&policy.data?.videoAllowed);
  const videoUploads = useWaveMediaUpload(isWave?'wave_post':'fan_post', 1), mediaCopy = waveMediaCopy(locale);
  const videoInput = useRef<HTMLInputElement>(null);
  const [existingVideo, setExistingVideo] = useState(post?.video ?? null),[videoPlaying,setVideoPlaying]=useState(false);
  const uploadedVideo = videoUploads.items[0]?.media;
  const video = uploadedVideo?.state === "ready" && uploadedVideo.kind === "video" && uploadedVideo.width && uploadedVideo.height && uploadedVideo.durationSeconds ? { id: uploadedVideo.assetId, width: uploadedVideo.width, height: uploadedVideo.height, durationSeconds: uploadedVideo.durationSeconds } : existingVideo;
  const hasVideo = Boolean(video || videoUploads.items.length);
  const copy = contentCopy(locale), mutation = useContentMutation(locale), fieldId = useId();
  const rich = useRichPostBody(useMemo(() => {
    const storedLines = board ? post?.body.split("\n").slice(1).join("\n") ?? "" : "";
    const attachments: RichAttachment[] = [...(post?.assets ?? []).map(asset => ({ assetId: asset.id, kind: "image" as const })), ...(post?.video ? [{ assetId: post.video.id, kind: "video" as const }] : [])];
    return { body: storedLines, bodyDoc: post?.bodyDoc, attachments };
  }, [board, post]));
  const auth = usePrivy(), session = useByUsSession();
  const [title, setTitle] = useState(board ? post?.body.split("\n")[0] ?? "" : "");
  const [body, setBody] = useState(board ? post?.body.split("\n").slice(1).join("\n") ?? "" : post?.body ?? ""), [visibility, setVisibility] = useState<"public" | "members">(post?.visibility ?? "public");
  const [assets, setAssets] = useState<ContentAsset[]>(post?.assets ?? []), [problem, setProblem] = useState(""), [visibilityOpen, setVisibilityOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false), photoInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false),[discardOpen,setDiscardOpen]=useState(false);
  const [failedPhotos, setFailedPhotos] = useState<File[]>([]);
  const uploadPending = useRef<AbortController | null>(null);
  useEffect(() => () => uploadPending.current?.abort(), [session.ownerId, session.generation]);
  const busy = mutation.busy || uploading, submitReady = policyReady || (!assets.length && !hasVideo);
  const photoBlocked = hasVideo || assets.length >= photoLimit, blockedMessage = photoLimit===10?sourceMedia.limit:copy.photoLimit;
  useEffect(() => { setProblem(current => current === blockedMessage ? "" : current); }, [assets.length, hasVideo, blockedMessage]);
  const attempt = useRef<{ snapshot: string; key: string } | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 47.999rem)");
    const sync = () => setIsMobile(media.matches);
    sync(); media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  // In the board editor the document decides what stays attached: a node taken out of it takes its file with it.
  const insertedVideo = useRef(post?.video?.id ?? null);
  useEffect(() => {
    if (!board || !uploadedVideo || uploadedVideo.state !== "ready" || uploadedVideo.kind !== "video" || insertedVideo.current === uploadedVideo.assetId) return;
    insertedVideo.current = uploadedVideo.assetId;
    rich.insertAttachment({ assetId: uploadedVideo.assetId, kind: "video" });
  }, [board, uploadedVideo, rich.insertAttachment]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!board) return;
    const present = new Set(rich.latestAttachments.current.map(item => item.assetId));
    setAssets(current => current.every(asset => present.has(asset.id)) ? current : current.filter(asset => present.has(asset.id)));
    if (insertedVideo.current && !present.has(insertedVideo.current)) {
      insertedVideo.current = null;
      setExistingVideo(null);
      videoUploads.items.forEach(item => videoUploads.remove(item.key));
    }
  }, [board, rich.attachments]); // eslint-disable-line react-hooks/exhaustive-deps
  const renderAttachment = useCallback((attachment: RichAttachment) => {
    if (attachment.kind === "video") {
      const file = videoUploads.items.find(item => item.media?.assetId === attachment.assetId)?.file;
      if (file) return <LocalVideoPreview file={file} />;
      return post?.video ? <AuthenticatedMedia asset={{ ...post.video, kind: "video" }} locale={locale} alt={mediaCopy.play} /> : null;
    }
    const asset = assets.find(item => item.id === attachment.assetId);
    return asset ? <ContentAssetImage asset={asset} locale={locale} alt={copy.photo} /> : null;
  }, [assets, videoUploads.items, post, locale, mediaCopy.play, copy.photo]);
  async function upload(files: FileList | File[] | null) {
    if (!policyReady || !files?.length || hasVideo || uploadPending.current || mutation.busy) return;
    const selectedFiles = Array.from(files);
    if (selectedFiles.length + assets.length > photoLimit || selectedFiles.some(file => file.size > MAX_POST_PHOTO_BYTES)) { setProblem(photoLimit===10?sourceMedia.limit:copy.photoLimit); return; }
    setProblem("");
    setFailedPhotos([]);
    let completed = 0;
    const controller = new AbortController();
    uploadPending.current = controller;
    setUploading(true);
    try {
      for (const file of selectedFiles) {
        const prepared = await preparePostPhoto(file);
        throwIfAborted(controller.signal);
        const form = new FormData(); form.set("file", prepared); form.set("celebritySlug", slug);
        const result = await mutation.request("/api/content-assets", "POST", form);
        throwIfAborted(controller.signal);
        if (!result) throw new Error("UPLOAD_FAILED");
        const parsed = assetSchema.safeParse((result as { asset?: unknown } | null)?.asset);
        if (!parsed.success) throw new Error("UPLOAD_FAILED");
        setAssets(current => [...current, parsed.data]);
        if (board) rich.insertAttachment({ assetId: parsed.data.id, kind: "image" });
        completed += 1;
      }
    } catch {
      if (!controller.signal.aborted) { setProblem(copy.photoUploadFailed); setFailedPhotos(selectedFiles.slice(completed)); }
    } finally {
      uploadPending.current = null;
      setUploading(false);
    }
  }

  async function save() {
    if (!submitReady || assets.length>photoLimit || (hasVideo&&!allowVideo) || uploadPending.current || mutation.busy || videoUploads.busy || videoUploads.items.some(item => item.failed || item.media?.state !== "ready" || item.media.kind!=="video") || (requireBody && !body.trim())) return;
    const combinedBody = board ? `${title.trim()}\n${rich.plainText}`.trim() : body.trim();
    if (board && (!title.trim() || combinedBody.length > 5000 || !rich.document)) return;
    const value = board
      // The first line is the title. The server makes the rest of `body` from the document, so the same text is not sent twice.
      ? { body: title.trim(), visibility: allowMembers && !program && !isWave ? visibility : "public", assetIds: rich.attachments.map(item => item.assetId), bodyDoc: rich.document }
      : { body: combinedBody, visibility: allowMembers && !program && !isWave ? visibility : "public", assetIds: [...assets.map(asset => asset.id), ...(video ? [video.id] : [])] }, snapshot = JSON.stringify(value);
    if (!attempt.current || attempt.current.snapshot !== snapshot) attempt.current = { snapshot, key: crypto.randomUUID() };
    const result = post ? await mutation.request(`/api/posts/${post.id}`, "PATCH", { ...value, expectedRevision: post.revision })
      : await mutation.request(program ? `/api/celebrities/${slug}/programs/${program}/posts` : `/api/celebrities/${slug}/posts`, "POST", { ...value, idempotencyKey: attempt.current.key });
    if (result) { setBody(""); setAssets([]); setExistingVideo(null); if (board) rich.reset(); videoUploads.items.forEach(item => videoUploads.markUsed(item.key)); attempt.current = null; if (!post) notifyFanActivityUpdated(session.ownerId ?? auth.user?.id); const points = post ? undefined : registrationRewardPoints(result); onSaved(points ? { points } : undefined); }
  }
  return <>{discardOpen&&<SourceDiscardDialog sourceId="RS2uz" locale={locale} pending={busy} onContinue={()=>setDiscardOpen(false)} onDiscard={()=>{setDiscardOpen(false);onCancel?.();}}/>}<form data-post-composer="" className={`${styles.composer}${featured ? ` ${styles.composerFeatured}` : ""}${board ? ` ${boardStyles.composer}` : ""}`} onSubmit={event => { event.preventDefault(); void save(); }}>
    {gated&&<MemberGate slug={slug} locale={locale}/>}<fieldset className={styles.gateFields} disabled={gated}>
    {board && <label htmlFor={`${fieldId}-title`}>{managementCopy(locale).title}<input id={`${fieldId}-title`} required maxLength={5000} value={title} disabled={busy} autoFocus={autoFocus} onChange={event => setTitle(event.target.value)} /></label>}
    {board ? <div className={boardStyles.richField}><span className={boardStyles.richLabel}>{managementCopy(locale).body}</span><LazyRichEditor label={managementCopy(locale).body} value={rich.value} onChange={rich.onChange} handleRef={rich.handle} locale={locale} placeholder={discoveryCopy(locale).writePrompt} disabled={busy} invalid={rich.tooLarge} length={rich.plainText.length} maxLength={Math.max(0, 4999 - title.length)} media={{
      onPickPhotos: files => void upload(files),
      disabled: !policyReady,
      photoBlocked,
      onPickVideo: allowVideo ? file => { if (!["video/mp4", "video/quicktime"].includes(file.type)) { setProblem(mediaCopy.videoLimit); return; } setProblem(""); videoUploads.add([file]); } : undefined,
      videoBlocked: assets.length > 0 || hasVideo,
      onBlocked: () => setProblem(blockedMessage),
      renderAttachment,
      status: (uploading || videoUploads.items.some(item => item.failed || item.media?.state !== "ready")) ? <div className={editorStyles.uploads}>
        {uploading && <div className={editorStyles.upload} role="status"><span>{editorText(locale, "uploading", [editorText(locale, "photo")])}</span><FanSkeleton width={64} height={8} /></div>}
        {videoUploads.items.filter(item => item.failed || item.media?.state !== "ready").map(item => <div key={item.key} className={editorStyles.upload} role={item.failed ? "alert" : "status"}><span>{editorText(locale, item.failed ? "uploadFailed" : "uploading", [item.file.name])}</span>{item.failed ? <FanAction variant="text" onClick={() => videoUploads.retry(item)}>{editorText(locale, "retry")}</FanAction> : <FanSkeleton width={64} height={8} />}<FanAction variant="text" onClick={() => videoUploads.remove(item.key)}>{editorText(locale, "remove")}</FanAction></div>)}
      </div> : undefined,
    }} /></div> : <label htmlFor={`${fieldId}-body`}>{post ? copy.edit : introduction ? introductionCopy.introductionLabel : insightCopy?.insightTitle ?? copy.writePost}<textarea required={requireBody} id={`${fieldId}-body`} rows={3} autoFocus={autoFocus && !board} placeholder={introduction ? introductionCopy.introductionPrompt : insightCopy?.insightPrompt ?? discoveryCopy(locale).writePrompt} maxLength={board ? Math.max(0, 4999 - title.length) : 5000} value={body} disabled={busy} onChange={event => setBody(event.target.value)} /></label>}
    {isWave && <p className={styles.hint}>{introductionCopy.notice}</p>}
    {!board && assets.length > 0 && <div className={styles.photos}>{assets.map(asset => <figure key={asset.id}>
      <ContentAssetImage asset={asset} locale={locale} alt={copy.photo} /><button type="button" className={styles.button} disabled={busy} onClick={() => setAssets(current => current.filter(item => item.id !== asset.id))}>{copy.delete}</button>
    </figure>)}</div>}
    {!board && video && <figure><AuthenticatedMedia asset={{ ...video, kind: "video" }} locale={locale} alt={mediaCopy.play} play={videoPlaying}/>{!videoPlaying&&<button type="button" data-media-play aria-label={mediaCopy.play} onClick={()=>setVideoPlaying(true)}>▶</button>}<button type="button" disabled={busy} onClick={() => { setExistingVideo(null);setVideoPlaying(false); videoUploads.items.forEach(item => videoUploads.remove(item.key)); }}>{copy.delete}</button></figure>}
    {!board && videoUploads.items.map(item => (item.media?.state !== "ready" || item.media.kind!=="video") && <div key={item.key} role="status">{item.failed || item.media?.state==="ready"&&item.media.kind!=="video" ? copy.failed : copy.loading}{item.failed && <button type="button" onClick={() => videoUploads.retry(item)}>{copy.retry}</button>}<button type="button" onClick={() => videoUploads.remove(item.key)}>{copy.delete}</button></div>)}
    <div className={styles.composerTools}>
      {allowMembers && !program && !isWave && <button type="button" className={styles.visibilityTrigger} disabled={busy} aria-label={`${copy.visibility}: ${copy[visibility]}`} aria-haspopup="dialog" aria-expanded={visibilityOpen} onClick={() => setVisibilityOpen(true)}>
        <span>{copy.visibility}</span><strong>{copy[visibility]}</strong><ChevronDown size={16} aria-hidden="true" />
      </button>}
      {!board && allowVideo && <div className={styles.photoPicker}><button type="button" disabled={!policyReady || busy} aria-disabled={assets.length > 0 || hasVideo || undefined} aria-describedby={problem ? `${fieldId}-photo-error` : undefined} onClick={() => { if (assets.length > 0 || hasVideo) { setProblem(blockedMessage); return; } videoInput.current?.click(); }}>{!isWave?sourceMedia.video:mediaCopy.uploadVideo}</button><input ref={videoInput} type="file" accept="video/mp4,video/quicktime" aria-label={!isWave?sourceMedia.video:mediaCopy.uploadVideo} disabled={!policyReady || busy || assets.length > 0 || hasVideo} onChange={event => { const files=Array.from(event.target.files ?? []);event.target.value="";if(files.length!==1||files.some(file=>!["video/mp4","video/quicktime"].includes(file.type))){setProblem(mediaCopy.videoLimit);return;}setProblem("");setVideoPlaying(false);videoUploads.add(files); }} /></div>}
      {!board && <div className={styles.photoPicker}>
        <button type="button" disabled={!policyReady || busy} aria-disabled={photoBlocked || undefined} aria-describedby={problem ? `${fieldId}-photo-error` : undefined} onClick={() => { if (photoBlocked) { setProblem(blockedMessage); return; } photoInput.current?.click(); }}><ImagePlus size={18} aria-hidden="true" /><span>{introduction ? introductionCopy.optionalPhoto : photoLimit===10?sourceMedia.photos:copy.photos}{assets.length ? ` · ${assets.length}${policyReady?`/${photoLimit}`:""}` : ""}</span></button>
        <input ref={photoInput} type="file" tabIndex={-1} accept="image/jpeg,image/png,image/webp" multiple disabled={!policyReady || busy || hasVideo || assets.length >= photoLimit} aria-label={introduction ? introductionCopy.optionalPhoto : photoLimit===10?sourceMedia.photos:copy.photos} aria-describedby={problem ? `${fieldId}-photo-error` : undefined} aria-invalid={problem ? true : undefined} onChange={event => { void upload(event.target.files); event.target.value = ""; }} />
      </div>}
    </div>
    {allowMembers && !program && !isWave && visibilityOpen && <AccessibleOverlay open onClose={() => setVisibilityOpen(false)} labelledBy={`${fieldId}-visibility-title`} backdropClassName={styles.visibilityBackdrop} contentClassName={styles.visibilityDialog} contentAs="section" variant={isMobile ? "bottom-sheet" : "dialog"} busy={busy}>
      <h2 id={`${fieldId}-visibility-title`}>{copy.visibility}</h2>
      <fieldset className={styles.visibility} disabled={busy} aria-describedby={visibility === "members" ? `${fieldId}-members-hint` : undefined}>{(["public", "members"] as const).map(value => <label key={value}><input type="radio" name={`${fieldId}-visibility`} value={value} checked={visibility === value} onChange={() => { setVisibility(value); setVisibilityOpen(false); }} /><span>{copy[value]}</span></label>)}</fieldset>
      <div className={styles.visibilityActions}><button type="button" onClick={() => setVisibilityOpen(false)}>{copy.cancel}</button></div>
    </AccessibleOverlay>}
    {allowMembers && !program && !isWave && visibility === "members" && <small id={`${fieldId}-members-hint`} className={styles.hint}>{copy.memberRequired}</small>}
    <div className={styles.actions}>{(()=>{const submit=<FanAction variant="primary" type="submit" disabled={!submitReady || assets.length>photoLimit || (hasVideo&&!allowVideo) || busy || (board && (!title.trim() || !rich.document || title.trim().length + rich.plainText.length + 1 > 5000)) || videoUploads.busy || videoUploads.items.some(item => item.failed || (item.media?.state==="ready"&&item.media.kind!=="video")) || (!board && (requireBody ? !body.trim() : !body.trim() && !assets.length && !video))} ariaBusy={busy} loading={mutation.busy}>{uploading ? copy.photoUploading : post ? copy.save : copy.publish}</FanAction>;return post?submit:<EarnBadgeCorner action="post" locale={locale}>{submit}</EarnBadgeCorner>;})()}{onCancel && <FanAction disabled={busy} onClick={()=>{const initialTitle=board?post?.body.split('\n')[0]??'':'';const initialBody=board?post?.body.split('\n').slice(1).join('\n')??'':post?.body??'';const dirty=title!==initialTitle||(board?rich.dirty:body!==initialBody)||visibility!==(post?.visibility??'public')||JSON.stringify(assets.map(a=>a.id))!==JSON.stringify((post?.assets??[]).map(a=>a.id))||hasVideo!==Boolean(post?.video);if(dirty)setDiscardOpen(true);else onCancel?.();}}>{copy.cancel}</FanAction>}</div>
    {videoUploads.invalid && <p className={styles.error} role="alert">{mediaCopy.videoLimit}</p>}
    {policy.error&&!gated&&<p role="alert" className={styles.error}>{copy.failed}<FanAction onClick={policy.retry}>{copy.retry}</FanAction></p>}
    {board && rich.tooLarge && <p className={styles.error} role="alert">{editorText(locale, "documentTooLarge")}</p>}
    {board && !rich.tooLarge && title.trim().length + rich.plainText.length + 1 > 5000 && <p className={styles.error} role="alert">{editorText(locale, "tooLong")}</p>}
    {!uploading && (problem || mutation.error) && <p id={problem ? `${fieldId}-photo-error` : undefined} className={styles.error} role="alert">{problem || mutation.error}</p>}
    {failedPhotos.length > 0 && <FanAction disabled={busy} onClick={() => void upload(failedPhotos)}>{copy.retry}</FanAction>}
  </fieldset></form></>;
}

/** A video just picked in the board editor. It is the viewer's own file, so it is drawn from the file itself. */
function LocalVideoPreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => { const created = URL.createObjectURL(file); setUrl(created); return () => URL.revokeObjectURL(created); }, [file]);
  return url ? <video src={url} controls playsInline preload="metadata" /> : null;
}
