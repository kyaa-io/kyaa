import type { computeDailyFortune } from "@/server/chemi-engine/fortune";
import type { FortuneCharacterId } from "./lines";

export type FortuneReading = {
  readingId: string;
  result: ReturnType<typeof computeDailyFortune>;
  styled?: { headline?: string; share?: { line?: string } } | null;
  reward?: { points?: number; stamp?: boolean; exp?: number };
  replayed?: boolean;
  /** 저장된 풀이의 한국 날짜(YYYY-MM-DD). */
  kstDate?: string;
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

/** 로그인이 만료됐거나 권한이 없을 때. 같은 요청을 반복해도 풀리지 않는다. */
export function isAuthFailure(error: unknown) {
  return (
    error instanceof ChemiRequestError &&
    (error.status === 401 || error.status === 403)
  );
}

/** 오늘의 한국 날짜 YYYY-MM-DD. */
export function todayKst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(Date.now());
}

/**
 * 저장된 풀이 응답이 '오늘의 운세'인지 확인한다. 다른 콘텐츠·다른 날·모양이 다른 결과는 null.
 * 날짜는 서버가 저장한 한국 날짜와 오늘을 비교한다.
 */
export function parseTodayFortune(data: unknown): FortuneReading | null {
  const value = data as {
    readingId?: unknown;
    content?: unknown;
    kind?: unknown;
    kstDate?: unknown;
    result?: Record<string, any> | null;
  } | null;
  const result = value?.result;
  if (
    typeof value?.readingId !== "string" ||
    value.content !== "fortune" ||
    value.kind !== "daily" ||
    value.kstDate !== todayKst() ||
    !result ||
    result.locked !== false ||
    typeof result.score !== "number" ||
    typeof result.grade?.name !== "string" ||
    typeof result.fields?.fandom !== "number" ||
    typeof result.periods?.morning !== "number" ||
    typeof result.luck !== "object" ||
    typeof result.evidence?.dayPillar !== "string"
  )
    return null;
  return value as unknown as FortuneReading;
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
  if (!response.ok || !data?.result)
    throw new ChemiRequestError(data?.error?.code ?? null, response.status);
  return data;
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
