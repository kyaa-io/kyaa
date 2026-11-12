"use client";
import { useCallback, useSyncExternalStore } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { withOperationDeadline } from "@/features/reliability/client/request-deadline";

/** A stalled sign-in SDK (a session refresh that never answers) must not hold every screen on its skeleton. */
export const AUTH_READY_DEADLINE_MS = 4_000;
export const AUTH_TOKEN_DEADLINE_MS = 5_000;
let readyWaitExpired = false;
let readyWaitTimer: ReturnType<typeof setTimeout> | undefined;
const readyWaitListeners = new Set<() => void>();
function subscribeReadyWait(listener: () => void) {
  readyWaitListeners.add(listener);
  if (!readyWaitExpired && readyWaitTimer === undefined) readyWaitTimer = setTimeout(() => { readyWaitExpired = true; readyWaitListeners.forEach((notify) => notify()); }, AUTH_READY_DEADLINE_MS);
  return () => { readyWaitListeners.delete(listener); };
}
export function resetAuthReadyDeadlineForTest() { readyWaitExpired = false; clearTimeout(readyWaitTimer); readyWaitTimer = undefined; readyWaitListeners.clear(); }

/** For reads that also serve signed-out viewers: after the ready deadline the viewer reads as a guest until sign-in settles,
 * and a token that does not arrive in time rejects instead of waiting. Screens that act for a member keep `useByUsAuth`. */
export function usePublicReadAuth() {
  const auth = useByUsAuth();
  const session = useByUsSession();
  const expired = useSyncExternalStore(subscribeReadyWait, () => readyWaitExpired, () => false);
  const { getAccessToken: read } = auth;
  const getAccessToken = useCallback(() => withOperationDeadline(read(), AUTH_TOKEN_DEADLINE_MS), [read]);
  // While a new sign-in is still being exchanged (or its exchange failed), public reads stay guest reads;
  // the member re-read starts when the session is ready.
  if (auth.ready && auth.authenticated && !session.ready) return { ready: true, authenticated: false, user: null, getAccessToken };
  if (auth.ready) return { ready: true, authenticated: auth.authenticated, user: auth.user, getAccessToken };
  return { ready: expired, authenticated: false, user: null, getAccessToken };
}
