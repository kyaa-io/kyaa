import { isChart, type Chart, type Stem } from "./chart";
import type { SajuCharacterId } from "./lines";

/** 서버가 돌려주는 사주 풀이(첫 풀이·궁합) 한 건. */
export type SajuReading<Result = Chart> = {
  readingId: string;
  result: Result;
  styled?: unknown;
  reward?: { points?: number; stamp?: boolean; exp?: number };
  replayed?: boolean;
  /** 저장된 풀이의 한국 날짜(YYYY-MM-DD). 상세 응답에 날짜가 들어오기 전에는 없다. */
  kstDate?: string;
};

export type PairResult = {
  charts?: { self: Chart["pillars"]; partner: Chart["pillars"] };
  relations?: { selfKey: keyof Chart["pillars"]; partnerKey: keyof Chart["pillars"]; kind: "합" | "충" }[];
  dayStems: [Stem, Stem];
  combinations: unknown[];
  clashes: unknown[];
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
 * 403이라도 케미가 직접 돌려준 거절(`CHEMI_*`)은 로그인 문제가 아니다.
 */
export function isAuthFailure(error: unknown) {
  if (!(error instanceof ChemiRequestError)) return false;
  if (error.status === 401) return true;
  return error.status === 403 && !error.code?.startsWith("CHEMI_");
}

/** 15초 안에 끝나야 하는 단계. 신호가 끊기면 기다리던 약속이 끝나지 않아도 바로 실패한다. */
export function orAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const fail = () => reject(new DOMException("aborted", "AbortError"));
    if (signal.aborted) return fail();
    signal.addEventListener("abort", fail, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", fail));
  });
}

const json = (token: string | null) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
});

const isReading = (data: unknown): data is SajuReading<unknown> =>
  typeof (data as { readingId?: unknown } | null)?.readingId === "string";

async function post(token: string | null, body: Record<string, unknown>, signal?: AbortSignal) {
  const response = await fetch("/api/chemi/readings", {
    method: "POST",
    headers: json(token),
    signal,
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ChemiRequestError(data?.error?.code ?? null, response.status);
  return data;
}

/** 사주 첫 풀이를 만들거나(첫 호출) 이미 저장된 풀이를 돌려받는다. */
export async function requestFirst(
  token: string | null,
  character: SajuCharacterId,
  signal?: AbortSignal,
): Promise<SajuReading> {
  const data = await post(token, { content: "saju", kind: "first", character }, signal);
  if (!isReading(data) || !isChart(data.result)) throw new ChemiRequestError("CHEMI_BAD_RESPONSE");
  return data as SajuReading;
}

/** 저장해 둔 상대와 궁합을 본다. 하루 1번 무료 한도는 서버가 센다. */
export async function requestPair(
  token: string | null,
  character: SajuCharacterId,
  partnerId: string,
  signal?: AbortSignal,
): Promise<SajuReading<PairResult>> {
  const data = await post(token, { content: "saju", kind: "compat", character, partnerId }, signal);
  const result = (data as { result?: PairResult } | null)?.result;
  if (!isReading(data) || !Array.isArray(result?.dayStems) || result.dayStems.length !== 2)
    throw new ChemiRequestError("CHEMI_BAD_RESPONSE");
  return data as SajuReading<PairResult>;
}

const isPairResult = (result: unknown): result is PairResult => {
  const candidate = result as Partial<PairResult> | null;
  return (
    Array.isArray(candidate?.dayStems) &&
    candidate.dayStems.length === 2 &&
    Array.isArray(candidate.combinations) &&
    Array.isArray(candidate.clashes)
  );
};

/** 저장된 궁합 풀이 한 건의 결과. 사주 첫 풀이나 다른 콘텐츠는 null. */
export async function loadPairReading(
  token: string | null,
  readingId: string,
  character: SajuCharacterId,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `/api/chemi/readings/${encodeURIComponent(readingId)}?c=${character}`,
    { headers: json(token), signal },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok || !isReading(data)) return null;
  return isPairResult(data.result) ? data.result : null;
}

/** 저장된 첫 풀이 한 건. 다른 콘텐츠·종류는 null. */
export async function loadReading(
  token: string | null,
  readingId: string,
  character: SajuCharacterId,
  signal?: AbortSignal,
) {
  const response = await fetch(
    `/api/chemi/readings/${encodeURIComponent(readingId)}?c=${character}`,
    { headers: json(token), signal },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok || !isReading(data)) return null;
  // 사주표 모양이면 사주 첫 풀이다. 궁합 결과나 다른 콘텐츠는 이 모양이 아니다.
  return isChart(data.result) ? (data as SajuReading) : null;
}

export type Birth = {
  birthPlace?: string | null;
  birthDate: string;
  calendar: "solar" | "lunar" | "lunar_leap";
  birthTime: string | null;
  timePrecision: "exact" | "band" | "unknown";
  gender: "female" | "male" | null;
};
export type Partner = Birth & { id: string; nickname: string };
export type Profile = { birth: Birth | null; partners: Partner[] };

/** 내 생일과 저장한 상대. 없으면 빈 프로필. */
export async function loadProfile(token: string | null, signal?: AbortSignal): Promise<Profile> {
  const response = await fetch("/api/chemi/profile", { headers: json(token), signal });
  if (!response.ok) throw new ChemiRequestError(null, response.status);
  const data = await response.json();
  return { birth: data.birth ?? null, partners: data.partners ?? [] };
}

/** 사주 첫 풀이를 이미 본 최애마다 가장 최근 풀이 번호. 목록은 최신순이다. */
export async function listFirsts(token: string | null, signal?: AbortSignal) {
  const response = await fetch("/api/chemi/readings?content=saju", {
    headers: json(token),
    signal,
  });
  if (!response.ok) throw new ChemiRequestError(null, response.status);
  const rows: { readingId?: string; kind?: string; character?: SajuCharacterId }[] =
    await response.json();
  const firsts: Partial<Record<SajuCharacterId, string>> = {};
  for (const row of rows)
    if (row.kind === "first" && row.character && row.readingId && !firsts[row.character])
      firsts[row.character] = row.readingId;
  return firsts;
}

export async function saveBirth(token: string | null, birth: Birth) {
  const response = await fetch("/api/chemi/profile/birth", {
    method: "PUT",
    headers: json(token),
    body: JSON.stringify({ birthDate: birth.birthDate, calendar: birth.calendar, birthTime: birth.birthTime, timePrecision: birth.timePrecision, gender: birth.gender, birthPlace: birth.birthPlace ?? null, consent: true }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ChemiRequestError(data?.error?.code ?? null, response.status);
  }
}

export async function savePartner(token: string | null, nickname: string, birth: Birth) {
  const response = await fetch("/api/chemi/partners", {
    method: "POST",
    headers: json(token),
    body: JSON.stringify({ ...birth, nickname, source: "saju" }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ChemiRequestError(data?.error?.code ?? null, response.status);
  return data.partnerId as string;
}

export type Participation = { period: "today" | "week" | "all"; count: number } | null;

export async function loadParticipation(signal?: AbortSignal): Promise<Participation> {
  const response = await fetch("/api/chemi/home", { signal });
  if (!response.ok) return null;
  return (await response.json()).participation ?? null;
}
