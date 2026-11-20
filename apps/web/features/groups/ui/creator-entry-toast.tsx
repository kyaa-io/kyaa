"use client";
import { useEffect, useRef } from "react";
import { closeFanToast, showFanToast } from "@/components/fan-ui/fan-toast";
import { useByUsSession } from "@/components/byus-session-provider";
import { chatCopy } from "./chat-copy";
import { useGroupPage } from "./group-page-context";

/** 같은 크리에이터의 입장 알림을 다른 탭·새로고침에서 다시 띄우지 않는 간격. 화면을 보는 중에 나갔다 다시 들어오면 바로 띄운다. */
const REPEAT_MS = 30 * 60 * 1000;
const storageKey = (pageId: string, artistId: string) => `kyaa:creator-entry:${pageId}:${artistId}`;
function shownRecently(key: string) {
  try { const at = Number(window.localStorage.getItem(key)); return Number.isFinite(at) && Date.now() - at < REPEAT_MS; } catch { return false; }
}
function remember(key: string) {
  try { window.localStorage.setItem(key, String(Date.now())); } catch { /* 저장소가 막혀도 알림은 한 번 보인다. */ }
}

/** 팬페이지에 크리에이터 본인이 들어오면 '<이름> 입장 중' 알림(대표 11/19 20:35). 머리의 접속 알약과 같은 공개 접속 값(공개 동의한 본인만)을 쓰므로
 * 그 페이지를 보는 모든 사람에게 같은 정보다. 크리에이터 자신에게는 띄우지 않는다. 팬페이지에서만 마운트된다. */
export function CreatorEntryToast() {
  const g = useGroupPage();
  const session = useByUsSession();
  const pageId = g.page?.id;
  const name = g.celebrity?.name ?? g.page?.name;
  const artists = g.presence.data?.artists;
  const online = useRef<{ pageId?: string; ids: Set<string> } | null>(null);
  const { hrefFor, activeTab, locale, selectTab } = g;
  useEffect(() => {
    if (!pageId || !name || !artists) return;
    const now = new Set(artists.filter((artist) => artist.online && artist.profileId !== session.ownerId).map((artist) => artist.profileId));
    const before = online.current?.pageId === pageId ? online.current.ids : null;
    online.current = { pageId, ids: now };
    const entered = [...now].filter((id) => before ? !before.has(id) : !shownRecently(storageKey(pageId, id)));
    if (!entered.length) return;
    for (const id of entered) remember(storageKey(pageId, id));
    const c = chatCopy(locale);
    const id = showFanToast({
      title: c.entered.replace("{name}", name),
      duration: 8000,
      ...(activeTab === "rooms" ? {} : { action: { label: c.open, onClick: () => { closeFanToast(id); selectTab("rooms"); window.history.pushState(null, "", hrefFor("rooms")); } } }),
    });
  }, [activeTab, artists, hrefFor, locale, name, pageId, selectTab, session.ownerId]);
  return null;
}
