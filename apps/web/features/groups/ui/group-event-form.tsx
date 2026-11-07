"use client";
import { AlignLeft, CalendarRange, Camera, Globe, ImagePlus, ListChecks, MapPin, ShieldCheck, Users } from "lucide-react";
import { useEffect, useLayoutEffect, useState, type FormEvent } from "react";
import type { z } from "zod";
import { FanAction } from "@/components/fan-ui/fan-action";
import { useWaveMediaUpload } from "@/features/content-safety/ui/use-wave-media-upload";
import { localScheduleTime, scheduleInstant } from "@/features/schedules/domain/schedule-time";
import { participationCopy } from "@/i18n/catalogs/features__schedules__ui__participation";
import type { AppLocale } from "@/i18n/locales";
import type { GroupEvent } from "@/server/group-activities/domain";
import { activitiesCopy } from "./activities-copy";
import { groupsCopy } from "./copy";
import { eventSaveReceipt } from "./event-source-panels";
import { GroupEventMissionField } from "./group-event-mission-field";
import { GroupImage } from "./group-image";
import { imageAssetInput } from "./group-image-field";
import { manageText } from "./manage-copy";
import { managementCopy } from "./management-copy";
import { useActivitySave } from "./use-activity-save";
import styles from "./group-event-form.module.css";

const ZONE = "Asia/Seoul", HOUR = 3_600_000;
const local = (value?: string) => value ? localScheduleTime(value, ZONE) : "";
const instant = (value: string) => scheduleInstant(value, ZONE);
const openPicker = (input: HTMLInputElement) => { try { input.showPicker?.(); } catch { /* 지원하지 않거나 사용자 동작이 아니면 입력 칸으로 둔다. */ } };

/**
 * 서버는 종료·신청 기간·장소가 모두 있어야 받는다(`server/group-activities/routes.ts` eventInput).
 * 화면의 필수 칸은 이름과 시작뿐이라 나머지는 여기서 채운다. 종료는 시작+2시간, 신청은 지금부터 시작 전까지.
 */
export function eventDates(input: { startsAt: string; endsAt?: string; opensAt?: string; closesAt?: string }, now = Date.now()) {
  const startsAt = instant(input.startsAt), start = Date.parse(startsAt);
  const endsAt = input.endsAt ? instant(input.endsAt) : new Date(start + 2 * HOUR).toISOString();
  const closesAt = input.closesAt ? instant(input.closesAt) : startsAt;
  const close = Date.parse(closesAt);
  const opensAt = input.opensAt ? instant(input.opensAt) : new Date(now < close ? now : close - 24 * HOUR).toISOString();
  const valid = start < Date.parse(endsAt) && Date.parse(opensAt) < close && close <= Date.parse(endsAt);
  return { startsAt, endsAt, opensAt, closesAt, valid };
}

/** `20261211201000_group_event_approval.sql`의 core_changed와 같은 칸만 본다. */
function needsApprovalAgain(initial: GroupEvent, form: FormData) {
  if ((initial.approvalStatus ?? "approved") !== "approved") return false;
  const capacity = form.get("capacity") ? Number(form.get("capacity")) : null;
  const mission = form.has("linkedMissionId") ? String(form.get("linkedMissionId")) || null : initial.linkedMissionId ?? null;
  return String(form.get("title") ?? "").trim() !== initial.title
    || form.get("startsAt") !== local(initial.startsAt)
    || form.get("endsAt") !== local(initial.endsAt)
    || String(form.get("location") ?? "").trim() !== initial.location
    || mission !== (initial.linkedMissionId ?? null)
    || (initial.capacity !== null && (capacity === null || capacity > initial.capacity))
    || (initial.requiresApproval && form.get("requiresApproval") !== "on");
}

