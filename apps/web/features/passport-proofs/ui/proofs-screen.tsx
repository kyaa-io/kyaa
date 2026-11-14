"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ImagePlus } from "lucide-react";

import { DukjilProvider, useDukjil } from "@/features/dukjil/ui/dukjil-provider";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { POINT_COIN_SRC, EarnBadge } from "@/features/dukjil/ui/earn-badge";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanLockedRows } from "@/components/fan-ui/fan-locked-value";
import { GuestLoginAction } from "@/features/my/ui/guest-login";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { ContentActions } from "@/features/content-safety/ui/content-actions";
import { PROOF_NOTE_MAX, SNS_POST_PROOF, SUBMITTABLE_PROOF_TYPES, proofTypeSchema, type MyProofItem, type ProofBoardItem, type ProofType } from "@/features/passport/domain/proof-types";
import type { AppLocale } from "@/i18n/locales";
import { ProofImageMask } from "./proof-image-mask";
import { maskAndEncode, PROOF_MAX_IMAGES, type MaskRect } from "./proof-image";
import { listMyProofs, listProofBoard, listProofMissions, ProofRequestError, resubmitProof, submitProof, uploadProofImage, type ProofFailure, type TokenGetter } from "./proof-api";
import { proofsText, type ProofsCopyKey } from "./proofs-copy";
import styles from "./proofs.module.css";

const TYPE_KEY: Record<ProofType, ProofsCopyKey> = {
  membership: "pfTypeMembership", purchase: "pfTypePurchase", receipt: "pfTypeReceipt", ticket: "pfTypeTicket",
  donation: "pfTypeDonation", funding: "pfTypeFunding", kyaa_payment: "pfTypeKyaaPayment", sns_post: "pfTypeSns",
};
const STATUS_KEY: Record<MyProofItem["status"], ProofsCopyKey> = {
  pending: "pfStatusPending", in_review: "pfStatusPending", approved: "pfStatusApproved",
  changes_requested: "pfStatusChanges", rejected: "pfStatusRejected",
};
const FAILURE_KEY: Record<ProofFailure, ProofsCopyKey> = {
  limit: "pfErrLimit", pii: "pfErrPii", upload: "pfErrUpload", expired: "pfErrExpired", open: "pfErrOpen", approved: "pfErrApproved", auth: "pfLogin", generic: "pfErrGeneric",
};

type Picked = { id: string; file: File; url: string; masks: MaskRect[] };
type Resource<T> = { status: "loading" } | { status: "error"; auth?: boolean } | { status: "ready"; data: T };

/** "찐팬 n번째" title. Rendered only when the server gave a rank. */
export function JjinfanTitle({ locale, rank }: { locale: AppLocale; rank: number }) {
  return <span className={styles.fanTitle} data-jjinfan-title>{proofsText(locale, "pfFanTitle", [rank])}</span>;
}

export function ProofStatusBadge({ locale, status }: { locale: AppLocale; status: MyProofItem["status"] }) {
  return <span className={styles.status} data-status={status}>{proofsText(locale, STATUS_KEY[status])}</span>;
}

export function ProofHistory({ locale, items, onResubmit }: { locale: AppLocale; items: MyProofItem[]; onResubmit: (item: MyProofItem) => void }) {
  if (!items.length) return <p className={styles.state}>{proofsText(locale, "pfEmpty")}</p>;
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.submissionId} className={styles.historyRow}>
          <div className={styles.rowHead}>
            <strong className={styles.rowTitle}>{proofsText(locale, TYPE_KEY[item.proofType])}</strong>
            <ProofStatusBadge locale={locale} status={item.status} />
          </div>
          {item.reason ? <p className={styles.reason}><span>{proofsText(locale, "pfReason")}</span> {item.reason}</p> : null}
          {item.status === "changes_requested" ? <FanAction variant="neutral" onClick={() => onResubmit(item)}>{proofsText(locale, "pfResubmit")}</FanAction> : null}
        </li>
      ))}
    </ul>
  );
}

