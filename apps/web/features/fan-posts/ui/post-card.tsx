"use client";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
import { WavePrivateBadge } from "@/features/fanpage/ui/wave-privacy";
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { Ellipsis, Heart, MessageCircle } from "lucide-react";
import type { FanPost } from "../domain/content";
import { PostComposer } from "./post-composer";
import { ContentActions, ContentTranslation } from "@/features/content-safety/ui/content-actions";
import { AuthenticatedMedia } from "@/features/content-safety/ui/authenticated-media";
import { waveMediaCopy } from "@/i18n/catalogs/features__fanpage__wave-media";
import { ContentAssetImage } from "@/features/content-safety/ui/content-asset";
import { useContentMutation } from "@/features/content-safety/ui/use-content-mutation";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import type { AppLocale } from "@/i18n/locales";
import styles from "@/features/content-safety/ui/content.module.css";

export function PostCard({ post, locale, onChanged, onDeleted, detail = false, returnTo }: { post: FanPost; locale: AppLocale; onChanged: () => void; onDeleted?: () => void; detail?: boolean; returnTo?: string }) {
  const auth = usePrivy(), copy = contentCopy(locale), mutation = useContentMutation(locale), [editing, setEditing] = useState(false);
  const [liked, setLiked] = useState(post.liked), [likeCount, setLikeCount] = useState(post.likeCount);
  const href = `/c/${post.celebritySlug}/community/${post.id}?locale=${locale}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}` as Route;
  useEffect(() => { setLiked(post.liked); setLikeCount(post.likeCount); }, [post.liked, post.likeCount]);
  async function remove() { if (window.confirm(copy.deleteConfirm) && await mutation.request(`/api/posts/${post.id}`, "DELETE")) (onDeleted ?? onChanged)(); }
  async function like() {
    const previousLiked = liked, previousCount = likeCount, nextLiked = !liked;
    setLiked(nextLiked); setLikeCount(Math.max(0, previousCount + (nextLiked ? 1 : -1)));
    if (await mutation.request(`/api/posts/${post.id}/like`, "PUT", { liked: nextLiked })) onChanged();
    else { setLiked(previousLiked); setLikeCount(previousCount); }
  }
  if (editing) return <PostComposer allowMembers={post.celebritySlug !== WAVE_FANPAGE_SLUG} slug={post.celebritySlug} locale={locale} post={post} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />;
  return <article className={styles.card} data-post-id={post.id}>
    <header className={`${styles.meta} ${styles.postHeader}`}><img src={post.author.avatarUrl} alt="" width={32} height={32} /><div className={styles.postIdentity}><strong>{post.author.nickname}</strong>
      {post.celebritySlug === WAVE_FANPAGE_SLUG ? <WavePrivateBadge locale={locale} /> : <span className={styles.badge}>{post.visibility === "members" ? copy.members : copy.public}</span>}
      </div>
      {post.isOwner ? <Menu.Root disabled={mutation.busy}>
        <Menu.Trigger className={styles.moreTrigger} aria-label={copy.more}><Ellipsis size={20} aria-hidden="true" /></Menu.Trigger>
        <Menu.Portal><Menu.Positioner className={styles.menuPositioner} sideOffset={4} align="end"><Menu.Popup className={styles.menuPopup}>
          <Menu.Item className={styles.menuItem} onClick={() => setEditing(true)}>{copy.edit}</Menu.Item>
          <Menu.Item className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={() => void remove()}>{copy.delete}</Menu.Item>
        </Menu.Popup></Menu.Positioner></Menu.Portal>
      </Menu.Root> : <ContentActions targetType="fan_post" targetId={post.id} locale={locale} onChanged={onChanged} />}
    </header>
    <div className={styles.postMedia}>
    {post.assets.length > 0 && <div className={`${styles.photos} ${styles.postPhotos}`}>{post.assets.map(asset => <ContentAssetImage key={asset.id} asset={asset} locale={locale} alt={copy.photo} />)}</div>}
    {post.celebritySlug === WAVE_FANPAGE_SLUG && post.video && (detail ? <AuthenticatedMedia asset={{ ...post.video, kind: "video" }} locale={locale} alt={waveMediaCopy(locale).play} play /> : <Link href={href} aria-label={waveMediaCopy(locale).play}><AuthenticatedMedia asset={{ ...post.video, kind: "video" }} locale={locale} alt={waveMediaCopy(locale).play} retryable={false} /></Link>)}
    <time className={styles.postDate} dateTime={post.createdAt}>{new Intl.DateTimeFormat(locale, { calendar: "gregory", dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" }).format(new Date(post.createdAt))}</time>
    </div>
    {post.body && <ContentTranslation sourceText={post.body} targetType="fan_post" targetId={post.id} locale={locale} sourceRevision={post.revision}><p className={styles.body}>{post.body}</p></ContentTranslation>}
    <div className={styles.actions}><button type="button" className={styles.likeButton} onClick={() => void like()} disabled={!auth.ready || !auth.authenticated || mutation.busy} aria-pressed={liked}><Heart size={18} fill={liked ? "currentColor" : "none"} aria-hidden="true" /> {copy.like} {likeCount.toLocaleString(locale)}</button>
      {!detail && <Link href={href} className={styles.button}><MessageCircle size={16} aria-hidden="true" /> {copy.comments} {post.commentCount.toLocaleString(locale)}</Link>}
    </div>
    {mutation.error && <p className={styles.error} role="alert">{mutation.error}</p>}
  </article>;
}