export function ActivityCover({ locale, initialUrl, disabled, onReadyChange }: { locale: AppLocale; initialUrl?: string | null; disabled: boolean; onReadyChange: (ready: boolean) => void }) {
  const t = groupsCopy(locale), m = managementCopy(locale), upload = useWaveMediaUpload("group_image", 1), task = upload.items[0], ready = !task || Boolean(upload.ready && !upload.busy && !task.failed);
  const [removed, setRemoved] = useState(false), [preview, setPreview] = useState<{ file: File; url: string }>();
  useLayoutEffect(() => { onReadyChange(ready); }, [ready, onReadyChange]);
  useEffect(() => { if (!task) return; const url = URL.createObjectURL(task.file); setPreview({ file: task.file, url }); return () => URL.revokeObjectURL(url); }, [task]);
  const url = task && preview?.file === task.file ? preview.url : !removed ? initialUrl : undefined;
  const label = manageText(locale, url ? "eventCoverChange" : "eventCoverAdd");
  return <div className={styles.coverColumn}>
    <div className={styles.cover}>
      {url ? <GroupImage locale={locale} src={url} alt="" /> : <span className={styles.coverEmpty}><ImagePlus size={32} aria-hidden="true" />{label}</span>}
      <label className={styles.coverPick} title={label}><Camera size={20} aria-hidden="true" /><input type="file" aria-label={label} accept="image/jpeg,image/png,image/webp" disabled={disabled || upload.busy || Boolean(task)} onChange={event => { const file = event.target.files?.[0]; if (file) { setRemoved(false); upload.add([file]); } event.target.value = ""; }} /></label>
    </div>
    {(url || task) && <FanAction variant="text" disabled={disabled || upload.busy} onClick={() => { if (task) { upload.remove(task.key); setRemoved(false); } else setRemoved(true); }}>{m.remove}</FanAction>}
    {task?.failed && <FanAction disabled={disabled} onClick={() => upload.retry(task)}>{t.retry}</FanAction>}
    {upload.invalid && <p role="alert" className={styles.error}>{t.error}</p>}
    <input type="hidden" name="imageAssetId" disabled={!task && !removed} value={task?.assetId ?? ""} />
  </div>;
}

