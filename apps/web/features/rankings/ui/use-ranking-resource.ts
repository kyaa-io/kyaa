"use client";

import { useCallback, useEffect, useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";

type State<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error" };

/** Rankings are public; a signed-in viewer also gets "my" values, so the token is attached when one exists. */
export function useRankingResource<T>(url: string, parse: (value: unknown) => T) {
  const { ready, authenticated, getAccessToken } = useByUsAuth();
  const [state, setState] = useState<State<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    (async () => {
      try {
        const token = authenticated ? await getAccessToken() : null;
        const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined, signal: controller.signal });
        if (!response.ok) throw new Error("rankings unavailable");
        setState({ status: "ready", data: parse(await response.json()) });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    })();
    return () => controller.abort();
    // parse is a module-level schema parser; the request is keyed by url and the sign-in state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ready, authenticated, attempt]);

  return { state, retry };
}
