import { useSyncExternalStore } from "react";
export { useOAuthTokens, useCreateWallet, useUser } from "../community-stamps-local/privy";
// Local harness only. Never reads or submits a real identity.
const getAccessToken = async () => "banner-local-synthetic-token";
export function useSubscribeToJwtAuthWithFlag(_callbacks: unknown) {}
function subscribe(listener: () => void) {
  window.addEventListener("banner-local-account", listener);
  return () => window.removeEventListener("banner-local-account", listener);
}
export function usePrivy() {
  const owner = useSyncExternalStore(subscribe, () => localStorage.getItem("banner-local-account"));
  return { ready: true, authenticated: Boolean(owner) || new URLSearchParams(location.search).get("scenario") === "home-polish", user: { id: owner ?? "translation-local" }, login: () => undefined, getAccessToken };
}
