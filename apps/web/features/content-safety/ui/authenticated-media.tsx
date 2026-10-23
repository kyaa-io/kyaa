"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import type { AppLocale } from "@/i18n/locales";
import styles from "./content.module.css";

/** Private media is never assigned to a browser src before authorization. */
export function AuthenticatedMedia({ asset, locale, alt, play = false, original = false, retryable = true }: { asset: { id: string; width: number; height: number; kind?: "image" | "video" }; locale: AppLocale; alt: string; play?: boolean; original?: boolean; retryable?: boolean }) {
  const auth = usePrivy(), session = useByUsSession(), copy = contentCopy(locale);
  const provider = useRef(auth.getAccessToken);
  const getAccessToken = auth.getAccessToken;
  useLayoutEffect(() => { provider.current = getAccessToken; }, [getAccessToken]);
  const [retry, setRetry] = useState(0), [snapshot, setSnapshot] = useState<{ key: string; url?: string; failed?: boolean }>();
  const video = asset.kind === "video" && play;
  const key = `${asset.id}:${video}:${original}:${auth.ready}:${auth.authenticated}:${session.ready}:${session.ownerId ?? auth.user?.id}:${session.generation}:${retry}`;
  useEffect(() => {
    if (!auth.ready || !auth.authenticated || !session.ready) return;
    const controller = new AbortController(); let objectUrl: string | undefined;
    void (async () => {
      try {
        const token = await provider.current(); controller.signal.throwIfAborted();
        if (!token) throw new Error();
        const response = await fetch(`/api/media/${asset.id}?variant=${video || original ? "original" : "thumbnail"}`, { cache: "no-store", credentials: "omit", signal: controller.signal, headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error();
        const blob = await response.blob(); controller.signal.throwIfAborted();
        objectUrl = URL.createObjectURL(blob); setSnapshot({ key, url: objectUrl });
      } catch { if (!controller.signal.aborted) setSnapshot({ key, failed: true }); }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [key, asset.id, video, original, auth.ready, auth.authenticated, session.ready]);
  const current = snapshot?.key === key ? snapshot : null;
  if (current?.url) return video ? <video className={styles.photo} src={current.url} controls playsInline preload="metadata" aria-label={alt} width={asset.width} height={asset.height} onError={() => setSnapshot({ key, failed: true })} /> : <img className={styles.photo} src={current.url} alt={alt} width={asset.width} height={asset.height} onError={() => setSnapshot({ key, failed: true })} />;
  return <span className={styles.status} role="status">{current?.failed ? copy.photoFailed : copy.loading}{current?.failed && retryable && <button type="button" onClick={() => setRetry(value => value + 1)}>{copy.retry}</button>}</span>;
}
