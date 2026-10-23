"use client";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { X } from "lucide-react";
import { useByUsSession } from "@/components/byus-session-provider";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import { cheerEventCopy, eventText } from "../domain/cheer-event-copy";
import { photocardClaimSchema, type PhotocardClaim } from "../domain/photocard-claim";
import { photocardClaimCopy } from "../domain/photocard-claim-copy";
import type { CheerEvent } from "./cheer-event";
import styles from "./cheer-event.module.css";

type Photocard = NonNullable<CheerEvent["photocard"]>;

export function PhotocardReward({ photocard, locale, name }: { photocard: Photocard; locale: AppLocale; name: string }) {
  const auth = usePrivy(), session = useByUsSession(), copy = cheerEventCopy(locale);
  const ownerKey = `${auth.ready}:${auth.authenticated}:${session.ready}:${session.ownerId}:${auth.user?.id}:${session.generation}`;
  const eligible = auth.ready && auth.authenticated && session.ready && photocard.eligible === true;
  return <>
    <p>{copy.exclusive}</p>
    {!auth.authenticated || photocard.eligible === null ? <FanAction variant="neutral" onClick={() => auth.login()}>{copy.login}</FanAction> : !eligible ? <a className={styles.photocardAction} href="#event-cheers">{copy.cta}</a> : <OwnedPhotocardReward key={`${ownerKey}:${photocard.collectionId}`} collectionId={photocard.collectionId} locale={locale} name={name} />}
  </>;
}

function OwnedPhotocardReward({ collectionId, locale, name }: { collectionId: string; locale: AppLocale; name: string }) {
  const { getAccessToken } = usePrivy(), copy = cheerEventCopy(locale), claimCopy = photocardClaimCopy(locale), titleId = useId(), hintId = useId();
  const provider = useRef(getAccessToken), pending = useRef<AbortController | null>(null), viewAction = useRef<HTMLDivElement>(null), focusResult = useRef(false);
  useLayoutEffect(() => { provider.current = getAccessToken; }, [getAccessToken]);
  const [data, setData] = useState<PhotocardClaim>(), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<string>(), [submitting, setSubmitting] = useState(false), [open, setOpen] = useState(false);
  const url = `/api/photocard-collections/${collectionId}/claim`;

  const read = useCallback(async (signal: AbortSignal) => {
    const token = await provider.current(); signal.throwIfAborted();
    if (!token) throw new Error();
    const response = await fetch(url, { cache: "no-store", credentials: "omit", signal, headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error();
    const result = photocardClaimSchema.parse(await response.json()); signal.throwIfAborted();
    return result;
  }, [url]);
  useEffect(() => {
    const controller = new AbortController();
    void read(controller.signal).then(result => { setData(result); setFailed(false); }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [retry, read]);
  useEffect(() => () => pending.current?.abort(), []);
  useLayoutEffect(() => {
    if (data?.assets.length && focusResult.current) {
      viewAction.current?.querySelector("button")?.focus(); focusResult.current = false;
    }
  }, [data]);

  async function claim() {
    if (!data || submitting || pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    setSubmitting(true); setFailed(false); focusResult.current = true;
    try {
      const token = await provider.current(); controller.signal.throwIfAborted();
      if (!token) throw new Error();
      const response = await fetch(url, { method: "POST", cache: "no-store", credentials: "omit", signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(data.mode === "member_pair" ? { bundleId: selected } : {}),
      });
      if (!response.ok) throw new Error();
      const result = photocardClaimSchema.parse(await response.json()); controller.signal.throwIfAborted();
      setData(result);
    } catch {
      if (controller.signal.aborted) return;
      // A lost response may still have committed the choice; read before offering another action.
      try { const result = await read(controller.signal); setData(result); setFailed(result.assets.length === 0); }
      catch { if (!controller.signal.aborted) setFailed(true); }
    } finally {
      if (!controller.signal.aborted) setSubmitting(false);
      pending.current = null;
    }
  }
  if (failed) return <div className={styles.photocardClaim}><p role="status">{claimCopy.failed}</p><FanAction variant="neutral" onClick={() => { setFailed(false); setData(undefined); setRetry(value => value + 1); }}>{copy.retry}</FanAction></div>;
  if (!data) return <p role="status">{copy.loading}</p>;
  if (!data.assets.length && (!data.ready || data.mode === "all")) return <p role="status">{copy.preparing}</p>;
  return <div className={styles.photocardClaim}>
    {data.assets.length ? <div ref={viewAction}><FanAction variant="neutral" onClick={() => setOpen(true)}>{copy.viewPhotocard}</FanAction></div> : <>
      {data.mode === "member_pair" ? <fieldset className={styles.photocardMembers} disabled={submitting} aria-describedby={hintId}>
        <legend>{claimCopy.choose}</legend>
        <div>{data.options.map(option => <label key={option.id}><input type="radio" name={titleId} value={option.id} checked={selected === option.id} onChange={() => setSelected(option.id)} /><span>{option.title}</span></label>)}</div>
      </fieldset> : null}
      <p id={hintId}>{data.mode === "member_pair" ? claimCopy.memberHint : claimCopy.randomHint}</p>
      <FanAction variant="neutral" disabled={submitting || (data.mode === "member_pair" && !selected)} ariaBusy={submitting} onClick={() => void claim()}>{submitting ? claimCopy.claiming : data.mode === "member_pair" ? claimCopy.claimPair : claimCopy.claimRandom}</FanAction>
    </>}
    <AccessibleOverlay open={open} onClose={() => setOpen(false)} labelledBy={titleId} backdropClassName={styles.backdrop} contentClassName={styles.photocardViewer}>
      <header className={styles.modalHeader}><h2 id={titleId}>{copy.photocard}</h2><button type="button" onClick={() => setOpen(false)} aria-label={copy.close}><X aria-hidden="true" /></button></header>
      <p>{copy.noDownload}</p>
      {open && data.assets.map(asset => <PhotocardMedia key={asset.id} asset={asset} locale={locale} alt={eventText(copy.photocardAlt, name)} />)}
    </AccessibleOverlay>
  </div>;
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
