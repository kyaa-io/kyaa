// Synthetic verifier is confined to this standalone loopback harness.
import { useSyncExternalStore } from "react";
const subscribe = (callback: () => void) => { window.addEventListener("lounge-identity", callback); return () => window.removeEventListener("lounge-identity", callback); };
const read = () => localStorage.getItem("lounge-test-identity") ?? "guest";
const tokens = new Map<string, () => Promise<string | null>>();
const select = (identity: string) => { localStorage.setItem("lounge-test-identity", identity); window.dispatchEvent(new Event("lounge-identity")); };
export function usePrivy() {
  const identity = useSyncExternalStore(subscribe, read, () => "guest");
  if (!tokens.has(identity)) tokens.set(identity, async () => identity === "guest" ? null : `lounge-local-${identity}`);
  return { ready: true, authenticated: identity !== "guest", user: identity === "guest" ? null : { id: `did:privy:lounge-local-${identity}` }, getAccessToken: tokens.get(identity)!, login: () => select("fan"), logout: () => select("guest") };
}
export function useCreateWallet() { return { createWallet: async () => undefined }; }
export function useUser() {
  return { refreshUser: async () => ({ id: `did:privy:lounge-local-${read()}`, linkedAccounts: [{ type: "wallet", chainType: "ethereum", connectorType: "embedded", walletClientType: "privy" }] }) };
}
export function useOAuthTokens(_callbacks: unknown) {}
export function useSubscribeToJwtAuthWithFlag(_callbacks: unknown) {}
export function useLinkWithOAuth(_callbacks?: unknown) { return { initOAuth: async () => undefined }; }
export function useLoginWithOAuth(_callbacks?: unknown) { return { initOAuth: async () => undefined, state: { status: "initial" } }; }
export function useLinkEmail(_callbacks?: unknown) { return { sendCode: async () => undefined, linkWithCode: async () => undefined, state: { status: "initial" } }; }
export function useLinkJwtAccount(_callbacks?: unknown) { return { linkJwtAccount: async () => undefined }; }
export function useLogin(_callbacks?: unknown) { return { login: () => undefined }; }
export function PrivyProvider({ children }: { children?: unknown }) { return children as never; }
