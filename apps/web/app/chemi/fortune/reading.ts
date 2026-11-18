import type { computeDailyFortune } from "@/server/chemi-engine/fortune";
import type { FortuneCharacterId } from "./lines";

export type FortuneReading = {
  readingId: string;
  result: ReturnType<typeof computeDailyFortune>;
  styled?: { headline?: string; share?: { line?: string } } | null;
  reward?: { points?: number; stamp?: boolean; exp?: number };
  replayed?: boolean;
};

export class ChemiRequestError extends Error {
  constructor(readonly code: string | null) {
    super(code ?? "CHEMI_REQUEST");
  }
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
    throw new ChemiRequestError(data?.error?.code ?? null);
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
    throw new ChemiRequestError(data?.error?.code ?? null);
  }
}

export type Participation = { period: "today" | "week" | "all"; count: number } | null;

export async function loadParticipation(signal?: AbortSignal): Promise<Participation> {
  const response = await fetch("/api/chemi/home", { signal });
  if (!response.ok) return null;
  return (await response.json()).participation ?? null;
}
