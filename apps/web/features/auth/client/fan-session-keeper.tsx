"use client";
import { useEffect, useRef } from "react";
import { renewFanSession, readFanSessionHint, cancelFanSessionMaintenance } from "./fan-session";
export function FanSessionKeeper({ ownerId, getPrivyAccessToken }: { ownerId: string | null; getPrivyAccessToken(): Promise<string | null> }) {
  const tokenGetter = useRef(getPrivyAccessToken);
  tokenGetter.current = getPrivyAccessToken;
  useEffect(() => {
    if (!ownerId) return;
    void renewFanSession(() => tokenGetter.current(), ownerId);
    const afterLogin = () => { if (readFanSessionHint()?.pid !== ownerId) void renewFanSession(() => tokenGetter.current(), ownerId); };
    window.addEventListener("kyaa:login-synchronized", afterLogin);
    return () => { window.removeEventListener("kyaa:login-synchronized", afterLogin); cancelFanSessionMaintenance(); };
  }, [ownerId]);
  return null;
}
