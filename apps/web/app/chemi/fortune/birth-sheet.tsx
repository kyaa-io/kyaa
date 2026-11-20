"use client";

import { useReadingBirthCopy, useReadingCopy } from "@/features/chemi/i18n/reading-ui";
import { useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSheet } from "@/components/fan-ui/fan-dialog";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import styles from "./scene.module.css";

export type BirthInput = {
  birthDate: string;
  calendar: "solar" | "lunar" | "lunar_leap";
  birthTime: string | null;
  timePrecision: "exact" | "unknown";
  gender: "female" | "male" | null;
};



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
  const text = useReadingCopy();
  const copy = useReadingBirthCopy();
  const calendars = [
    ["solar", copy.solar],
    ["lunar", copy.lunar],
    ["lunar_leap", copy.lunarLeap],
  ] as const;

  const genders = [
    ["female", copy.female],
    ["male", copy.male],
    [null, copy.noGender],
  ] as const;
  const [step, setStep] = useState(0);
  const [date, setDate] = useState("");
  const [calendar, setCalendar] = useState<BirthInput["calendar"]>("solar");
  const [time, setTime] = useState<string | null>(null);
  const [gender, setGender] = useState<BirthInput["gender"]>(null);
  const birthDate = parseBirthDate(date);
  const last = step === 2;
  const primary = {
    label: last ? text("saveRead") : text("next"),
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
      title={copy.firstTitle}
      closeLabel={copy.close}
      primary={primary}
      secondary={
        step > 0 ? { label: text("previous"), onClick: () => setStep(step - 1) } : undefined
      }
    >
      <div className={styles.field}>
        <div
          className={styles.steps}
          role="img"
          aria-label={text("stepOf").replace("{step}", String(step + 1))}
        >
          {[0, 1, 2].map((index) => (
            <i key={index} aria-current={index === step ? "step" : undefined} />
          ))}
        </div>
        {step === 0 && (
          <>
            <label htmlFor="chemi-birth">{copy.fieldDate}</label>
            <input
              id="chemi-birth"
              autoComplete="bday"
              inputMode="numeric"
              maxLength={10}
              placeholder="YYYY.MM.DD"
              value={date}
              onChange={(event) => setDate(maskBirthDate(event.target.value))}
            />
            <FanTabs
              variant="segment"
              className={styles.rail}
              label={copy.calendarLabel}
              current={calendar}
              items={calendars.map(([key, label]) => ({
                key,
                label,
                onSelect: () => setCalendar(key),
              }))}
            />
          </>
        )}
        {step === 1 && (
          <>
            <label htmlFor="chemi-time">{copy.fieldTime}</label>
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
              {copy.timeUnknown}
            </FanAction>
          </>
        )}
        {step === 2 && (
          <>
            <span id="chemi-gender">{copy.fieldGender}</span>
            <FanTabs
              variant="segment"
              className={styles.rail}
              label={copy.fieldGender}
              current={gender ?? "none"}
              items={genders.map(([key, label]) => ({
                key: key ?? "none",
                label,
                onSelect: () => setGender(key),
              }))}
            />
            <small>{text("birthConsent")}</small>
          </>
        )}
        {error && <small role="alert">{error}</small>}
      </div>
    </FanSheet>
  );
}
