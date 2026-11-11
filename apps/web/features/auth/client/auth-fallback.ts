"use client";
// Auth state for a component rendered without CognitoAuthProvider: isolated component tests and the local e2e
// harnesses, which substitute this module. Every page mounts CognitoAuthProvider, so production never reads it.
// The hook keeps its historical name so those substitutions stay unchanged; no Privy code is involved (PRIVY-EXIT-0005).
import { openLoginPage } from "./open-login-page";

export interface ByUsAuthUser {
  id: string;
  linkedAccounts: ReadonlyArray<{ type: string }>;
}

export interface ByUsAuth {
  ready: boolean;
  authenticated: boolean;
  user: ByUsAuthUser | null;
  getAccessToken(): Promise<string | null>;
  logout(): Promise<void>;
  /** Opens kyaa's login page and returns to the current page afterwards. */
  login(): void;
}


// Not ready, like an auth provider that has not answered yet: callers keep their neutral state.
const SIGNED_OUT: ByUsAuth = {
  ready: false,
  authenticated: false,
  user: null,
  getAccessToken: async () => null,
  logout: async () => {},
  login: openLoginPage,
};

export function usePrivy(): ByUsAuth {
  return SIGNED_OUT;
}
