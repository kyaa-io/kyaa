"use client";

import { useEffect, useState } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";

// Toss returns to the checkout pathname without the query from the fortune page.
const storageKey = "chemi-point-fortune-return";

export function FortuneReturnLink() {
  const [back, setBack] = useState("");
  useEffect(() => {
    const incoming = new URLSearchParams(window.location.search).get(
      "returnTo",
    );
    try {
      const candidate = incoming ?? sessionStorage.getItem(storageKey);
      if (!candidate) return;
      const url = new URL(candidate, window.location.origin);
      if (
        url.origin !== window.location.origin ||
        url.pathname !== "/chemi/fortune"
      )
        return;
      const day = url.searchParams.get("date");
      if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
      const params = new URLSearchParams({ date: day });
      for (const key of ["r", "step", "c", "locale"]) {
        const value = url.searchParams.get(key);
        if (value) params.set(key, value);
      }
      const path = `/chemi/fortune?${params}#fortune-date`;
      setBack(path);
      sessionStorage.setItem(storageKey, path);
    } catch {
      // Storage is optional when the original return URL is still present.
    }
  }, []);
  if (!back) return null;
  return (
    <FanAction
      href={back}
      onClick={() => {
        try {
          sessionStorage.removeItem(storageKey);
        } catch {}
      }}
    >
      선택한 날짜의 운세로 돌아가기
    </FanAction>
  );
}
