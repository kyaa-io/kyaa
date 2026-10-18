export { useOAuthTokens, useCreateWallet, useUser } from "../community-stamps-local/privy";
const getAccessToken = async () => "song-browser-fixture";
export const usePrivy = () => {
  const signedIn = new URLSearchParams(location.search).get("auth") !== "off";
  return { ready: true, authenticated: signedIn, user: signedIn ? { id: "did:privy:song-browser-fixture" } : null, getAccessToken,
    login: () => { const url = new URL(location.href); url.searchParams.delete("auth"); location.assign(url); } };
};
