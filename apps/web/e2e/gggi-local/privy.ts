const queryViewer = new URLSearchParams(location.search).get("viewer");
if (queryViewer === "fan" || queryViewer === "guest") sessionStorage.setItem("gggi-local-viewer", queryViewer);
export const isLocalFan = () => sessionStorage.getItem("gggi-local-viewer") === "fan";
const getAccessToken = async () => isLocalFan() ? "gggi-loopback-fan" : null;
export function useOAuthTokens(_callbacks: unknown) {}
export function useSubscribeToJwtAuthWithFlag(_callbacks: unknown) {}
export function useCreateWallet() { return { createWallet: async () => undefined }; }
export function useUser() { return { refreshUser: async () => ({ id: "did:privy:gggi-loopback-fan", linkedAccounts: [] }) }; }
export const usePrivy = () => ({ ready: true, authenticated: isLocalFan(), user: isLocalFan() ? { id: "did:privy:gggi-loopback-fan" } : null, getAccessToken });
