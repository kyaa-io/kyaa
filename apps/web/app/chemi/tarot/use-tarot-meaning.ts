"use client";

import { useCallback, useEffect, useState } from "react";
import type { TarotCardContent } from "@/server/chemi-tarot/cards";

export type TarotMeaning =
  | { status: "loading"; card: null; retry: () => void }
  | { status: "ready"; card: TarotCardContent; retry: () => void }
  | { status: "error"; card: null; retry: () => void };

/** 뽑은 카드의 풀이 글. 카드 이름과 그림은 덱 표에서 바로 그리고, 해설만 이 글에 기댄다. */
export function useTarotMeaning(card: number | null): TarotMeaning {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ card: number; content: TarotCardContent | null } | null>(null);
  const retry = useCallback(() => {
    setState(null);
    setAttempt((value) => value + 1);
  }, []);
  useEffect(() => {
    if (card === null) return;
    const controller = new AbortController();
    void fetch(`/api/chemi/tarot/cards/${card}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<TarotCardContent>) : Promise.reject(new Error("card"))))
      .then((content) => setState({ card, content }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ card, content: null });
      });
    return () => controller.abort();
  }, [card, attempt]);
  if (card === null || state?.card !== card) return { status: "loading", card: null, retry };
  return state.content ? { status: "ready", card: state.content, retry } : { status: "error", card: null, retry };
}
