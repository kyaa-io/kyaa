"use client";

/**
 * 생일 입력 시트(승인 시안 03-2 생일·03-5 궁합 상대). MY 생일 정보와 같은 입력 부품
 * (생년월일 칸·시간 칸·달력·성별 고르기)을 쓰고, 이 화면에서는 내 동의 또는 상대 별명만 더한다.
 */
import { useState } from "react";
import { FanText } from "@/components/fan-ui/fan-text";
import { FanSheet } from "@/components/fan-ui/fan-dialog";
import {
  birthDateIssue,
  birthTextToIso,
  koreaToday,
  timeToApi,
  type BirthCalendar,
  type BirthGender,
  type BirthTime,
} from "@/features/chemi/domain/birth-form";
import type { MyBirthCopy } from "@/features/chemi/ui/frame/birth-copy";
import { BirthDateField, BirthTextField, BirthTimeField, CheckLabel, ChoiceField } from "@/features/chemi/ui/frame/birth-fields";
import { genderKey, genderOptions, genderValue } from "@/features/chemi/ui/my-birth/birth-sheet";
import type { Birth } from "./reading";
import styles from "./sheet.module.css";

export type SheetResult = { nickname: string; birth: Birth };

export function BirthSheet({
  open,
  mode,
  copy,
  busy,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  /** me: 내 생일(저장 동의 필요) · partner: 궁합 상대(별명) */
  mode: "me" | "partner";
  copy: MyBirthCopy;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (result: SheetResult) => void;
}) {
  const [nickname, setNickname] = useState("");
  const [dateText, setDateText] = useState("");
  const [calendar, setCalendar] = useState<BirthCalendar>("solar");
  const [time, setTime] = useState<BirthTime>({ kind: "unknown" });
  const [gender, setGender] = useState<BirthGender>(null);
  const [agree, setAgree] = useState(false);
  const partner = mode === "partner";
  const issue = dateText === "" ? null : birthDateIssue(dateText, koreaToday());
  const dateError =
    issue === "invalid" ? copy.invalidDate : issue === "under14" ? (partner ? copy.partnerUnder14 : copy.under14) : null;
  const ready = birthDateIssue(dateText, koreaToday()) === null && (partner ? nickname.trim() !== "" : agree);
  return (
    <FanSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={partner ? copy.partnerNewTitle : copy.firstTitle}
      closeLabel={copy.close}
      primary={{
        label: partner ? "궁합 보기" : copy.save,
        disabled: !ready,
        loading: busy,
        onClick: () =>
          onSave({
            nickname: nickname.trim(),
            birth: { birthDate: birthTextToIso(dateText)!, calendar, ...timeToApi(time), gender },
          }),
      }}
    >
      <div className={styles.form}>
        {partner && <BirthTextField label={copy.nickname} value={nickname} onChange={setNickname} maxLength={10} />}
        <BirthDateField label={copy.fieldDate} value={dateText} onChange={setDateText} error={dateError} copy={copy} />
        <ChoiceField<BirthCalendar>
          label={copy.calendarLabel}
          options={[
            { key: "solar", label: copy.solar },
            { key: "lunar", label: copy.lunar },
            { key: "lunar_leap", label: copy.lunarLeap },
          ]}
          value={calendar}
          onChange={setCalendar}
        />
        <BirthTimeField startOpen value={time} onChange={setTime} copy={copy} />
        <ChoiceField
          label={copy.fieldGender}
          options={genderOptions(copy)}
          value={genderKey(gender)}
          onChange={(key) => setGender(genderValue(key))}
        />
        {!partner && <CheckLabel checked={agree} onChange={setAgree}>{copy.consentItem}</CheckLabel>}
        {error && (
          <FanText as="p" role="meta" aria-live="assertive">
            {error}
          </FanText>
        )}
      </div>
    </FanSheet>
  );
}
