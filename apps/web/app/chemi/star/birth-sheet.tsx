"use client";

import { useState } from "react";
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
import ko from "@/features/chemi/i18n/locales/ko/chemi.json";
import { BirthDateField, BirthTimeField, ChoiceField } from "@/features/chemi/ui/frame/birth-fields";
import styles from "./scene.module.css";

export type BirthInput = {
  birthDate: string;
  calendar: BirthCalendar;
  birthTime: string | null;
  timePrecision: "exact" | "band" | "unknown";
  gender: BirthGender;
};

const copy = ko.myBirth;
const calendars = [
  { key: "solar" as const, label: copy.solar },
  { key: "lunar" as const, label: copy.lunar },
  { key: "lunar_leap" as const, label: copy.lunarLeap },
];
const genders = [
  { key: "female" as const, label: copy.female },
  { key: "male" as const, label: copy.male },
  { key: "none" as const, label: copy.noGender },
];

/**
 * 별자리 운세 첫 생일 시트(생년월일·달력 → 태어난 시간 → 성별). 입력 칸·시간 휠·시진 띠는
 * 내 생일 정보와 같은 공통 부품이고, 브라우저 기본 날짜·시간 입력은 쓰지 않는다.
 */
export function BirthSheet({
  open,
  busy,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: BirthInput) => void;
}) {
  const [step, setStep] = useState(0);
  const [date, setDate] = useState("");
  const [calendar, setCalendar] = useState<BirthCalendar>("solar");
  const [time, setTime] = useState<BirthTime>({ kind: "unknown" });
  const [gender, setGender] = useState<BirthGender>(null);
  const issue = date === "" ? null : birthDateIssue(date, koreaToday());
  const dateError = issue === "invalid" ? copy.invalidDate : issue === "under14" ? copy.under14 : null;
  const last = step === 2;
  const primary = {
    label: last ? "저장하고 보기" : "다음",
    disabled: step === 0 ? birthDateIssue(date, koreaToday()) !== null : false,
    loading: busy,
    onClick: () => {
      if (!last) return setStep(step + 1);
      onSave({ birthDate: birthTextToIso(date)!, calendar, ...timeToApi(time), gender });
    },
  };
  return (
    <FanSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="생일 정보"
      closeLabel="닫기"
      primary={primary}
      secondary={step > 0 ? { label: "이전", onClick: () => setStep(step - 1) } : undefined}
    >
      <div className={styles.field}>
        <div className={styles.steps} role="img" aria-label={`3단계 중 ${step + 1}단계`}>
          {[0, 1, 2].map((index) => (
            <i key={index} aria-current={index === step ? "step" : undefined} />
          ))}
        </div>
        {step === 0 && (
          <>
            <BirthDateField label={copy.fieldDate} value={date} onChange={setDate} error={dateError} copy={copy} />
            <ChoiceField<BirthCalendar> label={copy.calendarLabel} options={calendars} value={calendar} onChange={setCalendar} />
          </>
        )}
        {step === 1 && <BirthTimeField startOpen value={time} onChange={setTime} copy={copy} />}
        {step === 2 && (
          <>
            <ChoiceField
              label={copy.fieldGender}
              options={genders}
              value={gender ?? "none"}
              onChange={(key) => setGender(key === "none" ? null : key)}
            />
            <small>저장하면 생일 정보 수집·이용에 동의한 것으로 봐요.</small>
          </>
        )}
        {error && <small role="alert">{error}</small>}
      </div>
    </FanSheet>
  );
}
