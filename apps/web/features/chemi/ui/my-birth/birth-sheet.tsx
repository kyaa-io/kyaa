"use client";
import { useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSheet } from "@/components/fan-ui/fan-dialog";
import {
  birthDateIssue, emptyDraft, koreaToday, sameDraft, type BirthCalendar, type BirthDraft, type BirthGender,
} from "@/features/chemi/domain/birth-form";
import type { MyBirthCopy } from "../frame/birth-copy";
import { BirthDateField, BirthPlaceField, BirthTimeField, CheckLabel, ChoiceField } from "../frame/birth-fields";
import styles from "./my-birth.module.css";

export type BirthSheetMode = "edit" | "first" | "fill";

const calendarOptions = (copy: MyBirthCopy) => [
  { key: "solar" as const, label: copy.solar }, { key: "lunar" as const, label: copy.lunar }, { key: "lunar_leap" as const, label: copy.lunarLeap },
];
export const genderOptions = (copy: MyBirthCopy) => [
  { key: "female" as const, label: copy.female }, { key: "male" as const, label: copy.male }, { key: "none" as const, label: copy.noGender },
];
export const genderKey = (gender: BirthGender) => gender ?? "none";
export const genderValue = (key: "female" | "male" | "none"): BirthGender => (key === "none" ? null : key);

/**
 * 내 생일 정보 입력 판(시트 11-2). 고치기 · 처음 입력(동의를 판 안에서 받음) · 30일 안 시간·태어난 곳 채우기가 같은 판이다.
 * 만 14세 미만은 저장하지 않고 입력 아래 한 줄만 보인다. 고치기는 처음 값에서 달라졌을 때만 저장이 켜진다.
 */
export function BirthSheet({ mode, initial, copy, onSave, onClose, onOpenConsent }: Readonly<{
  mode: BirthSheetMode;
  initial: BirthDraft | null;
  copy: MyBirthCopy;
  onSave: (draft: BirthDraft) => Promise<boolean>;
  onClose: () => void;
  onOpenConsent: () => void;
}>) {
  const [draft, setDraft] = useState<BirthDraft>(initial ?? emptyDraft);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = koreaToday();
  const issue = mode === "fill" || draft.dateText === "" ? null : birthDateIssue(draft.dateText, today);
  const error = issue === "invalid" ? copy.invalidDate : issue === "under14" ? copy.under14 : null;
  const complete = mode === "fill" || birthDateIssue(draft.dateText, today) === null;
  const changed = mode === "first" ? agreed : initial !== null && !sameDraft(draft, initial);
  const patch = (next: Partial<BirthDraft>) => setDraft((current) => ({ ...current, ...next }));
  const title = mode === "first" ? copy.firstTitle : mode === "fill" ? copy.fillTitle : copy.editTitle;
  const save = async () => {
    setBusy(true);
    const done = await onSave(draft);
    setBusy(false);
    if (done) onClose();
  };
  return <FanSheet
    open
    onOpenChange={(open) => { if (!open) onClose(); }}
    title={title}
    closeLabel={copy.close}
    primary={{ label: copy.save, onClick: save, loading: busy, disabled: !complete || !changed }}
  >
    <div className={styles.form}>
      {mode === "fill" ? null : <>
        <BirthDateField label={copy.fieldDate} value={draft.dateText} onChange={(dateText) => patch({ dateText })} error={error} copy={copy} />
        <ChoiceField<BirthCalendar> label={copy.calendarLabel} options={calendarOptions(copy)} value={draft.calendar} onChange={(calendar) => patch({ calendar })} />
      </>}
      <BirthTimeField value={draft.time} onChange={(time) => patch({ time })} copy={copy} />
      {mode === "fill" ? null : <ChoiceField label={copy.fieldGender} options={genderOptions(copy)} value={genderKey(draft.gender)} onChange={(key) => patch({ gender: genderValue(key) })} />}
      <BirthPlaceField value={draft.place} onChange={(place) => patch({ place })} copy={copy} />
      {mode === "first" ? <div className={styles.agree}>
        <CheckLabel checked={agreed} onChange={setAgreed}>{copy.consentItem}</CheckLabel>
        <FanAction variant="text" size="sm" onClick={onOpenConsent}>{copy.consentView}</FanAction>
      </div> : null}
    </div>
  </FanSheet>;
}
