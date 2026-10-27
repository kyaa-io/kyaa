export { useOAuthTokens, useCreateWallet, useUser } from "../community-stamps-local/privy";
// Local harness only. Never reads or submits a real identity.
const getAccessToken = async () => "banner-local-synthetic-token";
export function useSubscribeToJwtAuthWithFlag(_callbacks: unknown) {}
export function usePrivy() {
  return { ready: true, authenticated: false, user: null, login: () => undefined, getAccessToken };
}
