"use client";
import { createContext, useContext, type ReactNode } from "react";

/** Account switch is DEV-only until the user approves it for production (ACCOUNT-SWITCH-S1-1124). Off unless the layout turns it on. */
const AccountSwitchReleaseContext = createContext(false);
export function AccountSwitchReleaseProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <AccountSwitchReleaseContext.Provider value={enabled}>{children}</AccountSwitchReleaseContext.Provider>;
}
export function useAccountSwitchRelease() { return useContext(AccountSwitchReleaseContext); }
/** On for the DEV deployment and local development; production and staging stay off, including when APP_ENV is missing. */
export function accountSwitchEnabled(env: { APP_ENV?: string; NODE_ENV?: string }) { return env.APP_ENV === "dev" || (env.APP_ENV === undefined && env.NODE_ENV === "development"); }
