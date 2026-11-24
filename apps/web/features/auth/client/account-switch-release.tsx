"use client";
import { createContext, useContext, type ReactNode } from "react";

/** Account switch is DEV-only until the user approves it for production (ACCOUNT-SWITCH-S1-1124). Off unless the layout turns it on. */
const AccountSwitchReleaseContext = createContext(false);
export function AccountSwitchReleaseProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <AccountSwitchReleaseContext.Provider value={enabled}>{children}</AccountSwitchReleaseContext.Provider>;
}
export function useAccountSwitchRelease() { return useContext(AccountSwitchReleaseContext); }
