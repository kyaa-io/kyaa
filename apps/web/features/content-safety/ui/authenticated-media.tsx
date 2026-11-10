"use client";
import { throwIfAborted } from "@/features/reliability/client/throw-if-aborted";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import type { AppLocale } from "@/i18n/locales";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FeedVideo, feedAutoplayAllowed } from "@/components/feed-video/feed-video";
import { acquireVideoBlob, dropVideoBlob, releaseVideoBlob } from "./video-blob-cache";
import { feedVideoCopy } from "@/components/feed-video/feed-video-copy";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { Play } from "@/components/fan-ui/fan-icons";
import styles from "./content.module.css";

/**
 * A post video is fetched whole, so it is requested only when the viewer can be shown it: the poster is near the screen and autoplay is
 * allowed (no reduced motion, no Save-Data), or the viewer pressed play. Until then the small poster is all that is downloaded.
 */
function useVideoGate(enabled: boolean) {
  const [near, setNear] = useState(false), [requested, setRequested] = useState(false), [target, setTarget] = useState<Element | null>(null), [auto, setAuto] = useState(false);
  useEffect(() => { setAuto(feedAutoplayAllowed()); }, []);
  useEffect(() => {
    if (!enabled || !target || near || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { setNear(true); observer.disconnect(); } }, { rootMargin: "300px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled, target, near]);
  return { ref: setTarget, requested, request: () => setRequested(true), allowed: requested || (auto && near) };
}


/** Private media is never assigned to a browser src before authorization. */
export function AuthenticatedMedia({ asset, locale, alt, play = false, original = false, retryable = true, publicFanPost = false }: { asset: { id: string; width: number; height: number; kind?: "image" | "video" }; locale: AppLocale; alt: string; play?: boolean; original?: boolean; retryable?: boolean; publicFanPost?: boolean }) {
  const auth = usePrivy(), session = useByUsSession(), copy = contentCopy(locale);
  const provider = useRef(auth.getAccessToken);
  const getAccessToken = auth.getAccessToken;
  useLayoutEffect(() => { provider.current = getAccessToken; }, [getAccessToken]);
  const [retry, setRetry] = useState(0), [snapshot, setSnapshot] = useState<{ key: string; url?: string; failed?: boolean }>();
  const wantVideo = asset.kind === "video" && play, gate = useVideoGate(wantVideo), video = wantVideo && gate.allowed;
  const key = `${asset.id}:${video}:${original}:${publicFanPost}:${auth.ready}:${auth.authenticated}:${session.ready}:${session.ownerId ?? auth.user?.id}:${session.generation}:${retry}`;
  const owner = session.ownerId ?? auth.user?.id ?? "guest", ownerNow = useRef(owner), generationNow = useRef(session.generation), signedInNow = useRef(auth.authenticated);
  ownerNow.current = owner; generationNow.current = session.generation; signedInNow.current = auth.authenticated;
  useEffect(() => {
    if (!auth.ready || (!auth.authenticated&&!publicFanPost) || !session.ready) return;
    const controller = new AbortController(); let objectUrl: string | undefined;
    const download = async (signal: AbortSignal) => {
      const token = auth.authenticated?await provider.current():null; throwIfAborted(signal);
      if(auth.authenticated&&!token)throw new Error();
      const response = await fetch(`${publicFanPost?"/api/fan-posts/media":"/api/media"}/${asset.id}?variant=${video || original ? "original" : "thumbnail"}`, { cache: "no-store", credentials: "omit", signal, headers: token?{ Authorization: `Bearer ${token}` }:{} });
      if (!response.ok) throw new Error();
      const blob = await response.blob(); throwIfAborted(signal);
      return URL.createObjectURL(blob);
    };
    if (video) {
      const cacheKey = `${asset.id}:${publicFanPost}:${owner}:${session.generation}:${retry}`, generation = session.generation; let live = true;
      acquireVideoBlob(cacheKey, download).then(url => { if (live) setSnapshot({ key, url }); }, () => { if (live) setSnapshot({ key, failed: true }); });
      return () => { live = false; if (ownerNow.current !== owner || generationNow.current !== generation || (!signedInNow.current && !publicFanPost)) dropVideoBlob(cacheKey); else releaseVideoBlob(cacheKey); };
    }
    void (async () => {
      try { objectUrl = await download(controller.signal); setSnapshot({ key, url: objectUrl }); }
      catch { if (!controller.signal.aborted) setSnapshot({ key, failed: true }); }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [key, asset.id, video, original, auth.ready, auth.authenticated, session.ready, session.generation, publicFanPost, owner, retry]);
  const current = snapshot?.key === key ? snapshot : null;
  if (current?.url && video) return <FeedVideo src={current.url} width={asset.width} height={asset.height} label={alt} locale={locale} startManual={gate.requested} onError={() => setSnapshot({ key, failed: true })} />;
  if (current?.url) {
    const image = <img className={asset.kind === "video" ? `${styles.photo} ${styles.videoThumb}` : styles.photo} src={current.url} alt={alt} width={asset.width} height={asset.height} onError={() => setSnapshot({ key, failed: true })} />;
    return wantVideo ? <span className={styles.videoPoster} ref={gate.ref}>{image}<FanIconButton className={styles.posterPlay} aria-label={feedVideoCopy(locale).play} onClick={gate.request}><FanIcon icon={Play} size={24} /></FanIconButton></span> : image;
  }
  if (!current?.failed) return <span ref={wantVideo ? gate.ref : undefined} className={asset.kind === "video" ? `${styles.mediaLoading} ${styles.videoThumb}` : styles.mediaLoading} aria-busy="true" style={{ aspectRatio: `${asset.width}/${asset.height}` }}><FanSkeleton shape="block" width="100%" height="100%" /></span>;
  return <span className={styles.status} role="status">{copy.photoFailed}{retryable && <FanAction variant="neutral" type="button" onClick={() => setRetry(value => value + 1)}>{copy.retry}</FanAction>}</span>;
}
