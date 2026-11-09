"use client";

import dynamic from "next/dynamic";
import { Suspense, useEffect, useState } from "react";
import { useChatDockTarget } from "@/features/group-social/chat-dock-store";

// Root-layout pieces that draw nothing on the first screen. Their code is fetched after the page has loaded, so it does not
// share the first screen's bandwidth with the CSS and the hero picture (PERF-r8 C).
const ChatDockHost = dynamic(() => import("@/features/group-social/chat-dock-host").then(module => module.ChatDockHost), { ssr: false });
const BanksyEntryPromotion = dynamic(() => import("./banksy-promotion/banksy-promotion").then(module => module.BanksyEntryPromotion), { ssr: false });
const TierCelebration = dynamic(() => import("@/features/tier-history/ui/tier-celebration").then(module => module.TierCelebration), { ssr: false });
const PwaRegistration = dynamic(() => import("./pwa-registration").then(module => module.PwaRegistration), { ssr: false });

/** True once the window has loaded and the browser is idle (at most 2s after load). */
export function useAfterPageLoad(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let idle: number | undefined;
    let timer: number | undefined;
    const start = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(() => setReady(true), { timeout: 2000 });
      else timer = window.setTimeout(() => setReady(true), 1);
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      window.removeEventListener("load", start);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);
  return ready;
}

/** `before` sits where the chat dock was (ahead of the page), `after` where the dialogs were (after it), so stacking is unchanged. */
export function DeferredRootClients({ slot }: { slot: "before" | "after" }) {
  const ready = useAfterPageLoad();
  // A chat asked for before the page has loaded (or restored from this tab's session) opens at once, not after load.
  const chatRequested = useChatDockTarget() !== null;
  if (slot === "before") return <>{ready && <PwaRegistration />}{(ready || chatRequested) && <ChatDockHost />}</>;
  if (!ready) return null;
  return <><Suspense fallback={null}><BanksyEntryPromotion /></Suspense><TierCelebration /></>;
}
