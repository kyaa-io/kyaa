"use client";
import { useEffect, useState } from "react";
import { groupChatUnreadSchema } from "../domain/contracts";
import { useGroupRequest } from "./use-group-resource";

/** 채팅방이 읽은 위치를 올렸을 때 탭의 안 읽은 개수를 다시 읽게 하는 신호. */
export const GROUP_CHAT_READ_EVENT = "kyaa:group-chat-read";

/** 팬페이지 채팅방 탭의 안 읽은 메시지 수. 로그인한 사람만 30초마다 묻고, 들어갈 수 없거나 실패하면 0이다. */
export function useChatUnread(pageId: string | null) {
  const { request, ready, authenticated, ownerKey } = useGroupRequest();
  const key = `${ownerKey}:${pageId}`, [snapshot, setSnapshot] = useState<{ key: string; count: number }>();
  useEffect(() => {
    if (!ready || !authenticated || !pageId) return;
    let active = true, blocked = false;
    const read = async () => {
      if (blocked || document.visibilityState === "hidden") return;
      try { const { unreadCount } = groupChatUnreadSchema.parse(await request(`/api/groups/${pageId}/chat?unread=1`)); if (active) setSnapshot({ key, count: unreadCount }); }
      catch { blocked = true; if (active) setSnapshot({ key, count: 0 }); }
    };
    void read();
    const timer = setInterval(() => void read(), 30000), now = () => void read();
    document.addEventListener("visibilitychange", now);
    window.addEventListener(GROUP_CHAT_READ_EVENT, now);
    return () => { active = false; clearInterval(timer); document.removeEventListener("visibilitychange", now); window.removeEventListener(GROUP_CHAT_READ_EVENT, now); };
  }, [key, pageId, request, ready, authenticated]);
  return snapshot?.key === key ? snapshot.count : 0;
}
