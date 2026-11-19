import type { StarCharacterId, StarDomain, StarReason, ZodiacSign } from "./copy";
import { zodiacSigns } from "./copy";

export type StarPlanet = { body: string; longitude: number; sign: ZodiacSign };

export type StarResult = {
  natal: StarPlanet[];
  timeKnown: boolean;
  /** 태어난 날 안에서 해·달이 별자리 경계를 넘으면 둘이다. */
  signs: { sun: ZodiacSign[]; moon: ZodiacSign[] };
  stars: Record<StarDomain | "overall", number>;
  reasons: StarReason[];
  distributionVersion: string;
};

export type StarReading = {
  readingId: string;
  result: StarResult;
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

const isSign = (value: unknown): value is ZodiacSign =>
  typeof value === "string" && (zodiacSigns as readonly string[]).includes(value);
const isStar = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;

/** 화면이 곧바로 읽는 필드의 모양을 확인한다. 하나라도 어긋나면 이 풀이는 그리지 않는다. */
function isStarResult(result: Record<string, any> | null | undefined): result is StarResult {
  if (!result) return false;
  const { natal, signs, stars, reasons } = result;
  return (
    Array.isArray(natal) &&
    natal.length === 10 &&
    natal.every(
      (planet) =>
        typeof planet?.body === "string" &&
        typeof planet.longitude === "number" &&
        Number.isFinite(planet.longitude) &&
        isSign(planet.sign),
    ) &&
    Array.isArray(signs?.sun) &&
    signs.sun.length > 0 &&
    signs.sun.every(isSign) &&
    Array.isArray(signs?.moon) &&
    signs.moon.length > 0 &&
    signs.moon.every(isSign) &&
    ["overall", "love", "people", "money", "work"].every((key) => isStar(stars?.[key])) &&
    Array.isArray(reasons) &&
    reasons.every(
      (reason) =>
        typeof reason?.body === "string" &&
        typeof reason.target === "string" &&
        typeof reason.angle === "number" &&
        typeof reason.hour === "number" &&
        typeof reason.score === "number" &&
        typeof reason.exitDate === "string",
    )
  );
}

function parseNewStar(data: unknown): StarReading | null {
  const value = data as { readingId?: unknown; kstDate?: unknown; result?: any } | null;
  if (
    typeof value?.readingId !== "string" ||
    typeof value.kstDate !== "string" ||
    !isStarResult(value.result)
  )
    return null;
  return value as unknown as StarReading;
}

/** 저장된 풀이 응답이 '오늘의 별자리 운세'인지 확인한다. 다른 콘텐츠·다른 날·모양이 다른 결과는 null. */
export function parseTodayStar(data: unknown): StarReading | null {
  const value = data as { content?: unknown; kind?: unknown; kstDate?: unknown } | null;
  if (value?.content !== "star" || value.kind !== "daily" || value.kstDate !== todayKst())
    return null;
  return parseNewStar(data);
}

const json = (token: string | null) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

/** 오늘 결과를 만들거나(첫 호출) 이미 만든 결과를 돌려받는다(같은 날 같은 최애는 replayed). */
export async function requestStar(
  token: string | null,
  character: StarCharacterId,
  signal?: AbortSignal,
): Promise<StarReading> {
  const response = await fetch("/api/chemi/readings", {
    method: "POST",
    headers: json(token),
    signal,
    body: JSON.stringify({ content: "star", kind: "daily", character }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ChemiRequestError(data?.error?.code ?? null, response.status);
  const reading = parseNewStar(data);
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

/** 해·달 별자리를 화면 글자로. 경계를 넘는 날이면 "게 또는 사자"처럼 둘을 잇는다. */
export function signList(signs: ZodiacSign[], pick: (sign: ZodiacSign) => string) {
  return signs.map(pick).join(" 또는 ");
}
