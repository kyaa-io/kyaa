"use client";
import { useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import { usePrivy } from "@privy-io/react-auth";
import { Heart, MessageCircle, Play, Plus, X } from "lucide-react";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";
import { useByUsSession } from "@/components/byus-session-provider";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSectionHeader } from "@/components/fan-ui/fan-heading";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { AuthenticatedMedia } from "@/features/content-safety/ui/authenticated-media";
import { ContentActions } from "@/features/content-safety/ui/content-actions";
import { useWaveMediaUpload } from "@/features/content-safety/ui/use-wave-media-upload";
import { useContentMutation } from "@/features/content-safety/ui/use-content-mutation";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import { waveMediaCopy } from "@/i18n/catalogs/features__fanpage__wave-media";
import type { AppLocale } from "@/i18n/locales";
import { fanClipCommentSchema } from "@/server/mobile-content/domain";
import { waveAlbumPageSchema, waveAlbumSchema, waveAlbumWriteSchema, type WaveAlbum } from "../domain/wave-media";
import { useFanpageResource } from "./use-fanpage-resource";
import styles from "./wave-media.module.css";

const parsePage = (value: unknown) => waveAlbumPageSchema.parse(value);
const parseAlbum = (value: unknown) => z.object({ album: waveAlbumSchema }).parse(value).album;
const parseComments = (value: unknown) => z.object({ items: z.array(fanClipCommentSchema), nextCursor: z.string().nullable() }).parse(value);
type Profile = WaveAlbum["author"];

export function WaveMediaFeed({ locale }: { locale: AppLocale }) {
  const auth = usePrivy(), session = useByUsSession(), copy = contentCopy(locale);
  if (!auth.ready || !session.ready) return <p role="status">{copy.loading}</p>;
  if (!auth.authenticated) return <FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/c/kyaa-wave-fanpage?section=media&locale=${locale}`)}`}>{copy.login}</FanAction>;
  return <MediaFeed key={`${session.ownerId ?? auth.user?.id}:${session.generation}`} locale={locale} />;
}

