"use client";
import { WAVE_FANPAGE_SLUG, type WaveProgramKey } from "@/features/fanpage/domain/wave-programs";
import { useEffect, useId, useRef, useState } from "react";
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
import styles from "@/features/content-safety/ui/content.module.css";

export function PostComposer({ introduction = false, program, slug, locale, post, onSaved, onCancel, featured = false, autoFocus = false, allowMembers = true }: { introduction?: boolean; program?: WaveProgramKey; slug: string; locale: AppLocale; post?: FanPost; onSaved: () => void; onCancel?: () => void; featured?: boolean; autoFocus?: boolean; allowMembers?: boolean }) {
  const introductionCopy = wavePrivacyCopy(locale), isWave = slug === WAVE_FANPAGE_SLUG;
  const insightCopy = program === "live-insight" ? waveEngagementCopy(locale) : null;
  const requireBody = introduction || Boolean(program);
  const videoUploads = useWaveMediaUpload("wave_post", 1), mediaCopy = waveMediaCopy(locale);
  const videoInput = useRef<HTMLInputElement>(null);
  const [existingVideo, setExistingVideo] = useState(post?.video ?? null);
  const uploadedVideo = videoUploads.items[0]?.media;
  const video = uploadedVideo?.state === "ready" && uploadedVideo.width && uploadedVideo.height && uploadedVideo.durationSeconds ? { id: uploadedVideo.assetId, width: uploadedVideo.width, height: uploadedVideo.height, durationSeconds: uploadedVideo.durationSeconds } : existingVideo;
  const hasVideo = Boolean(video || videoUploads.items.length);
  const copy = contentCopy(locale), mutation = useContentMutation(locale), fieldId = useId();
  const auth = usePrivy(), session = useByUsSession();
  const [body, setBody] = useState(post?.body ?? ""), [visibility, setVisibility] = useState<"public" | "members">(post?.visibility ?? "public");
  const [assets, setAssets] = useState<ContentAsset[]>(post?.assets ?? []), [problem, setProblem] = useState(""), [visibilityOpen, setVisibilityOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false), photoInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [failedPhotos, setFailedPhotos] = useState<File[]>([]);
  const uploadPending = useRef<AbortController | null>(null);
  useEffect(() => () => uploadPending.current?.abort(), [session.ownerId, session.generation]);
  const busy = mutation.busy || uploading;
  const attempt = useRef<{ snapshot: string; key: string } | null>(null);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 47.999rem)");
    const sync = () => setIsMobile(media.matches);
    sync(); media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  async function upload(files: FileList | File[] | null) {
    if (!files?.length || hasVideo || uploadPending.current || mutation.busy) return;
    const selectedFiles = Array.from(files);
    if (selectedFiles.length + assets.length > 4 || selectedFiles.some(file => file.size > MAX_POST_PHOTO_BYTES)) { setProblem(copy.photoLimit); return; }
    setProblem("");
    setFailedPhotos([]);
    let completed = 0;
    const controller = new AbortController();
    uploadPending.current = controller;
    setUploading(true);
    try {
      for (const file of selectedFiles) {
        const prepared = await preparePostPhoto(file);
        controller.signal.throwIfAborted();
        const form = new FormData(); form.set("file", prepared); form.set("celebritySlug", slug);
        const result = await mutation.request("/api/content-assets", "POST", form);
        controller.signal.throwIfAborted();
        if (!result) throw new Error("UPLOAD_FAILED");
        const parsed = assetSchema.safeParse((result as { asset?: unknown } | null)?.asset);
        if (!parsed.success) throw new Error("UPLOAD_FAILED");
        setAssets(current => [...current, parsed.data]);
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
    if (uploadPending.current || mutation.busy || videoUploads.busy || videoUploads.items.some(item => item.failed || item.media?.state !== "ready") || (requireBody && !body.trim())) return;
    const value = { body: body.trim(), visibility: allowMembers && !program && !isWave ? visibility : "public", assetIds: [...assets.map(asset => asset.id), ...(isWave && video ? [video.id] : [])] }, snapshot = JSON.stringify(value);
    if (!attempt.current || attempt.current.snapshot !== snapshot) attempt.current = { snapshot, key: crypto.randomUUID() };
    const result = post ? await mutation.request(`/api/posts/${post.id}`, "PATCH", { ...value, expectedRevision: post.revision })
      : await mutation.request(program ? `/api/celebrities/${slug}/programs/${program}/posts` : `/api/celebrities/${slug}/posts`, "POST", { ...value, idempotencyKey: attempt.current.key });
    if (result) { setBody(""); setAssets([]); setExistingVideo(null); videoUploads.items.forEach(item => videoUploads.remove(item.key)); attempt.current = null; if (!post) notifyFanActivityUpdated(session.ownerId ?? auth.user?.id); onSaved(); }
  }
  return <form className={`${styles.composer}${featured ? ` ${styles.composerFeatured}` : ""}`} onSubmit={event => { event.preventDefault(); void save(); }}>
    <label htmlFor={`${fieldId}-body`}>{post ? copy.edit : introduction ? introductionCopy.introductionLabel : insightCopy?.insightTitle ?? copy.writePost}<textarea required={requireBody} id={`${fieldId}-body`} rows={3} autoFocus={autoFocus} placeholder={introduction ? introductionCopy.introductionPrompt : insightCopy?.insightPrompt ?? discoveryCopy(locale).writePrompt} maxLength={5000} value={body} disabled={busy} onChange={event => setBody(event.target.value)} /></label>
    {isWave && <p className={styles.hint}>{introductionCopy.notice}</p>}
    {assets.length > 0 && <div className={styles.photos}>{assets.map(asset => <figure key={asset.id}>
      <ContentAssetImage asset={asset} locale={locale} alt={copy.photo} /><button type="button" className={styles.button} disabled={busy} onClick={() => setAssets(current => current.filter(item => item.id !== asset.id))}>{copy.delete}</button>
    </figure>)}</div>}
    {isWave && video && <figure><AuthenticatedMedia asset={{ ...video, kind: "video" }} locale={locale} alt={mediaCopy.play} /><button type="button" disabled={busy} onClick={() => { setExistingVideo(null); videoUploads.items.forEach(item => videoUploads.remove(item.key)); }}>{copy.delete}</button></figure>}
    {isWave && videoUploads.items.map(item => item.media?.state !== "ready" && <div key={item.key} role="status">{item.failed ? copy.failed : copy.loading}{item.failed && <button type="button" onClick={() => videoUploads.retry(item)}>{copy.retry}</button>}<button type="button" onClick={() => videoUploads.remove(item.key)}>{copy.delete}</button></div>)}
    <div className={styles.composerTools}>
      {allowMembers && !program && !isWave && <button type="button" className={styles.visibilityTrigger} disabled={busy} aria-label={`${copy.visibility}: ${copy[visibility]}`} aria-haspopup="dialog" aria-expanded={visibilityOpen} onClick={() => setVisibilityOpen(true)}>
        <span>{copy.visibility}</span><strong>{copy[visibility]}</strong><ChevronDown size={16} aria-hidden="true" />
      </button>}
      {isWave && <div className={styles.photoPicker}><button type="button" disabled={busy || assets.length > 0 || hasVideo} onClick={() => videoInput.current?.click()}>{mediaCopy.uploadVideo}</button><input ref={videoInput} type="file" accept="video/mp4,video/quicktime" aria-label={mediaCopy.uploadVideo} disabled={busy || assets.length > 0 || hasVideo} onChange={event => { videoUploads.add(Array.from(event.target.files ?? [])); event.target.value = ""; }} /></div>}
      <div className={styles.photoPicker}>
        <button type="button" disabled={busy || hasVideo || assets.length >= 4} aria-describedby={`${fieldId}-hint${problem ? ` ${fieldId}-photo-error` : ""}`} onClick={() => photoInput.current?.click()}><ImagePlus size={18} aria-hidden="true" /><span>{introduction ? introductionCopy.optionalPhoto : copy.photos}{assets.length ? ` · ${assets.length}/4` : ""}</span></button>
        <input ref={photoInput} type="file" tabIndex={-1} accept="image/jpeg,image/png,image/webp" multiple disabled={busy || hasVideo || assets.length >= 4} aria-label={introduction ? introductionCopy.optionalPhoto : copy.photos} aria-describedby={`${fieldId}-hint${problem ? ` ${fieldId}-photo-error` : ""}`} aria-invalid={problem ? true : undefined} onChange={event => { void upload(event.target.files); event.target.value = ""; }} />
      </div>
    </div>
    {allowMembers && !program && !isWave && visibilityOpen && <AccessibleOverlay open onClose={() => setVisibilityOpen(false)} labelledBy={`${fieldId}-visibility-title`} backdropClassName={styles.visibilityBackdrop} contentClassName={styles.visibilityDialog} contentAs="section" variant={isMobile ? "bottom-sheet" : "dialog"} busy={busy}>
      <h2 id={`${fieldId}-visibility-title`}>{copy.visibility}</h2>
      <fieldset className={styles.visibility} disabled={busy} aria-describedby={visibility === "members" ? `${fieldId}-members-hint` : undefined}>{(["public", "members"] as const).map(value => <label key={value}><input type="radio" name={`${fieldId}-visibility`} value={value} checked={visibility === value} onChange={() => { setVisibility(value); setVisibilityOpen(false); }} /><span>{copy[value]}</span></label>)}</fieldset>
      <div className={styles.visibilityActions}><button type="button" onClick={() => setVisibilityOpen(false)}>{copy.cancel}</button></div>
    </AccessibleOverlay>}
    {allowMembers && !program && !isWave && visibility === "members" && <small id={`${fieldId}-members-hint`} className={styles.hint}>{copy.memberRequired}</small>}
    <small id={`${fieldId}-hint`} className={styles.hint}>{copy.photoLimit} <br />{copy.photoUploadHint}{isWave && <> {mediaCopy.videoLimit}</>}</small>
    <div className={styles.actions}><FanAction variant="primary" type="submit" disabled={busy || videoUploads.busy || videoUploads.items.some(item => item.failed) || (requireBody ? !body.trim() : !body.trim() && !assets.length && !video)} ariaBusy={busy}>{uploading ? copy.photoUploading : mutation.busy ? copy.loading : post ? copy.save : copy.publish}</FanAction>{onCancel && <FanAction disabled={busy} onClick={onCancel}>{copy.cancel}</FanAction>}</div>
    {isWave && videoUploads.invalid && <p className={styles.error} role="alert">{mediaCopy.videoLimit}</p>}
    {!uploading && (problem || mutation.error) && <p id={problem ? `${fieldId}-photo-error` : undefined} className={styles.error} role="alert">{problem || mutation.error}</p>}
    {failedPhotos.length > 0 && <FanAction disabled={busy} onClick={() => void upload(failedPhotos)}>{copy.retry}</FanAction>}
  </form>;
}
