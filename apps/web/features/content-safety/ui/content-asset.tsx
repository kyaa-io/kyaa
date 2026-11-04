"use client";
import { throwIfAborted } from "@/features/reliability/client/throw-if-aborted";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import type { ContentAsset } from "@/features/fan-posts/domain/content";
import type { AppLocale } from "@/i18n/locales";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import styles from "./content.module.css";

export function ContentAssetImage({ asset, locale, alt, adminPreview = false, href, loading = "eager", anonymousPreview = false, noticeMedia = false, thumbnail = false, operatorChannelId }: { asset: ContentAsset; locale: AppLocale; alt: string; adminPreview?: boolean; href?: string; loading?: "eager" | "lazy"; anonymousPreview?: boolean; noticeMedia?: boolean; thumbnail?: boolean; operatorChannelId?: string }) {
  const auth = usePrivy(), session = useByUsSession(), copy = contentCopy(locale);
  const { ready, authenticated, getAccessToken } = auth;
  const tokenProvider = useRef(getAccessToken);
  const placeholder = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(loading !== "lazy");
  useEffect(() => {
    if (visible) return;
    if (loading !== "lazy" || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "200px" });
    if (placeholder.current) observer.observe(placeholder.current);
    return () => observer.disconnect();
  }, [loading, visible]);
  useEffect(() => { tokenProvider.current = getAccessToken; }, [getAccessToken]);
  const [retry, setRetry] = useState(0), [snapshot, setSnapshot] = useState<{ key: string; url?: string; failed?: boolean }>();
  const key = `${asset.id}:${thumbnail}:${noticeMedia}:${adminPreview}:${operatorChannelId ?? ""}:${anonymousPreview}:${auth.ready}:${auth.authenticated}:${session.ownerId ?? auth.user?.id}:${session.generation}:${retry}`;
  useEffect(() => {
    if (!visible || (!anonymousPreview && (!ready || !session.ready))) return;
    const controller = new AbortController(); let objectUrl: string | undefined;
    void (async () => {
      try {
        const token = authenticated && !anonymousPreview ? await tokenProvider.current() : null;
        throwIfAborted(controller.signal);
        if (authenticated && !anonymousPreview && !token) throw new Error();
        const query = new URLSearchParams({ ...(adminPreview ? { admin: "1" } : {}), ...(thumbnail && !noticeMedia ? { size: "thumbnail" } : {}) }).toString();
        const url = operatorChannelId ? `/api/operator/channels/${operatorChannelId}/assets/${asset.id}` : `${noticeMedia ? "/api/public/notice-media" : "/api/content-assets"}/${asset.id}${query ? `?${query}` : ""}`;
        const response = await fetch(url, { cache: "no-store", credentials: "omit", signal: controller.signal, headers: token ? { Authorization: `Bearer ${token}` } : undefined });
        if (!response.ok) throw new Error();
        const blob = await response.blob(); throwIfAborted(controller.signal);
        objectUrl = URL.createObjectURL(blob); setSnapshot({ key, url: objectUrl });
      } catch { if (!controller.signal.aborted) setSnapshot({ key, failed: true }); }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [key, asset.id, thumbnail, noticeMedia, adminPreview, operatorChannelId, anonymousPreview, ready, authenticated, session.ready, visible]);
  const current = snapshot?.key === key ? snapshot : null;
  if (current?.url) {
    const image = <img className={styles.photo} src={current.url} alt={alt} width={asset.width} height={asset.height} onError={() => setSnapshot({ key, failed: true })} />;
    return href ? <a href={href}>{image}</a> : image;
  }
  return <span ref={placeholder} className={styles.status} role="status" data-content-asset-placeholder={loading === "lazy" || undefined} style={{ "--content-asset-ratio": `${asset.width}/${asset.height}` } as CSSProperties}>{current?.failed ? copy.photoFailed : copy.loading}{current?.failed && <button type="button" className={styles.button} onClick={() => setRetry(value => value + 1)}>{copy.retry}</button>}</span>;
}
