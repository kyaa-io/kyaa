"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { z } from "zod";
import { ArrowUpRight, Check, ChevronRight, Clock3, X } from "lucide-react";
import { useByUsSession } from "@/components/byus-session-provider";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanState } from "@/components/fan-ui/fan-state";
import { AccessibleOverlay } from "@/components/ui/overlay/accessible-overlay";
import { useFanpageResource } from "@/features/fanpage/ui/use-fanpage-resource";
import { boardHref } from "@/features/fanpage/domain/board-navigation";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { SongEditor } from "@/features/live-submissions/ui/song-editor";
import { SongCard } from "@/features/live-submissions/ui/song-card";
import type { SongSelection } from "@/features/live-submissions/domain/song";
import { liveSubmissionsPageSchema, liveSubmissionInputSchema, mutationSchema, ownedLiveSubmissionSchema } from "@/features/schedules/domain/participation";
import { ActionFeedback, useDeadlinePassed, useParticipationAction } from "@/features/schedules/ui/participation-ui";
import { participationCatalogSchema, type ParticipationMission, type ParticipationSubmit } from "@/server/live-participation/domain";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { fandomCopy } from "@/i18n/catalogs/features__fandom";
import { supportCopy } from "@/i18n/catalogs/features__support";
import { participationCopy } from "@/i18n/catalogs/features__schedules__ui__participation";
import { useParticipationSubmit } from "./use-participation-submit";
import styles from "./fandom-screen.module.css";

export type ParticipationPhase = "before" | "during" | "after";
const parseCatalog = (value: unknown) => participationCatalogSchema.parse(value);
const parseSongs = (value: unknown) => liveSubmissionsPageSchema.parse(value);
const uploadSchema = z.object({ uploadId: z.uuid(), expiresAt: z.string() });

export function LiveParticipationPanel({ slug, creatorSlug, locale, phase, onPhaseChange }: {
  slug: string; creatorSlug: string; locale: AppLocale; phase: ParticipationPhase; onPhaseChange: (phase: ParticipationPhase) => void;
}) {
  const t = fandomCopy(locale), s = supportCopy(locale);
  const auth = usePrivy(), session = useByUsSession();
  const owner = auth.ready && auth.authenticated && session.ready ? session.ownerId ?? auth.user?.id : null;
  const resource = useFanpageResource(`/api/live-events/${encodeURIComponent(slug)}/participation?phase=${phase}`, parseCatalog, true);
  const [selected, setSelected] = useState<string | null>(null);
  const [records, setRecords] = useState(false);
  const data = resource.state.status === "ready" ? resource.state.data : null;
  const mission = data?.missions.find(item => item.id === selected);
  const identity = `${owner ?? "guest"}:${session.generation}:${slug}:${phase}`;
  return <section className={styles.participation} aria-label={t.activity}>
    <nav className={styles.phases} aria-label={t.live}>{(["before", "during", "after"] as const).map(value => <button key={value} type="button" aria-pressed={phase === value} onClick={() => { setSelected(null); setRecords(false); onPhaseChange(value); }}>{t[value]}</button>)}</nav>
    {!data ? <FanState kind={resource.state.status === "error" ? "error" : "loading"} title={resource.state.status === "error" ? s.error : s.loading} actions={resource.state.status === "error" ? <FanAction onClick={resource.retry}>{s.retry}</FanAction> : undefined} /> : <>
      {resource.refreshFailed && <p role="status">{s.error} <FanAction onClick={resource.retry}>{s.retry}</FanAction></p>}
      {!data.missions.length ? <FanState kind="empty" title={t.noMissions} /> : <ul className={styles.missions}>{data.missions.map(item => <li key={item.id}><button type="button" onClick={() => setSelected(item.id)}><span className={styles.missionText}><strong>{item.title}</strong><span>{item.description}</span></span><span className={styles.missionStatus} data-state={item.state}>{item.state === "approved" ? <><Check aria-hidden="true" size={16} />{t.approved}</> : item.state === "pending" ? <><Clock3 aria-hidden="true" size={16} />{t.pending}</> : item.state === "rejected" || item.state === "closed" ? t[item.state] : item.points ? `+${item.points.toLocaleString(locale)} P` : <ChevronRight aria-hidden="true" size={20} />}</span></button></li>)}</ul>}
      {owner && <><div className={styles.contribution}><span>{t.contribution}</span><strong>{data.contributionPoints.toLocaleString(locale)} P</strong></div><details className={styles.records} open={records} onToggle={event => setRecords(event.currentTarget.open)}><summary>{t.records}</summary>{data.missions.some(item => item.submissionId) ? <ul>{data.missions.filter(item => item.submissionId).map(item => <li key={item.id}><span>{item.title}</span><strong>{item.state === "available" ? t.pending : t[item.state]}</strong><span>{item.awardedPoints.toLocaleString(locale)} P</span></li>)}</ul> : <p>{t.noRecords}</p>}</details></>}
    </>}
    {mission && <MissionDialog key={`${identity}:${mission.id}`} mission={mission} slug={slug} creatorSlug={creatorSlug} locale={locale} owner={owner ?? null} onClose={() => setSelected(null)} onComplete={resource.retry} />}
  </section>;
}