/** 행사 만들기·고치기 한 화면. 왼쪽 큰 커버, 오른쪽에 이름, 날짜, 장소, 설명, 옵션. */
export function GroupEventEditor({ pageId, locale, initial, pageName, narrow = false, done = () => {} }: { pageId: string; locale: AppLocale; initial?: GroupEvent; pageName?: string; narrow?: boolean; done?: (event?: GroupEvent) => void }) {
  const t = groupsCopy(locale), m = managementCopy(locale), c = activitiesCopy(locale), r = useActivitySave();
  const [imageReady, setImageReady] = useState(true), [invalid, setInvalid] = useState(false), [renewal, setRenewal] = useState(false);
  const [start, setStart] = useState(local(initial?.startsAt)), [end, setEnd] = useState(local(initial?.endsAt)), [endEdited, setEndEdited] = useState(Boolean(initial));
  const [state, setState] = useState<GroupEvent["state"]>(initial?.state ?? "published");
  const changeStart = (value: string) => {
    setStart(value);
    if (endEdited) return;
    try { setEnd(value ? local(new Date(Date.parse(instant(value)) + 2 * HOUR).toISOString()) : ""); } catch { setEnd(""); }
  };
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!imageReady) return;
    const f = new FormData(event.currentTarget), text = (key: string) => String(f.get(key) ?? "");
    let dates: ReturnType<typeof eventDates>;
    try { dates = eventDates({ startsAt: text("startsAt"), endsAt: text("endsAt"), opensAt: text("opensAt"), closesAt: text("closesAt") }); } catch { setInvalid(true); return; }
    if (!dates.valid) { setInvalid(true); return; }
    setInvalid(false);
    const { startsAt, endsAt, opensAt, closesAt } = dates;
    void r.save(`/api/groups/${pageId}/events${initial ? `/${initial.id}` : ""}`, initial ? "PATCH" : "POST", {
      expectedRevision: initial?.revision, title: f.get("title"), description: text("description"), imageAssetId: imageAssetInput(f), startsAt, endsAt, opensAt, closesAt,
      location: text("location").trim() || manageText(locale, "eventLocationUndecided"), capacity: f.get("capacity") ? Number(f.get("capacity")) : null, requiresApproval: f.get("requiresApproval") === "on", state: f.get("state"),
      ...(f.has("linkedMissionId") ? { linkedMissionId: text("linkedMissionId") || null } : {}),
    }, (receipt: z.infer<typeof eventSaveReceipt>) => done("event" in receipt ? receipt.event : undefined), eventSaveReceipt.parse);
  }
  const dateRow = (name: "startsAt" | "endsAt", label: string, value: string, change: (next: string) => void, required: boolean) => <label className={styles.row}><span className={styles.rowLabel}>{label}</span><input name={name} type="datetime-local" className={styles.rowInput} required={required} value={value} disabled={r.busy} onClick={event => openPicker(event.currentTarget)} onChange={event => change(event.target.value)} /></label>;
  return <form className={styles.editor} data-narrow={narrow ? "" : undefined} data-source-id="XwD8y" onSubmit={submit} onChange={event => { if (initial) setRenewal(needsApprovalAgain(initial, new FormData(event.currentTarget))); }}>
    <ActivityCover locale={locale} initialUrl={initial?.imageUrl} disabled={r.busy} onReadyChange={setImageReady} />
    <div className={styles.main}>
      <div className={styles.top}>
        {pageName && <span className={styles.pageName}>{pageName}</span>}
        <select name="state" className={styles.state} aria-label={t.events} value={state} disabled={r.busy} onChange={event => setState(event.target.value as GroupEvent["state"])}>
          <option value="published">{c.published}</option><option value="draft">{c.draft}</option>
          {initial && <><option value="cancelled">{c.cancel}</option><option value="ended">{c.closed}</option></>}
        </select>
      </div>
      <input name="title" className={styles.title} aria-label={manageText(locale, "eventName")} placeholder={manageText(locale, "eventName")} required maxLength={200} defaultValue={initial?.title} disabled={r.busy} />
      <div className={styles.group}>
        {dateRow("startsAt", c.starts, start, changeStart, true)}
        {dateRow("endsAt", c.ends, end, value => { setEnd(value); setEndEdited(true); }, false)}
        <div className={`${styles.row} ${styles.zone}`}><span>{participationCopy(locale).timezone}</span><span><Globe size={14} aria-hidden="true" /> {ZONE}</span></div>
      </div>
      <label className={styles.group}><span className={styles.row}><MapPin size={20} aria-hidden="true" /><input name="location" className={styles.rowInput} aria-label={manageText(locale, "eventLocation")} placeholder={manageText(locale, "eventLocationAdd")} maxLength={300} defaultValue={initial?.location} disabled={r.busy} /></span></label>
      <label className={styles.group}><span className={styles.row} data-start=""><AlignLeft size={20} aria-hidden="true" /><textarea name="description" className={styles.rowInput} aria-label={manageText(locale, "eventDescription")} placeholder={manageText(locale, "eventDescriptionAdd")} rows={1} maxLength={10000} defaultValue={initial?.description} disabled={r.busy} /></span></label>
      <h3 className={styles.optionsTitle}>{manageText(locale, "eventOptions")}</h3>
      <div className={styles.group}>
        <label className={styles.row}><ShieldCheck size={20} aria-hidden="true" /><span className={styles.optionLabel}>{c.approval}</span><input name="requiresApproval" type="checkbox" role="switch" className={styles.switch} defaultChecked={initial?.requiresApproval} disabled={r.busy} /></label>
        <label className={styles.row}><Users size={20} aria-hidden="true" /><span className={styles.optionLabel}>{c.capacity}</span><input name="capacity" type="number" min={1} max={100000} className={`${styles.rowInput} ${styles.optionValue}`} placeholder={manageText(locale, "eventNoLimit")} defaultValue={initial?.capacity ?? ""} disabled={r.busy} /></label>
        <details className={styles.period}><summary><CalendarRange size={20} aria-hidden="true" /><span className={styles.optionLabel}>{manageText(locale, "eventApplyPeriod")}</span><span>{initial ? `${new Date(initial.opensAt).toLocaleDateString(locale)} – ${new Date(initial.closesAt).toLocaleDateString(locale)}` : manageText(locale, "eventApplyDefault")}</span></summary>
          <div className={styles.periodFields}>{(["opensAt", "closesAt"] as const).map(key => <label className={styles.row} key={key}><span className={styles.rowLabel}>{c[key === "opensAt" ? "opens" : "closes"]}</span><input name={key} type="datetime-local" className={styles.rowInput} defaultValue={local(initial?.[key])} disabled={r.busy} onClick={event => openPicker(event.currentTarget)} /></label>)}</div>
        </details>
        <div className={styles.mission}><GroupEventMissionField pageId={pageId} locale={locale} initialId={initial?.linkedMissionId} busy={r.busy} leading={<ListChecks size={20} aria-hidden="true" />} /></div>
      </div>
      {renewal && <p className={styles.note}>{manageText(locale, "eventReapproval")}</p>}
      {invalid && <p role="alert" className={styles.error}>{manageText(locale, "eventInvalidDates")}</p>}
      {r.failed && <p role="alert" className={styles.error}>{t.error}</p>}
      <div className={styles.actions}><FanAction className={styles.submit} variant="primary" type="submit" disabled={r.busy || !imageReady}>{initial ? m.save : state === "draft" ? c.draft : c.createEvent}</FanAction></div>
    </div>
  </form>;
}
