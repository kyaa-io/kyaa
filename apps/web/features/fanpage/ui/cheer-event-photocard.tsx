"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { X } from "lucide-react";
import { useByUsSession } from "@/components/byus-session-provider";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import { cheerEventCopy, eventText } from "../domain/cheer-event-copy";
import type { CheerEvent } from "./cheer-event";
import styles from "./cheer-event.module.css";

type Photocard = NonNullable<CheerEvent["photocard"]>;

export function PhotocardReward({ photocard, locale, name }: { photocard: Photocard; locale: AppLocale; name: string }) {
  const auth = usePrivy(), session = useByUsSession(), copy = cheerEventCopy(locale), titleId = useId();
  const ownerKey = `${auth.ready}:${auth.authenticated}:${session.ready}:${session.ownerId}:${auth.user?.id}:${session.generation}`;
  const [openedFor, setOpenedFor] = useState<string>();
  const eligible = auth.ready && auth.authenticated && session.ready && photocard.eligible === true;
  const open = eligible && openedFor === ownerKey && photocard.assets.length > 0;
  return <>
    <p>{copy.exclusive}</p>
    {!auth.authenticated || photocard.eligible === null ? <FanAction variant="neutral" onClick={() => auth.login()}>{copy.login}</FanAction> : !eligible ? <a className={styles.photocardAction} href="#event-cheers">{copy.cta}</a> : photocard.assets.length === 0 ? <p role="status">{copy.preparing}</p> : <FanAction variant="neutral" onClick={() => setOpenedFor(ownerKey)}>{copy.viewPhotocard}</FanAction>}
    <AccessibleOverlay open={open} onClose={() => setOpenedFor(undefined)} labelledBy={titleId} backdropClassName={styles.backdrop} contentClassName={styles.photocardViewer}>
      <header className={styles.modalHeader}><h2 id={titleId}>{copy.photocard}</h2><button type="button" onClick={() => setOpenedFor(undefined)} aria-label={copy.close}><X aria-hidden="true" /></button></header>
      <p>{copy.noDownload}</p>
      {open && photocard.assets.map(asset => <PhotocardMedia key={`${ownerKey}:${asset.id}`} asset={asset} locale={locale} alt={eventText(copy.photocardAlt, name)} />)}
    </AccessibleOverlay>
  </>;
}

/** Keep the authenticated derivative scoped to its current owner and abort stale requests. */
export function PhotocardMedia({ asset, locale, alt }: { asset: Photocard["assets"][number]; locale: AppLocale; alt: string }) {
  const auth = usePrivy(), session = useByUsSession(), copy = cheerEventCopy(locale);
  const provider = useRef(auth.getAccessToken), getAccessToken = auth.getAccessToken;
  useLayoutEffect(() => { provider.current = getAccessToken; }, [getAccessToken]);
  const [retry, setRetry] = useState(0), [snapshot, setSnapshot] = useState<{ key: string; url?: string; failed?: boolean }>();
  const key = `${asset.id}:${auth.ready}:${auth.authenticated}:${session.ready}:${session.ownerId}:${auth.user?.id}:${session.generation}:${retry}`;
  useEffect(() => {
    if (!auth.ready || !auth.authenticated || !session.ready) return;
    const controller = new AbortController(); let objectUrl: string | undefined;
    void (async () => {
      try {
        const token = await provider.current(); controller.signal.throwIfAborted();
        if (!token) throw new Error();
        const response = await fetch(`/api/photocards/${asset.id}`, { cache: "no-store", credentials: "omit", signal: controller.signal, headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error();
        const blob = await response.blob(); controller.signal.throwIfAborted();
        objectUrl = URL.createObjectURL(blob); setSnapshot({ key, url: objectUrl });
      } catch { if (!controller.signal.aborted) setSnapshot({ key, failed: true }); }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [key, asset.id, auth.ready, auth.authenticated, session.ready]);
  const current = snapshot?.key === key ? snapshot : null;
  return current?.url ? <img className={styles.photocardImage} src={current.url} alt={alt} width={asset.width} height={asset.height} draggable={false} onContextMenu={event => event.preventDefault()} onError={() => setSnapshot({ key, failed: true })} /> : <p role="status">{current?.failed ? copy.loadError : copy.loading}{current?.failed && <FanAction variant="neutral" onClick={() => setRetry(value => value + 1)}>{copy.retry}</FanAction>}</p>;
}
