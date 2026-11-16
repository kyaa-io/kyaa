"use client";
import { useEffect, useRef } from "react";
import { renewFanSession, readFanSessionHint, cancelFanSessionMaintenance, watchFanSessionLoss } from "./fan-session";
export function FanSessionKeeper({ ownerId, getPrivyAccessToken }: { ownerId: string | null; getPrivyAccessToken(): Promise<string | null> }) {
  const tokenGetter = useRef(getPrivyAccessToken);
  tokenGetter.current = getPrivyAccessToken;
  useEffect(() => {
    if (!ownerId) return;
    const stopWatching = watchFanSessionLoss(() => tokenGetter.current(), ownerId);
    void renewFanSession(() => tokenGetter.current(), ownerId);
    const afterLogin = () => { if (readFanSessionHint()?.pid !== ownerId) void renewFanSession(() => tokenGetter.current(), ownerId); };
    window.addEventListener("kyaa:login-synchronized", afterLogin);
    return () => { window.removeEventListener("kyaa:login-synchronized", afterLogin); stopWatching(); cancelFanSessionMaintenance(); };
  }, [ownerId]);
  return null;
}