function MissionDialog({ mission, slug, creatorSlug, locale, owner, onClose, onComplete }: {
  mission: ParticipationMission; slug: string; creatorSlug: string; locale: AppLocale; owner: string | null; onClose: () => void; onComplete: () => void;
}) {
  const t = fandomCopy(locale), s = supportCopy(locale), auth = usePrivy(), titleId = useId();
  const operation = useParticipationSubmit(slug, mission.id, onComplete);
  const [text, setText] = useState(mission.submittedText ?? ""), [url, setUrl] = useState(mission.submittedUrl ?? ""), [code, setCode] = useState("");
  const [answers, setAnswers] = useState<Record<string, string[]>>(Object.fromEntries((mission.submittedAnswers ?? []).map(answer => [answer.questionId, answer.optionIds]))), [role, setRole] = useState<"recording" | "guidance" | "highlights">(mission.crewRole ?? "recording");
  const [songId, setSongId] = useState("");
  const [proofs, setProofs] = useState<{ id: string; preview: string }[]>([]), [uploading, setUploading] = useState(false), [uploadError, setUploadError] = useState(false);
  const proofInput = useRef<HTMLInputElement>(null), closeButton = useRef<HTMLButtonElement>(null), restoreUploadFocus = useRef(false);
  const previews = useRef(new Set<string>()), uploadsController = useRef<AbortController | null>(null);
  const closed = useDeadlinePassed(mission.closesAt);
  const readOnly = mission.state === "approved" || mission.state === "pending" || mission.state === "closed" || closed || operation.saved || mission.kind === "bonus";
  const canProof = ["text", "url", "image", "song"].includes(mission.kind);
  const locked = readOnly || operation.busy || !!operation.pending || uploading;
  useLayoutEffect(() => { const urls = previews.current; return () => { uploadsController.current?.abort(); urls.forEach(value => URL.revokeObjectURL(value)); }; }, []);
  useEffect(() => { if (!uploading && restoreUploadFocus.current) { restoreUploadFocus.current = false; if (proofInput.current && !proofInput.current.disabled) proofInput.current.focus(); else closeButton.current?.focus(); } }, [uploading]);
  async function upload(files: FileList | null) {
    if (!files?.length || locked || uploading) return;
    const items = Array.from(files);
    if (proofs.length + items.length > 3 || items.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024 || !file.size)) { setUploadError(true); return; }
    const controller = new AbortController(); uploadsController.current = controller;
    restoreUploadFocus.current = true; setUploading(true); setUploadError(false);
    try {
      for (const file of items) {
        const result = await withRequestDeadline(async signal => {
          const token = await auth.getAccessToken(); signal.throwIfAborted();
          if (!token) throw new Error("Auth required");
          const body = new FormData(); body.set("file", file);
          const response = await fetch(`/api/live-events/${encodeURIComponent(slug)}/participation/${mission.id}/uploads`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body, signal });
          if (!response.ok) throw new Error("Upload failed");
          return uploadSchema.parse(await response.json());
        }, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const preview = URL.createObjectURL(file); previews.current.add(preview);
        setProofs(previous => [...previous, { id: result.uploadId, preview }]);
      }
    } catch { if (!controller.signal.aborted) setUploadError(true); }
    finally { if (!controller.signal.aborted) setUploading(false); }
  }
  function payload(): ParticipationSubmit["payload"] {
    const uploadIds = proofs.map(item => item.id);
    switch (mission.kind) {
      case "reservation": case "waiting": case "return": return { kind: mission.kind };
      case "attendance": return { kind: "attendance", code };
      case "text": return { kind: "text", text, uploadIds };
      case "url": return { kind: "url", url, text, uploadIds };
      case "image": return { kind: "image", text, uploadIds };
      case "song": return { kind: "song", submissionId: songId, text, uploadIds };
      case "crew": return { kind: "crew", role };
      case "choice": case "quiz": return { kind: mission.kind, answers: mission.questions.map(question => ({ questionId: question.id, optionIds: answers[question.id] ?? [] })) };
      default: throw new Error("Administrator-only mission");
    }
  }
  const error = operation.error?.includes("INCORRECT") ? t.wrong : operation.error === "UNKNOWN" ? t.unknown : operation.error ? t.invalid : null;
  const waitingHref = mission.source.threadId ? `/c/${encodeURIComponent(creatorSlug)}/community/${mission.source.threadId}?locale=${locale}` : boardHref(creatorSlug, locale, { source: "fans" });
  return <AccessibleOverlay open onClose={onClose} labelledBy={titleId} backdropClassName={styles.backdrop} contentClassName={styles.dialog} busy={operation.busy || uploading} variant="bottom-sheet">
    <header className={styles.dialogHeader}><div><span className={styles.eyebrow}>{t[mission.phase]} · {mission.points.toLocaleString(locale)} P</span><h2 id={titleId}>{mission.title}</h2></div><button type="button" ref={closeButton} className={styles.close} aria-label={t.close} onClick={onClose} disabled={operation.busy || uploading}><X aria-hidden="true" size={22} /></button></header>
    <p className={styles.description}>{mission.description}</p>
    <p className={styles.meta}>{t.deadline} <time dateTime={mission.closesAt}>{new Date(mission.closesAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul" })} KST</time></p>
    {mission.rewardMode === "attendance_highest" && <p className={styles.rule}>{t.attendanceRule}</p>}
    {["early", "first"].includes(mission.key) && <p className={styles.rule}>{t.earlyProofHelp}</p>}
    {mission.kind === "crew" && <p className={styles.rule}>{t.noReward}</p>}
    {mission.kind === "return" && <p className={styles.rule}>{t.returnRule}</p>}
    {mission.kind === "bonus" && <p className={styles.rule}>{t.bonusRule}</p>}
    {mission.rejectionReason && <p role="status" className={styles.rejection}>{t.rejected} · {mission.rejectionReason}</p>}
    {!owner ? <FanState kind="auth" title={t.guest} actions={<FanAction href={`/login?locale=${locale}&returnTo=${encodeURIComponent(`/fandom?locale=${locale}&creator=${creatorSlug}&live=${slug}&phase=${mission.phase}`)}`} variant="primary">{s.login}</FanAction>} /> : <>
      {operation.saved && <p role="status" className={styles.success}><Check size={20} aria-hidden="true" />{t.received}</p>}
      {readOnly && !operation.saved && mission.kind !== "bonus" && <p className={styles.rule}>{mission.state === "approved" ? `${t.approved} · ${mission.awardedPoints.toLocaleString(locale)} P` : mission.state === "pending" ? t.pending : t.closed}</p>}
      <form className={styles.form} onSubmit={event => { event.preventDefault(); if (!locked) void operation.submit(payload()); }}>
        <fieldset disabled={locked}>
          {mission.kind === "song" && !readOnly && <SongRequest slug={slug} locale={locale} value={songId} onSelect={setSongId} />}
          {["text", "url", "image", "song"].includes(mission.kind) && <label>{t.text}<textarea rows={5} maxLength={mission.kind === "text" ? 5000 : 2000} required={mission.kind === "text" || mission.key === "highlight"} value={text} onChange={event => setText(event.target.value)} /></label>}
          {mission.kind === "url" && <label>{t.url}<input type="url" required value={url} onChange={event => setUrl(event.target.value)} /></label>}
          {mission.kind === "attendance" && <label>{t.code}<input required autoComplete="off" maxLength={32} value={code} onChange={event => setCode(event.target.value)} /></label>}
          {mission.kind === "crew" && <fieldset className={styles.choices}><legend>{t.role}</legend>{(["recording", "guidance", "highlights"] as const).map(value => <label key={value}><input type="radio" name={`role-${mission.id}`} checked={role === value} onChange={() => setRole(value)} /><span>{t[value]}</span></label>)}</fieldset>}
          {(mission.kind === "choice" || mission.kind === "quiz") && mission.questions.map(question => <fieldset key={question.id} className={styles.choices}><legend>{question.prompt}</legend>{question.options.map(option => <label key={option.id}><input type={question.multiple ? "checkbox" : "radio"} name={question.id} checked={answers[question.id]?.includes(option.id) ?? false} onChange={event => setAnswers(previous => ({ ...previous, [question.id]: question.multiple ? event.target.checked ? [...(previous[question.id] ?? []), option.id] : (previous[question.id] ?? []).filter(id => id !== option.id) : [option.id] }))} /><span>{option.label}</span>{option.responseCount !== undefined && <strong>{option.responseCount.toLocaleString(locale)}</strong>}</label>)}</fieldset>)}
          {canProof && !readOnly && <div className={styles.proof}><label>{t.proof}<input ref={proofInput} type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={locked || proofs.length >= 3} onChange={event => { void upload(event.target.files); event.target.value = ""; }} aria-describedby={`${titleId}-proof`} /></label><p id={`${titleId}-proof`} className={styles.meta}>{t.proofHelp}</p><p className={styles.meta}>{t.privateProof}</p>{proofs.length > 0 && <ul className={styles.proofList}>{proofs.map((proof, index) => <li key={proof.id}><img src={proof.preview} alt={`${t.proof} ${index + 1}`} /><button type="button" onClick={() => { URL.revokeObjectURL(proof.preview); previews.current.delete(proof.preview); setProofs(previous => previous.filter(item => item.id !== proof.id)); }}>{t.remove} {index + 1}</button></li>)}</ul>}</div>}
        </fieldset>
        {uploading && <p role="status">{t.submitting}</p>}
        {uploadError && <p role="alert">{t.proofError}</p>}
        {error && <p role="alert">{error}</p>}
        {operation.pending && !operation.busy ? <FanAction fullWidth variant="primary" onClick={() => void operation.retry()}>{s.retry}</FanAction> : !readOnly && <FanAction fullWidth variant="primary" type="submit" disabled={locked || (mission.kind === "song" && !songId) || (mission.kind === "image" && !proofs.length)}>{operation.busy ? t.submitting : t.submit}</FanAction>}
      </form>
    </>}
    {mission.kind === "waiting" && <FanAction fullWidth href={waitingHref} trailingIcon={<ArrowUpRight size={18} />}>{t.waiting}</FanAction>}
  </AccessibleOverlay>;
}

function SongRequest({ slug, locale, value, onSelect }: { slug: string; locale: AppLocale; value: string; onSelect: (id: string) => void }) {
  const t = fandomCopy(locale), c = participationCopy(locale), s = supportCopy(locale), action = useParticipationAction();
  const resource = useFanpageResource(`/api/live-events/${encodeURIComponent(slug)}/submissions?contract=songs-v1&locale=${toContentLocale(locale)}`, parseSongs);
  const [song, setSong] = useState<SongSelection | null>(null);
  const data = resource.state.status === "ready" ? resource.state.data : null;
  const songs = data?.mine.filter(item => item.kind === "song" && item.status !== "hidden") ?? [];
  const closed = useDeadlinePassed(data?.settings.closesAt);
  return <div className={styles.songRequest}><p>{t.songHelp}</p>{!data ? <FanState kind={resource.state.status === "error" ? "error" : "loading"} title={resource.state.status === "error" ? s.error : s.loading} actions={resource.state.status === "error" ? <FanAction onClick={resource.retry}>{s.retry}</FanAction> : undefined} /> : songs.length ? <fieldset className={styles.choices}><legend>{t.chooseSong}</legend>{songs.map(item => <label key={item.id}><input type="radio" name={`song-${slug}`} checked={value === item.id} onChange={() => onSelect(item.id)} /><span>{item.song ? <SongCard song={item.song} locale={locale} /> : item.body}</span></label>)}</fieldset> : data.settings.accepting && !closed && data.access !== "members_required" ? <><SongEditor slug={slug} locale={locale} value={song} onChange={setSong} /><FanAction disabled={action.busy || !action.ready || !song?.title.trim() || !song.artist.trim()} onClick={async () => {
    const input = { kind: "song" as const, body: song?.title ?? "", song, publicVisible: true };
    try {
      const result = await action.run(`/api/live-events/${encodeURIComponent(slug)}/submissions?contract=songs-v1`, "POST", liveSubmissionInputSchema.parse({ ...input, idempotencyKey: action.idempotencyKey(input) }), v => mutationSchema(ownedLiveSubmissionSchema).parse(v));
      if (result) { onSelect(result.item.id); resource.retry(); }
    } catch { action.setError("INVALID_REQUEST"); }
  }}>{c.submit}</FanAction><ActionFeedback locale={locale} error={action.error} /></> : <p>{t.closed}</p>}</div>;
}
