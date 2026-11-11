"use client";

import { createContext, useContext, type ReactNode } from "react";

// The first-login Google photo import used Privy's Google OAuth access token. Cognito sign-in (PRIVY-EXIT-0005) does
// not hand that token to the browser, so the import is off; the session readiness hooks stay for their callers.
const SessionAvatarContext = createContext({
  markReady: (_ownerId: string) => {},
  reset: () => {},
});

/** Login synchronization remains independent of the optional photo import. */
export function useAvatarSessionReady() {
  return useContext(SessionAvatarContext).markReady;
}

/** A fresh login generation must not inherit readiness from the same owner. */
export function useAvatarSessionReset() {
  return useContext(SessionAvatarContext).reset;
}

const NO_IMPORT = { markReady: (_ownerId: string) => {}, reset: () => {} };

export function AvatarSessionBridge({ children }: { children: ReactNode }) {
  return <SessionAvatarContext.Provider value={NO_IMPORT}>{children}</SessionAvatarContext.Provider>;
}
