"use client";
import { useId, useState, type ReactNode } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanText } from "@/components/fan-ui/fan-text";
import { ChevronRight } from "@/components/fan-ui/fan-icons";
import { FanTabs } from "@/components/fan-ui/fan-tabs";
import { bandInfo, exactTimeLabel, formatBirthDigits, type BirthTime } from "@/features/chemi/domain/birth-form";
import type { MyBirthCopy } from "./birth-copy";
import { BirthPicker, type BirthPickerTarget } from "./birth-picker";
import styles from "./birth-frame.module.css";

/** 시간 값을 칸에 보이는 글로. 모름은 비워 '선택'으로 보인다. */
export function timeLabel(time: BirthTime, copy: MyBirthCopy) {
  if (time.kind === "exact") return exactTimeLabel(time.hour, time.minute, copy.am, copy.pm);
  if (time.kind === "band") { const { name, range } = bandInfo(time.band); return `${name} ${range}`; }
  return null;
}

/** 생년월일: 숫자 8자리를 치면 점이 붙고, '휠로 고르기'로 같은 값을 휠에서 고른다. 오류는 입력 아래 한 줄. */
export function BirthDateField({ label, value, onChange, error, copy, autoFocus }: Readonly<{
  label: string;
  value: string;
  onChange: (text: string) => void;
  error?: string | null;
  copy: MyBirthCopy;
  autoFocus?: boolean;
}>) {
  const id = useId();
  const [picker, setPicker] = useState<BirthPickerTarget | null>(null);
  return <div className={styles.field}>
    <div className={styles.label}>
      <FanText role="label"><label htmlFor={id}>{label}</label></FanText>
      <FanAction variant="text" size="sm" onClick={() => setPicker({ kind: "date", value, onPick: onChange })}>{copy.wheelButton}</FanAction>
    </div>
    <FanText as="div" role="item">
    <input
      id={id}
      className={styles.input}
      type="text"
      inputMode="numeric"
      autoComplete="bday"
      maxLength={10}
      placeholder="YYYY.MM.DD"
      value={value}
      autoFocus={autoFocus}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      onChange={(event) => onChange(formatBirthDigits(event.target.value))}
    />
    </FanText>
    {error ? <FanText as="p" role="meta" className={styles.error} id={`${id}-error`}>{error}</FanText> : null}
    <BirthPicker target={picker} copy={copy} onClose={() => setPicker(null)} />
  </div>;
}

/** 라벨 붙은 체크 칸(44). 모름·동의 체크가 같이 쓴다. */
export function CheckLabel({ checked, onChange, children }: Readonly<{ checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }>) {
  return <label className={styles.check}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><FanText role="body">{children}</FanText></label>;
}

/** 태어난 시간: 값을 고르는 칸 + '모름' 체크. 모름이면 칸이 비워지고 눌리지 않는다. 체크를 풀면 칸이 열려 '선택'으로 보인다. */
export function BirthTimeField({ value, onChange, copy }: Readonly<{ value: BirthTime; onChange: (time: BirthTime) => void; copy: MyBirthCopy }>) {
  const [picker, setPicker] = useState<BirthPickerTarget | null>(null);
  const [opened, setOpened] = useState(false);
  const unknown = value.kind === "unknown" && !opened;
  const shown = timeLabel(value, copy);
  return <div className={styles.field}>
    <div className={styles.label}><FanText role="label">{copy.fieldTime}</FanText></div>
    <div className={styles.inline}>
      <FanAction variant="neutral" className={shown ? styles.select : `${styles.select} ${styles.placeholder}`} disabled={unknown} onClick={() => setPicker({ kind: "time", value, onPick: onChange })}>
        <span>{shown ?? copy.select}</span><FanIcon icon={ChevronRight} />
      </FanAction>
      <CheckLabel checked={unknown} onChange={(checked) => { setOpened(!checked); if (checked) onChange({ kind: "unknown" }); }}>{copy.unknownCheck}</CheckLabel>
    </div>
    <BirthPicker target={picker} copy={copy} onClose={() => setPicker(null)} />
  </div>;
}

/** 태어난 곳: 검색 판에서 고른다. */
export function BirthPlaceField({ value, onChange, copy }: Readonly<{ value: string | null; onChange: (place: string) => void; copy: MyBirthCopy }>) {
  const [picker, setPicker] = useState<BirthPickerTarget | null>(null);
  return <div className={styles.field}>
    <div className={styles.label}><FanText role="label">{copy.fieldPlace}</FanText></div>
    <FanAction variant="neutral" className={value ? styles.select : `${styles.select} ${styles.placeholder}`} onClick={() => setPicker({ kind: "place", onPick: onChange })}>
      <span>{value ?? copy.select}</span><FanIcon icon={ChevronRight} />
    </FanAction>
    <BirthPicker target={picker} copy={copy} onClose={() => setPicker(null)} />
  </div>;
}

/** 별명 같은 한 줄 글자 입력. 라벨 14/700 + 입력 48 알약. */
export function BirthTextField({ label, value, onChange, maxLength }: Readonly<{ label: string; value: string; onChange: (text: string) => void; maxLength: number }>) {
  const id = useId();
  return <div className={styles.field}>
    <div className={styles.label}><FanText role="label"><label htmlFor={id}>{label}</label></FanText></div>
    <FanText as="div" role="item"><input id={id} className={styles.input} type="text" maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} /></FanText>
  </div>;
}

/** 달력 종류·성별처럼 2~3칸 중 하나를 고르는 틀(FanTabs segment). */
export function ChoiceField<T extends string>({ label, options, value, onChange }: Readonly<{
  label: string;
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}>) {
  return <FanTabs variant="segment" label={label} current={value} items={options.map((option) => ({ key: option.key, label: option.label, onSelect: () => onChange(option.key) }))} />;
}
