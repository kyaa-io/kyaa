"use client";

import { useEffect } from "react";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";

const SEEN_AFTER_MS = 800;

/** 선물 내용이 화면에 보인 뒤 0.8초 동안 문서가 보이고 있으면 서버에 읽음을 알린다. 탭이 숨겨지면 세고 있던 시간을 버린다. 알림은 멱등이다. */
export function GiftViewedMarker({ rewardResultId, ownerId, getAccessToken }: Readonly<{ rewardResultId: string; ownerId: string | undefined; getAccessToken: () => Promise<string | null> }>) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const send = async () => {
      try {
        const token = await getAccessToken();
        if (!token || finished) return;
        const response = await fetch(`/api/me/gifts/${encodeURIComponent(rewardResultId)}/read`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        if (response.ok) { finished = true; notifyFanActivityUpdated(ownerId, ["summary"]); }
      } catch { /* 읽음은 다음 방문에서 다시 보낸다. 선물은 그대로 보인다. */ }
    };
    const start = () => { if (!document.hidden && !finished && timer === undefined) timer = setTimeout(() => { timer = undefined; void send(); }, SEEN_AFTER_MS); };
    const stop = () => { if (timer !== undefined) { clearTimeout(timer); timer = undefined; } };
    const onVisibility = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { finished = true; stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [rewardResultId, ownerId, getAccessToken]);
  return null;
}
