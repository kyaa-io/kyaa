"use client";
import { useEffect, useRef } from "react";
import { renewFanSession, readFanSessionHint, cancelFanSessionMaintenance, watchFanSessionLoss } from "./fan-session";
export function FanSessionKeeper({ ownerId, getPrivyAccessToken, onAccountUnavailable }: { ownerId: string | null; getPrivyAccessToken(): Promise<string | null>; onAccountUnavailable?(): void | Promise<void> }) {
  const tokenGetter = useRef(getPrivyAccessToken);
  tokenGetter.current = getPrivyAccessToken;
  const unavailable = useRef(onAccountUnavailable);
  unavailable.current = onAccountUnavailable;
  useEffect(() => {
    if (!ownerId) return;
    const stopWatching = watchFanSessionLoss(() => tokenGetter.current(), ownerId);
    let active = true;
    const initialExchange = renewFanSession(() => tokenGetter.current(), ownerId);
    const afterLogin = async () => {
      await initialExchange;
      if (active && readFanSessionHint()?.pid !== ownerId) void renewFanSession(() => tokenGetter.current(), ownerId);
    };
    // The account is gone or disabled: sign out so no screen keeps asking with a login that can never work.
    const accountGone = () => { void Promise.resolve(unavailable.current?.()).catch(() => undefined); };
    window.addEventListener("kyaa:login-synchronized", afterLogin);
    window.addEventListener("kyaa:fan-account-unavailable", accountGone);
    return () => { active = false; window.removeEventListener("kyaa:login-synchronized", afterLogin); window.removeEventListener("kyaa:fan-account-unavailable", accountGone); stopWatching(); cancelFanSessionMaintenance(); };
  }, [ownerId]);
  return null;
}
