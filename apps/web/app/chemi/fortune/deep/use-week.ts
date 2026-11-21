"use client";

import { useEffect, useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { isFortuneResult } from "../reading";
import { isOpenDay, type FortuneDay, type OpenDay } from "./copy";

export type WeekState =
  | { status: "loading" | "guest" | "birth" | "error" }
  | { status: "ready"; today: string; days: OpenDay[] };

/** 오늘부터 7일의 운세. 내일·이번 주·오늘 카드가 같은 응답을 쓴다. */
export function useFortuneWeek(): WeekState & { retry: () => void; login: () => void } {
  const { ready, authenticated, user, getAccessToken, login } = useByUsAuth();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<WeekState>({ status: "loading" });
  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      setState({ status: "guest" });
      return;
    }
    const controller = new AbortController();
    setState({ status: "loading" });
    void (async () => {
      const response = await fetch("/api/chemi/fortune/deep", {
        headers: { Authorization: `Bearer ${await getAccessToken()}` },
        signal: controller.signal,
      });
      const body = await response.json();
      if (controller.signal.aborted) return;
      if (body?.error?.code === "CHEMI_BIRTH_REQUIRED") {
        setState({ status: "birth" });
        return;
      }
      const days: FortuneDay[] = Array.isArray(body?.days) ? body.days : [];
      const open = days.filter((row) => isOpenDay(row) && isFortuneResult(row.result)) as OpenDay[];
      // 오늘이 빠진 응답으로는 비교(오늘보다 ±)를 그릴 수 없다.
      if (!response.ok || open.length !== 7 || open[0].day !== body.today) throw Error();
      setState({ status: "ready", today: body.today, days: open });
    })().catch(() => {
      if (!controller.signal.aborted) setState({ status: "error" });
    });
    return () => controller.abort();
  }, [ready, authenticated, user?.id, getAccessToken, attempt]);
  return { ...state, retry: () => setAttempt((value) => value + 1), login };
}
