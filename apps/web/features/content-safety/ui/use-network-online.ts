"use client";
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => { window.removeEventListener("online", onChange); window.removeEventListener("offline", onChange); };
}

/** The browser's connection state, kept current by its online/offline events. True on the server and before hydration. */
export function useNetworkOnline() {
  return useSyncExternalStore(subscribe, () => navigator.onLine !== false, () => true);
}
