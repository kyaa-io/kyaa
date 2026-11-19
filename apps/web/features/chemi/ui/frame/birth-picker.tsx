"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSheet } from "@/components/fan-ui/fan-dialog";
import { FanText } from "@/components/fan-ui/fan-text";
import { bandInfo, birthTextToIso, daysInMonth, type BirthTime } from "@/features/chemi/domain/birth-form";
import type { MyBirthCopy } from "./birth-copy";
import { WheelColumn, type WheelOption } from "./wheel-column";
import styles from "./birth-frame.module.css";

const range = (start: number, count: number): WheelOption[] => Array.from({ length: count }, (_, index) => ({ value: start + index, label: String(start + index) }));
const pad = (value: number) => String(value).padStart(2, "0");
const suffixed = (options: readonly WheelOption[], suffix: string) => options.map((option) => ({ ...option, label: `${option.label}${suffix}` }));

type PickerProps<T> = Readonly<{ initial: T; copy: MyBirthCopy; onPick: (value: T) => void; onClose: () => void }>;

/** 생년월일 휠(년·월·일). 입력 칸에 이미 있는 날짜에서 시작하고, 없으면 1995.01.01. 일 휠은 고른 달의 날 수를 따른다. */
function DatePicker({ initial, copy, onPick, onClose }: PickerProps<string>) {
  const start = (birthTextToIso(initial) ?? "1995-01-01").split("-").map(Number);
  const [year, setYear] = useState(start[0]);
  const [month, setMonth] = useState(start[1]);
  const [day, setDay] = useState(start[2]);
  const days = daysInMonth(year, month);
  const shownDay = Math.min(day, days);
  const years = useMemo(() => suffixed(range(1900, 127), copy.year), [copy.year]);
  const months = useMemo(() => suffixed(range(1, 12), copy.month), [copy.month]);
  const dayOptions = useMemo(() => suffixed(range(1, days), copy.day), [days, copy.day]);
  return <FanSheet open onOpenChange={(open) => { if (!open) onClose(); }} title={copy.fieldDate} closeLabel={copy.close}
    primary={{ label: copy.done, onClick: () => { onPick(`${year}.${pad(month)}.${pad(shownDay)}`); onClose(); } }}>
    <FanText as="div" role="body" className={styles.wheels}>
      <WheelColumn label={copy.year} options={years} value={year} onChange={setYear} autoFocus />
      <WheelColumn label={copy.month} options={months} value={month} onChange={setMonth} />
      <WheelColumn label={copy.day} options={dayOptions} value={shownDay} onChange={setDay} />
    </FanText>
  </FanSheet>;
}

/** 시간 휠(오전·오후 · 시 · 분)과 '모름' · '대략 알아요'(2시간 띠 12개). 대략을 누르면 같은 판이 띠 목록으로 바뀐다. */
function TimePicker({ initial, copy, onPick, onClose }: PickerProps<BirthTime>) {
  const exact = initial.kind === "exact" ? initial : { hour: 0, minute: 0 };
  const [period, setPeriod] = useState(exact.hour >= 12 ? 1 : 0);
  const [hour, setHour] = useState(exact.hour % 12 || 12);
  const [minute, setMinute] = useState(exact.minute);
  const [bands, setBands] = useState(false);
  const periods = useMemo(() => [{ value: 0, label: copy.am }, { value: 1, label: copy.pm }], [copy.am, copy.pm]);
  const hours = useMemo(() => suffixed(range(1, 12), copy.hour), [copy.hour]);
  const minutes = useMemo(() => suffixed(range(0, 60).map((option) => ({ ...option, label: pad(option.value) })), copy.minute), [copy.minute]);
  const pick = (time: BirthTime) => { onPick(time); onClose(); };
  return <FanSheet open onOpenChange={(open) => { if (!open) onClose(); }} title={copy.fieldTime} closeLabel={copy.close}
    primary={bands ? undefined : { label: copy.done, onClick: () => pick({ kind: "exact", hour: (hour % 12) + period * 12, minute }) }}>
    {bands ? <div className={styles.bands}>
      {Array.from({ length: 12 }, (_, band) => {
        const { name, range: span } = bandInfo(band);
        return <FanAction key={band} variant="neutral" className={styles.band} aria-pressed={initial.kind === "band" && initial.band === band} onClick={() => pick({ kind: "band", band })}>
          <FanText as="div" role="item">{name}</FanText><FanText as="div" role="meta">{span}</FanText>
        </FanAction>;
      })}
    </div> : <>
      <FanText as="div" role="body" className={styles.wheels}>
        <WheelColumn label={copy.ampm} options={periods} value={period} onChange={setPeriod} autoFocus />
        <WheelColumn label={copy.hour} options={hours} value={hour} onChange={setHour} />
        <WheelColumn label={copy.minute} options={minutes} value={minute} onChange={setMinute} />
      </FanText>
      <div className={styles.pickerExtra}>
        <FanAction variant="neutral" size="sm" onClick={() => pick({ kind: "unknown" })}>{copy.unknownCheck}</FanAction>
        <FanAction variant="neutral" size="sm" onClick={() => setBands(true)}>{copy.roughly}</FanAction>
      </div>
    </>}
  </FanSheet>;
}

