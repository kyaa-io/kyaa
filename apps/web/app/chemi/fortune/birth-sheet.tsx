"use client";

import { useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSheet } from "@/components/fan-ui/fan-dialog";
import styles from "./scene.module.css";

export type BirthInput = {
  birthDate: string;
  calendar: "solar" | "lunar" | "lunar_leap";
  birthTime: string | null;
  timePrecision: "exact" | "unknown";
  gender: "female" | "male" | null;
};

const calendars = [
  ["solar", "양력"],
  ["lunar", "음력"],
  ["lunar_leap", "음력 윤달"],
] as const;

/** 숫자만 받아 1995.05.05 꼴로 만든다. */
export function maskBirthDate(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)]
    .filter(Boolean)
    .join(".");
}

/** 1995.05.05 → 1995-05-05. 없는 날짜·미래·1900년 이전이면 null. */
export function parseBirthDate(masked: string) {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(masked);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  const valid =
    !Number.isNaN(+date) &&
    date.toISOString().startsWith(`${year}-${month}-${day}`) &&
    Number(year) >= 1900 &&
    +date <= Date.now();
  return valid ? `${year}-${month}-${day}` : null;
}

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
  const [calendar, setCalendar] = useState<BirthInput["calendar"]>("solar");
  const [time, setTime] = useState<string | null>(null);
  const [gender, setGender] = useState<BirthInput["gender"]>(null);
  const birthDate = parseBirthDate(date);
  const last = step === 2;
  const primary = {
    label: last ? "저장하고 보기" : "다음",
    disabled: step === 0 ? !birthDate : false,
    loading: busy,
    onClick: () => {
      if (!last) return setStep(step + 1);
      onSave({
        birthDate: birthDate!,
        calendar,
        birthTime: time,
        timePrecision: time ? "exact" : "unknown",
        gender,
      });
    },
  };
  return (
    <FanSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="생일 정보"
      closeLabel="닫기"
      primary={primary}
      secondary={
        step > 0 ? { label: "이전", onClick: () => setStep(step - 1) } : undefined
      }
    >
      <div className={styles.field}>
        <div
          className={styles.steps}
          role="img"
          aria-label={`3단계 중 ${step + 1}단계`}
        >
          {[0, 1, 2].map((index) => (
            <i key={index} aria-current={index === step ? "step" : undefined} />
          ))}
        </div>
        {step === 0 && (
          <>
            <label htmlFor="chemi-birth">생년월일</label>
            <input
              id="chemi-birth"
              autoComplete="bday"
              inputMode="numeric"
              maxLength={10}
              placeholder="YYYY.MM.DD"
              value={date}
              onChange={(event) => setDate(maskBirthDate(event.target.value))}
            />
            <div className={styles.segment} role="group" aria-label="달력 종류">
              {calendars.map(([key, label]) => (
                <FanAction
                  key={key}
                  variant="neutral"
                  size="sm"
                  aria-pressed={calendar === key}
                  onClick={() => setCalendar(key)}
                >
                  {label}
                </FanAction>
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <label htmlFor="chemi-time">태어난 시간</label>
            <input
              id="chemi-time"
              type="time"
              value={time ?? ""}
              onChange={(event) => setTime(event.target.value || null)}
            />
            <FanAction
              variant="neutral"
              size="sm"
              aria-pressed={time === null}
              onClick={() => setTime(null)}
            >
              시간 몰라요
            </FanAction>
          </>
        )}
        {step === 2 && (
          <>
            <span id="chemi-gender">성별</span>
            <div
              className={styles.segment}
              role="group"
              aria-labelledby="chemi-gender"
            >
              {(
                [
                  ["female", "여성"],
                  ["male", "남성"],
                  [null, "선택 안 함"],
                ] as const
              ).map(([key, label]) => (
                <FanAction
                  key={label}
                  variant="neutral"
                  size="sm"
                  aria-pressed={gender === key}
                  onClick={() => setGender(key)}
                >
                  {label}
                </FanAction>
              ))}
            </div>
            <small>저장하면 생일 정보 수집·이용에 동의한 것으로 봐요.</small>
          </>
        )}
        {error && <small role="alert">{error}</small>}
      </div>
    </FanSheet>
  );
}
