import type { computeDailyFortune } from "@/server/chemi-engine/fortune";
import type { FortuneCharacterId } from "./lines";
import { spiritNotes, stageNotes } from "./result-copy";

export type FortuneReading = {
  readingId: string;
  result: ReturnType<typeof computeDailyFortune>;
  styled?: { headline?: string; share?: { line?: string } } | null;
  reward?: { points?: number; stamp?: boolean; exp?: number };
  replayed?: boolean;
  /** 저장된 풀이의 한국 날짜(YYYY-MM-DD). */
  kstDate: string;
};

/** `status`: 서버가 돌려준 HTTP 상태. 네트워크가 끊겨 응답이 없으면 null. */
export class ChemiRequestError extends Error {
  constructor(
    readonly code: string | null,
    readonly status: number | null = null,
  ) {
    super(code ?? "CHEMI_REQUEST");
  }
}

/**
 * 로그인이 만료됐을 때. 같은 요청을 반복해도 풀리지 않는다.
 * 403이라도 케미가 직접 돌려준 거절(`CHEMI_*`, 예: 이용 종료 계정)은 로그인 문제가 아니다.
 */
export function isAuthFailure(error: unknown) {
  if (!(error instanceof ChemiRequestError)) return false;
  if (error.status === 401) return true;
  return error.status === 403 && !error.code?.startsWith("CHEMI_");
}

/** 오늘의 한국 날짜 YYYY-MM-DD. */
export function todayKst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(Date.now());
}

const isNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const isText = (value: unknown) => typeof value === "string";
const isHour = (value: unknown) =>
  value == null ||
  (typeof value === "object" && isNumber((value as any).start) && isNumber((value as any).end));

/**
 * 화면이 읽는 필드(결과·행운·근거 상세까지)의 모양을 확인한다.
 * 하나라도 어긋나면 이 풀이는 그리지 않는다 — 문자열 자리에 객체가 오면 그리다 멈춘다.
 */
function isFortuneResult(result: Record<string, any> | null | undefined) {
  if (!result || result.locked !== false) return false;
  const { fields, periods, luck, evidence } = result;
  return (
    isNumber(result.score) &&
    isText(result.grade?.name) &&
    ["fandom", "people", "work", "rest", "love", "money"].every((key) => isNumber(fields?.[key])) &&
    ["morning", "afternoon", "night"].every((key) => isNumber(periods?.[key])) &&
    typeof luck === "object" &&
    luck !== null &&
    ["color", "direction", "item"].every((key) => isText(luck[key])) &&
    isNumber(luck.number) &&
    isHour(luck.luckyHour) &&
    isHour(luck.restHour) &&
    ["dayPillar", "yearPillar", "relation", "tenGod", "useful", "timeBasis"].every((key) =>
      isText(evidence?.[key]),
    ) &&
    Object.hasOwn(stageNotes, evidence.stage) &&
    Object.hasOwn(spiritNotes, evidence.spirit)
  );
}

const optional = (value: unknown, ok: (value: unknown) => boolean) => value == null || ok(value);
const isObject = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null;

/** 화면이 그대로 그리는 한마디·보상 필드의 모양. 없는 건 괜찮고, 있는데 다른 모양이면 거절한다. */
function isFortuneExtras(value: Record<string, any>) {
  const { styled, reward } = value;
  return (
    optional(styled, (item) => {
      const { headline, share } = item as Record<string, any>;
      return (
        isObject(item) &&
        optional(headline, isText) &&
        optional(share, (card) => isObject(card) && optional(card.line, isText))
      );
    }) &&
    optional(
      reward,
      (item) =>
        isObject(item) &&
        optional(item.points, isNumber) &&
        optional(item.exp, isNumber) &&
        optional(item.stamp, (flag) => typeof flag === "boolean"),
    )
  );
}

/** 방금 만든 풀이 응답. 저장된 한국 날짜가 있어야 화면이 그 날짜로 표시한다. */
export function parseNewFortune(data: unknown): FortuneReading | null {
  const value = data as { readingId?: unknown; kstDate?: unknown; result?: any } | null;
  if (
    typeof value?.readingId !== "string" ||
    typeof value.kstDate !== "string" ||
    !isFortuneResult(value.result) ||
    !isFortuneExtras(value)
  )
    return null;
  return value as unknown as FortuneReading;
}

/**
 * 저장된 풀이 응답이 '오늘의 운세'인지 확인한다. 다른 콘텐츠·다른 날·모양이 다른 결과는 null.
 * 날짜는 서버가 저장한 한국 날짜와 오늘을 비교한다.
 */
export function parseTodayFortune(data: unknown): FortuneReading | null {
  const value = data as { content?: unknown; kind?: unknown; kstDate?: unknown } | null;
  if (value?.content !== "fortune" || value.kind !== "daily" || value.kstDate !== todayKst())
    return null;
  return parseNewFortune(data);
}

const json = (token: string | null) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

/** 오늘 결과를 만들거나(첫 호출) 이미 만든 결과를 돌려받는다(같은 날 같은 최애는 replayed). */
export async function requestFortune(
  token: string | null,
  character: FortuneCharacterId,
  signal?: AbortSignal,
): Promise<FortuneReading> {
  const response = await fetch("/api/chemi/readings", {
    method: "POST",
    headers: json(token),
    signal,
    body: JSON.stringify({ content: "fortune", kind: "daily", character }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ChemiRequestError(data?.error?.code ?? null, response.status);
  const reading = parseNewFortune(data);
  if (!reading) throw new ChemiRequestError("CHEMI_BAD_RESPONSE", response.status);
  return reading;
}

export async function saveBirth(
  token: string | null,
  birth: {
    birthDate: string;
    calendar: string;
    birthTime: string | null;
    timePrecision: string;
    gender: string | null;
  },
) {
  const response = await fetch("/api/chemi/profile/birth", {
    method: "PUT",
    headers: json(token),
    body: JSON.stringify({ ...birth, birthPlace: null, consent: true }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ChemiRequestError(data?.error?.code ?? null, response.status);
  }
}

export type Participation = { period: "today" | "week" | "all"; count: number } | null;

export async function loadParticipation(signal?: AbortSignal): Promise<Participation> {
  const response = await fetch("/api/chemi/home", { signal });
  if (!response.ok) return null;
  return (await response.json()).participation ?? null;
}
