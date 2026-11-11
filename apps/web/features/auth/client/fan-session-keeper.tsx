"use client";
import { useEffect } from "react";
import { usePrivy } from "@/features/auth/client/privy-backend";
import { clearFanSession, renewFanSession, RENEW_AFTER_MS } from "./fan-session";

/** One per page: trades Privy's token for our fan session cookie while signed in, and drops it once Privy says signed out. */
export function FanSessionKeeper() {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const pid = ready && authenticated ? user?.id ?? null : null;
  useEffect(() => {
    if (!ready) return;
    if (!pid) { clearFanSession(); return; }
    let active = true;
    const renew = () => { void getAccessToken().then((token) => { if (active && token) renewFanSession(token, pid); }).catch(() => undefined); };
    renew();
    const timer = setInterval(renew, RENEW_AFTER_MS);
    return () => { active = false; clearInterval(timer); };
  }, [ready, pid, getAccessToken]);
  return null;
}
