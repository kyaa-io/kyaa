"use client";
import { useState } from "react";
import { FanSheet } from "@/components/fan-ui/fan-dialog";
import { birthDateIssue, koreaToday, type BirthCalendar, type BirthGender, type BirthTime } from "@/features/chemi/domain/birth-form";
import type { ChemiProfile } from "@/features/chemi/domain/contracts/profile";
import type { MyBirthCopy } from "../frame/birth-copy";
import { BirthDateField, BirthTextField, BirthTimeField, ChoiceField } from "../frame/birth-fields";
import { genderKey, genderOptions, genderValue } from "./birth-sheet";
import styles from "./my-birth.module.css";

export type Partner = ChemiProfile["partners"][number];
export type PartnerDraft = { nickname: string; dateText: string; calendar: BirthCalendar; time: BirthTime; gender: BirthGender };

const same = (a: PartnerDraft, b: PartnerDraft) => JSON.stringify(a) === JSON.stringify(b);

/**
 * 궁합 상대 넣기·고치기 판. 만 14세 미만 생일은 입력 칸을 비우고 오류 한 줄만 남긴다(넣던 값은 버린다).
 * 고치기에는 바닥 왼쪽에 '지우기'가 있다.
 */
export function PartnerSheet({ initial, copy, onSave, onDelete, onClose }: Readonly<{
  initial: PartnerDraft | null;
  copy: MyBirthCopy;
  onSave: (draft: PartnerDraft) => Promise<boolean>;
  onDelete: () => void;
  onClose: () => void;
}>) {
  const blank: PartnerDraft = { nickname: "", dateText: "", calendar: "solar", time: { kind: "unknown" }, gender: null };
  const [draft, setDraft] = useState<PartnerDraft>(initial ?? blank);
  const [underFourteen, setUnderFourteen] = useState(false);
  const [busy, setBusy] = useState(false);
  const today = koreaToday();
  const issue = draft.dateText === "" ? null : birthDateIssue(draft.dateText, today);
  const error = underFourteen ? copy.partnerUnder14 : issue === "invalid" ? copy.invalidDate : null;
  const valid = draft.nickname.trim() !== "" && birthDateIssue(draft.dateText, today) === null;
  const changed = initial === null || !same(draft, initial);
  const setDate = (dateText: string) => {
    if (birthDateIssue(dateText, today) === "under14") { setUnderFourteen(true); setDraft((current) => ({ ...current, dateText: "" })); return; }
    setUnderFourteen(false);
    setDraft((current) => ({ ...current, dateText }));
  };
  const patch = (next: Partial<PartnerDraft>) => setDraft((current) => ({ ...current, ...next }));
  const save = async () => {
    setBusy(true);
    const done = await onSave(draft);
    setBusy(false);
    if (done) onClose();
  };
  return <FanSheet
    open
    onOpenChange={(open) => { if (!open) onClose(); }}
    title={initial ? copy.partnerEditTitle : copy.partnerNewTitle}
    closeLabel={copy.close}
    secondary={initial ? { label: copy.partnerDelete, onClick: onDelete, disabled: busy } : undefined}
    primary={{ label: copy.save, onClick: save, loading: busy, disabled: !valid || !changed }}
  >
    <div className={styles.form}>
      <BirthTextField label={copy.nickname} value={draft.nickname} onChange={(nickname) => patch({ nickname })} maxLength={10} />
      <BirthDateField label={copy.fieldDate} value={draft.dateText} onChange={setDate} error={error} copy={copy} />
      <ChoiceField<BirthCalendar>
        label={copy.calendarLabel}
        options={[{ key: "solar", label: copy.solar }, { key: "lunar", label: copy.lunar }, { key: "lunar_leap", label: copy.lunarLeap }]}
        value={draft.calendar}
        onChange={(calendar) => patch({ calendar })}
      />
      <BirthTimeField value={draft.time} onChange={(time) => patch({ time })} copy={copy} />
      <ChoiceField label={copy.fieldGender} options={genderOptions(copy)} value={genderKey(draft.gender)} onChange={(key) => patch({ gender: genderValue(key) })} />
    </div>
  </FanSheet>;
}