export function ProofBoardList({ locale, items, onChanged, photoFeed = false }: { locale: AppLocale; items: ProofBoardItem[]; onChanged?: () => void; photoFeed?: boolean }) {
  // After a block succeeds the card goes away at once (by post id, no author id); the re-fetch then drops the author's other posts.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const shown = items.filter((item) => !hidden.has(item.postId) && (!photoFeed || Boolean(item.imageUrl)));
  if (!shown.length) return <p className={styles.state}>{proofsText(locale, "pfBoardEmpty")}</p>;
  return (
    <ul className={photoFeed ? styles.photoFeed : styles.list}>
      {shown.map((item) => (
        <li key={item.postId} className={styles.historyRow}>
          <div className={styles.rowHead}>
            <strong className={styles.rowTitle}>{proofsText(locale, TYPE_KEY[item.proofType])}</strong>
            {item.jjinfanRank ? <JjinfanTitle locale={locale} rank={item.jjinfanRank} /> : null}
            <ContentActions targetType="fan_post" targetId={item.postId} locale={locale} onChanged={() => { setHidden((current) => new Set(current).add(item.postId)); onChanged?.(); }} />
          </div>
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- API-streamed masked proof image
            <img className={styles.boardImage} src={item.imageUrl} alt="" loading="lazy" />
          ) : null}
          {item.awardedPoints != null ? <EarnBadge variant="inline" locale={locale} points={item.awardedPoints} /> : null}
          {!photoFeed ? <p className={styles.body}>{item.body}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function useResource<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<Resource<T>>({ status: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: "loading" });
    load().then((data) => live && setState({ status: "ready", data }), (error) => live && setState({ status: "error", auth: error instanceof ProofRequestError && error.kind === "auth" }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { state, retry: () => setTick((value) => value + 1) };
}

function Failure({ locale, retry }: { locale: AppLocale; retry: () => void }) {
  return <p className={styles.state} role="alert">{proofsText(locale, "pfError")}<FanAction variant="text" onClick={retry}>{proofsText(locale, "pfRetry")}</FanAction></p>;
}

export function PublicProofsTab({ locale, slug }: { locale: AppLocale; slug: string }) {
  return <DukjilProvider slug={slug} locale={locale}><PublicProofsFeed locale={locale} slug={slug} /></DukjilProvider>;
}

function PublicProofsFeed({ locale, slug }: { locale: AppLocale; slug: string }) {
  const dukjil = useDukjil();
  const points = dukjil?.status === "on" ? dukjil.catalog?.rules.proof?.points : undefined;
  const auth = useByUsAuth();
  const board = useResource(async () => {
    const token = auth.ready && auth.authenticated ? await auth.getAccessToken() : null;
    return listProofBoard(slug, undefined, token);
  }, [slug, auth.ready, auth.authenticated]);
  return <section data-block="proof-feed" className={styles.panel}>
    <div className={styles.feedActions}>
    {typeof points === "number" ? <FanNumber value={points} unit="P" locale={locale} size="xl" icon={<span className={styles.rewardIcon}><img src={POINT_COIN_SRC} width={32} height={32} alt="" /><span className={styles.rewardPlus}>+</span></span>} /> : null}
    <FanAction href={`/c/${slug}/proofs?locale=${locale}`} variant="neutral">{locale === "ko" ? "인증하기" : "Submit proof"}</FanAction>
    </div>
    {board.state.status === "loading" ? <p role="status">{proofsText(locale, "pfLoading")}</p> : null}
    {board.state.status === "error" ? <Failure locale={locale} retry={board.retry} /> : null}
    {board.state.status === "ready" ? <ProofBoardList locale={locale} items={board.state.data.items} onChanged={board.retry} photoFeed /> : null}
  </section>;
}

type Props = { locale: AppLocale; slug: string };

export function ProofsScreen({ locale, slug }: Props) {
  const auth = useByUsAuth();
  const getToken = useCallback<TokenGetter>(
    () => (auth.ready && auth.authenticated ? auth.getAccessToken() : Promise.resolve(null)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auth.ready, auth.authenticated],
  );
  const history = useResource(() => (auth.ready ? listMyProofs(getToken, slug) : new Promise<never>(() => {})), [slug, auth.ready, getToken]);
  const board = useResource(async () => {
    const token = auth.ready && auth.authenticated ? await auth.getAccessToken().catch(() => null) : null;
    return listProofBoard(slug, undefined, token);
  }, [slug, auth.ready, auth.authenticated]);
  const missions = useResource(() => (auth.ready ? listProofMissions(getToken, slug) : new Promise<never>(() => {})), [slug, auth.ready, getToken]);
  // The passport 07 card links here with ?type=sns_post; an unknown value falls back to the first listed type.
  const linkedType = proofTypeSchema.safeParse(useSearchParams()?.get("type")).data ?? null;
  const [chosenType, setChosenType] = useState<ProofType | null>(linkedType);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [note, setNote] = useState("");
  const [publish, setPublish] = useState(false);
  const [amountVisible, setAmountVisible] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [resubmitting, setResubmitting] = useState<MyProofItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ProofFailure | null>(null);
  const counter = useRef(0);
  const urls = useRef<string[]>([]);
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const room = PROOF_MAX_IMAGES - picked.length;
    const next = Array.from(files).slice(0, Math.max(0, room)).map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      return { id: `p${counter.current++}`, file, url, masks: [] };
    });
    setPicked((current) => [...current, ...next]);
  };
  const missionList = missions.state.status === "ready" ? missions.state.data : [];
  const types = SUBMITTABLE_PROOF_TYPES.filter((type) => missionList.some((item) => item.proofType === type));
  const proofType = (resubmitting?.proofType ?? (chosenType && types.includes(chosenType) ? chosenType : types[0])) as ProofType | undefined;
  const ofType = missionList.filter((item) => item.proofType === proofType);
  const mission = ofType.find((item) => item.submittable) ?? ofType[0];
  const blocked = !resubmitting && mission && !mission.submittable ? mission.unavailableReason : null;
  // An SNS post screenshot fills slot 07 only; it is never shown on the verified board.
  const publishable = proofType !== SNS_POST_PROOF;
  const canSubmit = !busy && Boolean(mission) && !blocked && picked.length > 0 && (resubmitting || privacy);

  const submit = async () => {
    if (!mission || !proofType) return;
    setBusy(true);
    setFailure(null);
    try {
      const encoded = await Promise.all(picked.map((item) => maskAndEncode(item.file, item.masks)));
      const uploadId = await uploadProofImage(getToken, mission.missionId, encoded[0].blob);
      const imagePhash = encoded.map((item) => item.phash);
      const trimmed = note.trim() ? note.trim().slice(0, PROOF_NOTE_MAX) : undefined;
      if (resubmitting) await resubmitProof(getToken, resubmitting.submissionId, { expectedRevision: resubmitting.revision, uploadId, imagePhash, note: trimmed, locale });
      else await submitProof(getToken, { creator: slug, proofType, uploadId, publishConsent: publishable && publish, amountVisible: publishable && publish ? amountVisible : null, imagePhash, note: trimmed, locale });
      setPicked([]); setNote(""); setPrivacy(false); setResubmitting(null);
      history.retry();
    } catch (error) {
      setFailure(error instanceof ProofRequestError ? error.kind : "generic");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <h1>{proofsText(locale, linkedType === SNS_POST_PROOF ? "pfTitleSns" : "pfTitle")}</h1>
      {missions.state.status === "loading" ? <p className={styles.state}>{proofsText(locale, "pfLoading")}</p> : null}
      {missions.state.status === "error" && missions.state.auth ? <p className={styles.state}><GuestLoginAction locale={locale} returnTo={`/c/${slug}/proofs?locale=${locale}`} variant="primary" /></p> : null}
      {missions.state.status === "error" && !missions.state.auth ? <Failure locale={locale} retry={missions.retry} /> : null}
      {missions.state.status === "ready" && !types.length ? <p className={styles.state}>{proofsText(locale, "pfNoMission")}</p> : null}
      {missions.state.status === "ready" && types.length ? (
      <section className={styles.panel} aria-labelledby="pf-form">
        <p>{locale === "ko" ? "개인정보(이름·주소·카드번호 등)는 가리고 올려 주세요" : "Hide personal information (name, address, card number, etc.) before uploading."}</p>
        <fieldset className={styles.types} disabled={busy || Boolean(resubmitting)}>
          <legend id="pf-form" className={styles.label}>{proofsText(locale, "pfTypeLabel")}</legend>
          {types.map((type) => (
            <label key={type} className={styles.chip} data-selected={proofType === type}>
              <input type="radio" name="proofType" value={type} checked={proofType === type} onChange={() => setChosenType(type)} />
              {proofsText(locale, TYPE_KEY[type])}
            </label>
          ))}
        </fieldset>
        <div className={styles.field}>
          <span className={styles.label}>{proofsText(locale, "pfImages")}</span>
          <div className={styles.images}>
            {picked.map((item) => (
              <ProofImageMask key={item.id} locale={locale} src={item.url} masks={item.masks}
                onChange={(masks) => setPicked((current) => current.map((entry) => (entry.id === item.id ? { ...entry, masks } : entry)))}
                onRemove={() => setPicked((current) => current.filter((entry) => entry.id !== item.id))} />
            ))}
            {picked.length < PROOF_MAX_IMAGES ? (
              <label className={styles.addImage}>
                <ImagePlus size={24} aria-hidden />
                {proofsText(locale, "pfAddImage")}
                <input type="file" accept="image/*" multiple className={styles.fileInput} onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
              </label>
            ) : null}
          </div>
        </div>
        <label className={styles.field}>
          <span className={styles.label}>{proofsText(locale, "pfNote")}</span>
          <input className={styles.input} value={note} maxLength={PROOF_NOTE_MAX} onChange={(event) => setNote(event.target.value)} />
        </label>
        {!resubmitting ? (
          <>
            {publishable ? <label className={styles.check}><input type="checkbox" checked={publish} onChange={(event) => setPublish(event.target.checked)} />{proofsText(locale, "pfPublish")}</label> : null}
            {publishable && publish ? <label className={styles.check}><input type="checkbox" checked={amountVisible} onChange={(event) => setAmountVisible(event.target.checked)} />{proofsText(locale, "pfAmountVisible")}</label> : null}
            <label className={styles.check}><input type="checkbox" checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} required />{proofsText(locale, "pfPrivacy")}</label>
          </>
        ) : null}
        {blocked ? <p className={styles.error} role="alert">{proofsText(locale, blocked === "PROOF_MONTHLY_LIMIT" ? "pfErrLimit" : blocked === "PROOF_ALREADY_APPROVED" ? "pfErrApproved" : "pfErrOpen")}</p> : null}
        {failure ? <p className={styles.error} role="alert">{proofsText(locale, FAILURE_KEY[failure])}</p> : null}
        <FanAction variant="primary" disabled={!canSubmit} onClick={submit}>
          {busy ? proofsText(locale, "pfSubmitting") : proofsText(locale, resubmitting ? "pfResubmit" : "pfSubmit")}
        </FanAction>
      </section>
      ) : null}
      <section className={styles.panel} aria-labelledby="pf-history">
        <h2 id="pf-history">{proofsText(locale, "pfHistory")}</h2>
        {history.state.status === "loading" ? <p className={styles.state}>{proofsText(locale, "pfLoading")}</p> : null}
        {history.state.status === "error" && history.state.auth ? <FanLockedRows rows={2} /> : null}
        {history.state.status === "error" && !history.state.auth ? <Failure locale={locale} retry={history.retry} /> : null}
        {history.state.status === "ready" ? <ProofHistory locale={locale} items={history.state.data} onResubmit={(item) => { setResubmitting(item); setFailure(null); }} /> : null}
      </section>
      <section className={styles.panel} aria-labelledby="pf-board">
        <h2 id="pf-board">{proofsText(locale, "pfBoard")}</h2>
        {board.state.status === "loading" ? <p className={styles.state}>{proofsText(locale, "pfLoading")}</p> : null}
        {board.state.status === "error" ? <Failure locale={locale} retry={board.retry} /> : null}
        {board.state.status === "ready" ? <ProofBoardList locale={locale} items={board.state.data.items} onChanged={board.retry} /> : null}
      </section>
    </div>
  );
}
