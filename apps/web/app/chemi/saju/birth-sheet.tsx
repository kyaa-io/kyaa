"use client";

/**
 * 생일 입력 시트(승인 시안 03-2 생일·03-5 궁합 상대). 한 장에 날짜·달력·시간·성별·동의를 둔다.
 * 공통 부품 대기: 휠 고르기·시간대 고르기·동의문 보기는 MY 생일 공통 부품(features/chemi/ui/frame)이
 * 병합되면 이 파일의 입력칸을 그 부품으로 바꾼다. 그때까지는 숫자 입력·시간 입력으로 받는다.
 */
import { useId, useState } from "react";
import { FanSheet } from "@/components/fan-ui/fan-dialog";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { FanText } from "@/components/fan-ui/fan-text";
import type { Birth } from "./reading";
import styles from "./sheet.module.css";

const calendars = [
  ["solar", "양력"],
  ["lunar", "음력"],
  ["lunar_leap", "음력 윤달"],
] as const;
const genders = [
  ["female", "여"],
  ["male", "남"],
  [null, "선택 안 함"],
] as const;

/** 숫자만 받아 1995.05.05 꼴로 만든다. */
export function maskBirthDate(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join(".");
}

/** 1995.05.05 → 1995-05-05. 없는 날짜·미래·1900년 이전이면 null. */
export function parseBirthDate(masked: string, now = Date.now()) {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(masked);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00Z`);
  const valid =
    !Number.isNaN(+date) &&
    date.toISOString().startsWith(`${year}-${month}-${day}`) &&
    Number(year) >= 1900 &&
    +date <= now;
  return valid ? `${year}-${month}-${day}` : null;
}

export type SheetResult = { nickname: string; save: boolean; birth: Birth };

export function BirthSheet({
  open,
  mode,
  busy,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  /** me: 내 생일(저장 동의 필요) · partner: 궁합 상대(별명·저장 여부) */
  mode: "me" | "partner";
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (result: SheetResult) => void;
}) {
  const id = useId();
  const [nickname, setNickname] = useState("");
  const [date, setDate] = useState("");
  const [calendar, setCalendar] = useState<Birth["calendar"]>("solar");
  const [time, setTime] = useState("");
  const [unknown, setUnknown] = useState(false);
  const [gender, setGender] = useState<Birth["gender"]>(null);
  const [agree, setAgree] = useState(false);
  const [save, setSave] = useState(false);
  const birthDate = parseBirthDate(date);
  const timeOk = unknown || time !== "";
  const ready =
    Boolean(birthDate) && timeOk && (mode === "me" ? agree : nickname.trim().length > 0);
  const partner = mode === "partner";
  return (
    <FanSheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={partner ? "궁합 상대" : "생일 정보"}
      closeLabel="닫기"
      primary={{
        label: partner ? "궁합 보기" : "이 날이야",
        disabled: !ready,
        loading: busy,
        onClick: () =>
          onSave({
            nickname: nickname.trim(),
            save,
            birth: {
              birthDate: birthDate!,
              calendar,
              birthTime: unknown ? null : time,
              timePrecision: unknown ? "unknown" : "exact",
              gender,
            },
          }),
      }}
    >
      <div className={styles.form}>
        {partner && (
          <div className={styles.field}>
            <label htmlFor={`${id}-nick`}>
              <FanText role="label">별명</FanText>
            </label>
            <input
              id={`${id}-nick`}
              maxLength={20}
              autoComplete="off"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
            />
          </div>
        )}
        <div className={styles.field}>
          <label htmlFor={`${id}-date`}>
              <FanText role="label">생년월일</FanText>
            </label>
          <input
            id={`${id}-date`}
            autoComplete={partner ? "off" : "bday"}
            inputMode="numeric"
            maxLength={10}
            placeholder="YYYY.MM.DD"
            value={date}
            onChange={(event) => setDate(maskBirthDate(event.target.value))}
          />
          <FanTabs
            variant="segment"
            className={styles.rail}
            label="달력 종류"
            current={calendar}
            items={calendars.map(([key, label]) => ({
              key,
              label,
              onSelect: () => setCalendar(key),
            }))}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-time`}>
              <FanText role="label">태어난 시간</FanText>
            </label>
          <div className={styles.timeRow}>
            <input
              id={`${id}-time`}
              type="time"
              disabled={unknown}
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={unknown}
                onChange={(event) => setUnknown(event.target.checked)}
              />
              <FanText role="label">모름</FanText>
            </label>
          </div>
        </div>
        <FanTabs
          variant="segment"
          className={styles.rail}
          label="성별"
          current={gender ?? "none"}
          items={genders.map(([key, label]) => ({
            key: key ?? "none",
            label,
            onSelect: () => setGender(key),
          }))}
        />
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={partner ? save : agree}
            onChange={(event) => (partner ? setSave : setAgree)(event.target.checked)}
          />
          <FanText role="body">{partner ? "이 사람 저장" : "[필수] 생일 정보 저장 동의"}</FanText>
        </label>
        {error && (
          <FanText as="p" role="meta" aria-live="assertive">
            {error}
          </FanText>
        )}
      </div>
    </FanSheet>
  );
}