function MediaFeed({ locale }: { locale: AppLocale }) {
  const copy = waveMediaCopy(locale), common = contentCopy(locale);
  const [composer, setComposer] = useState(false), [selected, setSelected] = useState<string | null>(null), [profile, setProfile] = useState<Profile | null>(null);
  const [composerSaving, setComposerSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(value => value + 1);
  return <section className={styles.section} lang={locale}>
    <FanSectionHeader title={copy.title} description={copy.intro} />
    <div className={styles.composerAction}><FanAction variant="primary" leadingIcon={<Plus size={20} />} onClick={() => setComposer(true)}>{copy.upload}</FanAction></div>
    <AlbumList key={revision} locale={locale} onSelect={setSelected} onProfile={setProfile} onChanged={refresh} />
    {composer && <MediaDialog title={copy.upload} locale={locale} busy={composerSaving} onClose={() => setComposer(false)}><WaveMediaComposer locale={locale} onBusyChange={setComposerSaving} onSaved={() => { setComposer(false); setComposerSaving(false); refresh(); }} /></MediaDialog>}
    {profile && <MediaDialog title={`${profile.nickname} · ${copy.profile}`} locale={locale} onClose={() => setProfile(null)}><div className={styles.author}><img src={profile.avatarUrl} alt="" width={48} height={48} /><strong>{profile.nickname}</strong></div><AlbumList key={`${profile.profileId}:${revision}`} locale={locale} profileId={profile.profileId!} onSelect={setSelected} onProfile={setProfile} onChanged={refresh} /></MediaDialog>}
    {selected && <MediaDialog title={copy.viewAll} locale={locale} onClose={() => setSelected(null)}><AlbumDetail id={selected} locale={locale} onProfile={author => { setSelected(null); setProfile(author); }} onChanged={refresh} onDeleted={() => { setSelected(null); refresh(); }} /></MediaDialog>}
  </section>;
}
function MediaDialog({ title, locale, onClose, children, busy = false }: { title: string; locale: AppLocale; onClose: () => void; children: React.ReactNode; busy?: boolean }) {
  const id = useId();
  return <AccessibleOverlay open busy={busy} onClose={onClose} labelledBy={id} backdropClassName={styles.backdrop} contentClassName={styles.dialog} contentAs="section"><header className={styles.dialogHeader}><h2 id={id}>{title}</h2><button type="button" disabled={busy} className={styles.close} aria-label={contentCopy(locale).cancel} onClick={onClose}><X aria-hidden="true" size={20} /></button></header>{children}</AccessibleOverlay>;
}
function AlbumList({ locale, profileId, onSelect, onProfile, onChanged }: { locale: AppLocale; profileId?: string; onSelect: (id: string) => void; onProfile: (author: Profile) => void; onChanged: () => void }) {
  const common = contentCopy(locale), [cursor, setCursor] = useState<string | null>(null), [previous, setPrevious] = useState<WaveAlbum[]>([]);
  const page = useFanpageResource(`/api/kyaa-wave/${profileId ? `profiles/${profileId}/albums` : "albums"}?locale=${locale}&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, parsePage);
  const items = page.state.status === "ready" ? [...previous, ...page.state.data.items.filter(item => !previous.some(old => old.id === item.id))] : previous;
  return <div className={styles.feed}>
    <div className={profileId ? styles.gallery : styles.feed}>{items.map(album => profileId ? <AlbumTile key={album.id} album={album} locale={locale} onSelect={onSelect} /> : <WaveMediaCard key={album.id} album={album} locale={locale} onSelect={onSelect} onProfile={onProfile} onChanged={onChanged} />)}</div>
    {page.state.status === "ready" && !items.length && <p className={styles.hint}>{common.empty}</p>}
    {page.state.status === "loading" && <p role="status">{common.loading}</p>}
    {page.state.status === "error" && <p role="alert">{common.failed} <FanAction onClick={page.retry}>{common.retry}</FanAction></p>}
    {page.state.status === "ready" && page.state.data.nextCursor && <FanAction onClick={() => { if (page.state.status === "ready") { setPrevious(items); setCursor(page.state.data.nextCursor); } }}>{common.more}</FanAction>}
  </div>;
}
function AlbumTile({ album, locale, onSelect }: { album: WaveAlbum; locale: AppLocale; onSelect: (id: string) => void }) {
  return <button type="button" className={styles.tile} aria-label={`${waveMediaCopy(locale).viewAll} · ${album.author.nickname}`} onClick={() => onSelect(album.id)}><AuthenticatedMedia asset={album.assets[0]} locale={locale} alt="" retryable={false} />{album.assets[0].kind === "video" && <span className={styles.badge}><Play size={18} aria-hidden="true" /></span>}{album.assets.length > 1 && <span className={styles.badge}>{album.assets.length}</span>}</button>;
}
export function WaveMediaCard({ album, locale, onSelect, onProfile, onChanged }: { album: WaveAlbum; locale: AppLocale; onSelect: (id: string) => void; onProfile: (author: Profile) => void; onChanged: () => void }) {
  const copy = waveMediaCopy(locale), common = contentCopy(locale), mutation = useContentMutation(locale);
  const [liked, setLiked] = useState(album.liked), [likes, setLikes] = useState(album.likeCount);
  useEffect(() => { setLiked(album.liked); setLikes(album.likeCount); }, [album.liked, album.likeCount]);
  async function like() { const before = liked; setLiked(!before); setLikes(count => count + (before ? -1 : 1)); if (await mutation.request(`/api/fan-clips/${album.id}/reaction`, "PUT", { liked: !before })) onChanged(); else { setLiked(before); setLikes(album.likeCount); } }
  return <article className={styles.card}><Author album={album} locale={locale} onProfile={onProfile} />
    {album.assets.length > 0 && <div className={styles.carousel}>{album.assets.slice(0, 3).map((asset, index) => <button type="button" className={styles.tile} key={asset.id} aria-label={`${asset.kind === "video" ? copy.play : copy.viewAll} · ${index + 1}/${album.assets.length}`} onClick={() => onSelect(album.id)}><AuthenticatedMedia asset={asset} locale={locale} alt="" retryable={false} />{asset.kind === "video" && <span className={styles.badge}><Play size={20} aria-hidden="true" /></span>}{index === 2 && album.assets.length > 3 && <span className={styles.badge}>+{album.assets.length - 3}</span>}</button>)}</div>}
    <div className={styles.actions}><button type="button" disabled={mutation.busy} aria-pressed={liked} onClick={() => void like()}><Heart size={20} fill={liked ? "currentColor" : "none"} aria-hidden="true" />{common.like} {likes}</button><button type="button" onClick={() => onSelect(album.id)}><MessageCircle size={20} aria-hidden="true" />{common.comments} {album.commentCount}</button></div>
    {album.body && <p className={styles.body}>{album.body}</p>}
    {album.commentPreview && <p className={styles.preview}><strong>{album.commentPreview.author.nickname}</strong> {album.commentPreview.body}</p>}
    {mutation.error && <p role="alert" className={styles.error}>{mutation.error}</p>}
  </article>;
}
function Author({ album, locale, onProfile }: { album: WaveAlbum; locale: AppLocale; onProfile: (author: Profile) => void }) {
  const identity = <><img src={album.author.avatarUrl} alt="" width={36} height={36} /><strong>{album.author.nickname}</strong></>;
  return <header className={styles.author}>{album.author.profileId ? <button type="button" className={styles.authorButton} aria-label={`${album.author.nickname} · ${waveMediaCopy(locale).profile}`} onClick={() => onProfile(album.author)}>{identity}</button> : identity}<time dateTime={album.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(album.createdAt))}</time></header>;
}
export function WaveMediaComposer({ locale, onSaved, onBusyChange }: { locale: AppLocale; onSaved: () => void; onBusyChange?: (busy: boolean) => void }) {
  const auth = usePrivy(), session = useByUsSession();
  const copy = waveMediaCopy(locale), common = contentCopy(locale), mutation = useContentMutation(locale), uploads = useWaveMediaUpload("wave_album");
  const [body, setBody] = useState(""), [problem, setProblem] = useState(false), input = useRef<HTMLInputElement>(null), attempt = useRef<{ snapshot: string; key: string } | null>(null);
  useEffect(() => { onBusyChange?.(mutation.busy); }, [mutation.busy, onBusyChange]);
  async function save() {
    if (!uploads.ready) { setProblem(true); return; }
    const value = { body: body.trim(), assetIds: uploads.items.map(item => item.media!.assetId) }, snapshot = JSON.stringify(value);
    if (attempt.current?.snapshot !== snapshot) attempt.current = { snapshot, key: crypto.randomUUID() };
    const result = await mutation.request("/api/kyaa-wave/albums", "POST", { ...value, idempotencyKey: attempt.current.key });
    if (waveAlbumWriteSchema.safeParse(result).success) { notifyFanActivityUpdated(session.ownerId ?? auth.user?.id); onSaved(); }
  }
  return <form className={styles.form} onSubmit={event => { event.preventDefault(); void save(); }}>
    <p className={styles.hint}>{copy.limits}</p><FanAction onClick={() => input.current?.click()} disabled={mutation.busy || uploads.items.length >= 30}>{copy.upload}</FanAction>
    <input ref={input} tabIndex={-1} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" multiple aria-label={copy.upload} disabled={mutation.busy} onChange={event => { uploads.add(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
    {(uploads.invalid || problem) && <p role="alert" className={styles.error}>{copy.limits}</p>}
    <ul className={styles.uploadList}>{uploads.items.map(item => <li key={item.key}><span>{item.file.name}</span><span role="status">{item.failed ? common.failed : item.media?.state === "ready" ? "✓" : common.loading}</span>{item.failed && <FanAction disabled={mutation.busy} ariaLabel={`${item.file.name} · ${common.retry}`} onClick={() => uploads.retry(item)}>{common.retry}</FanAction>}<FanAction disabled={mutation.busy} onClick={() => uploads.remove(item.key)}>{common.delete}</FanAction></li>)}</ul>
    <label>{copy.caption}<textarea maxLength={5000} value={body} disabled={mutation.busy} onChange={event => setBody(event.target.value)} /></label>
    <FanAction type="submit" variant="primary" disabled={mutation.busy || !uploads.ready} ariaBusy={mutation.busy}>{common.publish}</FanAction>
    {mutation.error && <p role="alert" className={styles.error}>{mutation.error}</p>}
  </form>;
}
function AlbumDetail({ id, locale, onProfile, onChanged, onDeleted }: { id: string; locale: AppLocale; onProfile: (author: Profile) => void; onChanged: () => void; onDeleted: () => void }) {
  const common = contentCopy(locale), album = useFanpageResource(`/api/kyaa-wave/albums/${id}?locale=${locale}`, parseAlbum), mutation = useContentMutation(locale);
  const [cursor, setCursor] = useState<string | null>(null), comments = useFanpageResource(`/api/fan-clips/${id}/comments?locale=${locale}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, parseComments);
  const commentInput = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(""), attempt = useRef<{ body: string; key: string } | null>(null);
  const refresh = () => { album.retry(); comments.retry(); onChanged(); };
  async function submit() { if (!body.trim()) return; if (attempt.current?.body !== body.trim()) attempt.current = { body: body.trim(), key: crypto.randomUUID() }; if (await mutation.request(`/api/fan-clips/${id}/comments`, "POST", { body: body.trim(), parentId: null, idempotencyKey: attempt.current.key })) { setBody(""); attempt.current = null; setCursor(null); refresh(); } }
  if (album.state.status !== "ready") return <p role="status">{album.state.status === "loading" ? common.loading : common.failed}{album.state.status === "error" && <FanAction onClick={album.retry}>{common.retry}</FanAction>}</p>;
  const item = album.state.data;
  return <div className={styles.detail}><div className={styles.fullMedia} role="region" aria-label={waveMediaCopy(locale).viewAll} tabIndex={item.assets.length > 1 ? 0 : undefined}>{item.assets.map((asset, index) => <figure key={asset.id}><AuthenticatedMedia asset={asset} locale={locale} alt={asset.kind === "video" ? waveMediaCopy(locale).play : common.photo} play original /><figcaption>{index + 1} / {item.assets.length}</figcaption></figure>)}</div><div className={styles.form}>
    <WaveMediaCard album={{ ...item, assets: [] }} locale={locale} onSelect={() => commentInput.current?.focus()} onProfile={onProfile} onChanged={refresh} />
    <div className={styles.actions}>{item.isOwner ? <FanAction disabled={mutation.busy} onClick={async () => { if (window.confirm(common.deleteConfirm) && await mutation.request(`/api/fan-clips/${id}`, "DELETE")) onDeleted(); }}>{common.delete}</FanAction> : <ContentActions targetType="fan_clip" targetId={id} locale={locale} onChanged={refresh} />}</div>
    <h3>{common.comments}</h3>{comments.state.status === "ready" ? <><ul className={styles.comments}>{comments.state.data.items.map(comment => <li key={comment.id}><div className={styles.author}><img src={comment.author.avatarUrl} alt="" width={28} height={28} /><strong>{comment.author.nickname}</strong></div><p className={styles.body}>{comment.body}</p>{comment.isOwner ? <FanAction disabled={mutation.busy} onClick={async () => { if (window.confirm(common.deleteConfirm) && await mutation.request(`/api/fan-clip-comments/${comment.id}`, "DELETE")) refresh(); }}>{common.delete}</FanAction> : <ContentActions targetType="fan_clip_comment" targetId={comment.id} locale={locale} onChanged={refresh} />}</li>)}</ul>{comments.state.data.nextCursor && <FanAction onClick={() => { if (comments.state.status === "ready") setCursor(comments.state.data.nextCursor); }}>{common.more}</FanAction>}</> : <p role="status">{comments.state.status === "loading" ? common.loading : common.failed}{comments.state.status === "error" && <FanAction onClick={comments.retry}>{common.retry}</FanAction>}</p>}
    <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit(); }}><label>{common.newComment}<textarea ref={commentInput} required maxLength={1000} value={body} onChange={event => setBody(event.target.value)} disabled={mutation.busy} /></label><FanAction variant="neutral" type="submit" disabled={mutation.busy}>{common.send}</FanAction></form>{mutation.error && <p role="alert" className={styles.error}>{mutation.error}</p>}
  </div></div>;
}
