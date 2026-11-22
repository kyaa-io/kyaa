"use client";

import { useEffect, useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";

type Reading = { content: string; readingId: string; character: string; kind: string };

export function useTodayReadings() {
  const { ready, authenticated, user, getAccessToken } = useByUsAuth();
  const owner = user?.id;
  const [result, setResult] = useState<{ owner: string; readings: Reading[] }>();
  useEffect(() => {
    if (!ready || !authenticated || !owner) return;
    const controller = new AbortController();
    async function load(userId: string) {
      const token = await getAccessToken();
      if (!token) return;
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
      const response = await fetch(`/api/chemi/readings?from=${today}&to=${today}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response.ok) return;
      const readings: Reading[] = await response.json();
      if (Array.isArray(readings) && !controller.signal.aborted) setResult({ owner: userId, readings });
    }
    void load(owner).catch(() => {});
    return () => controller.abort();
  }, [ready, authenticated, owner, getAccessToken]);
  return authenticated && result?.owner === owner ? result?.readings : undefined;
}
