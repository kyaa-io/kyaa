"use client";
import { useSyncExternalStore } from "react";

/** The open chat window. Lives outside React so it survives page changes, and in sessionStorage so it survives a reload in this tab. */
export type ChatDockTarget = {
  owner: string;
  profileId: string;
  nickname: string;
  avatarUrl: string | null;
  conversationId: string | null;
};

const KEY = "kyaa.chat-dock";
const listeners = new Set<() => void>();
let current: ChatDockTarget | null = null;
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as ChatDockTarget | null;
    if (value && typeof value.owner === "string" && typeof value.profileId === "string") current = value;
  } catch { current = null; }
}
function publish(next: ChatDockTarget | null) {
  load();
  current = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch { /* The window still works for this page without storage. */ }
  for (const listener of listeners) listener();
}

/** `ownerKey` ends in a session generation that changes between loads. The window belongs to the person, not the session. */
export const chatDockOwner = (ownerKey: string) => ownerKey.slice(0, ownerKey.lastIndexOf(":"));

/** Opening moves focus into the window. A window restored after a reload or page change must not take focus from the page. */
let focusRequested = false;
export const openChatDock = (target: ChatDockTarget) => { focusRequested = true; publish(target); };
export const takeChatDockFocus = () => { const value = focusRequested; focusRequested = false; return value; };
export const closeChatDock = () => publish(null);
export const setChatDockConversation = (conversationId: string) => { load(); if (current) publish({ ...current, conversationId }); };

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => { load(); return current; };
export const useChatDockTarget = () => useSyncExternalStore(subscribe, snapshot, () => null);
/** For tests. */
export const resetChatDockStore = () => { current = null; loaded = false; try { sessionStorage.removeItem(KEY); } catch { /* none */ } };