/** 태어난 곳 검색. 목록은 이 판이 열릴 때 불러오고, 불러오지 못하면 한 줄과 '다시 검색'만 보인다. */
function PlacePicker({ copy, onPick, onClose }: Omit<PickerProps<string>, "initial">) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<{ status: "loading" } | { status: "failed" } | { status: "ready"; hits: readonly string[] }>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    import("@/features/chemi/domain/birth-places").then(
      ({ BIRTH_PLACES, searchBirthPlaces }) => { if (active) setState({ status: "ready", hits: searchBirthPlaces(BIRTH_PLACES, query) }); },
      () => { if (active) setState({ status: "failed" }); },
    );
    return () => { active = false; };
  }, [query, attempt]);
  useEffect(() => { input.current?.focus({ preventScroll: true }); }, []);
  return <FanSheet open onOpenChange={(open) => { if (!open) onClose(); }} title={copy.fieldPlace} closeLabel={copy.close}>
    <FanText as="div" role="item"><input ref={input} className={styles.input} type="text" value={query} placeholder={copy.placeSearch} aria-label={copy.placeSearch} onChange={(event) => setQuery(event.target.value)} /></FanText>
    {state.status === "failed" ? <div className={styles.placeFail} role="alert"><FanText as="p" role="meta">{copy.placeFail}</FanText><FanAction variant="neutral" size="sm" onClick={() => { setState({ status: "loading" }); setAttempt(attempt + 1); }}>{copy.placeAgain}</FanAction></div> : null}
    {state.status === "ready" && state.hits.length === 0 ? <FanText as="p" role="meta" className={styles.placeEmpty}>{copy.placeEmpty}</FanText> : null}
    {state.status === "ready" ? <ul className={styles.placeList}>{state.hits.map((place) => <li key={place} data-row=""><FanAction variant="text" className={styles.placeRow} onClick={() => { onPick(place); onClose(); }}><FanText role="body">{place}</FanText></FanAction></li>)}</ul> : null}
  </FanSheet>;
}

export type BirthPickerTarget =
  | { kind: "date"; value: string; onPick: (text: string) => void }
  | { kind: "time"; value: BirthTime; onPick: (time: BirthTime) => void }
  | { kind: "place"; onPick: (place: string) => void };

/** 생년월일·시간·태어난 곳을 고르는 판. 입력 판 위에 겹쳐 열리고(390 바닥 시트 · 1024+ 서랍), 고르면 닫힌다. */
export function BirthPicker({ target, copy, onClose }: Readonly<{ target: BirthPickerTarget | null; copy: MyBirthCopy; onClose: () => void }>) {
  if (!target) return null;
  if (target.kind === "date") return <DatePicker initial={target.value} copy={copy} onPick={target.onPick} onClose={onClose} />;
  if (target.kind === "time") return <TimePicker initial={target.value} copy={copy} onPick={target.onPick} onClose={onClose} />;
  return <PlacePicker copy={copy} onPick={target.onPick} onClose={onClose} />;
}
