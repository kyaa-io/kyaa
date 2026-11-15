"use client";
// What the Privy sign-in (AUTH_PROVIDER=privy, PRIVY-RESTORE-1115) hands the app. SDK-free on purpose: every page reads
// this context, while the Privy code itself loads only in privy mode (privy-root.island.tsx, a separate chunk).
// No provider above → null → the app is in Cognito mode (or an isolated test).
import { createContext, useContext } from "react";
import type { ByUsAuth } from "./auth-fallback";

export interface PrivyLoginUser {
  id: string;
  linkedAccounts: ReadonlyArray<{ type: string; chainType?: string; connectorType?: string; walletClientType?: string }>;
}

/** The login page listens for the OAuth result, which can arrive on the return page before Privy reports `authenticated`. */
export interface PrivyOAuthListener {
  onComplete(userId: string): void;
  onError(): void;
}

export interface PrivyBridge {
  auth: ByUsAuth;
  oauthLoading: boolean;
  startOAuth(provider: "google" | "apple"): Promise<void>;
  subscribeOAuth(listener: PrivyOAuthListener): () => void;
  /** Privy's own Google sign-in window (operator login). */
  openGoogleLogin(): void;
  refreshUser(): Promise<PrivyLoginUser>;
  createWallet(): Promise<unknown>;
}

export const PrivyBridgeContext = createContext<PrivyBridge | null>(null);
export const usePrivyBridge = () => useContext(PrivyBridgeContext);
