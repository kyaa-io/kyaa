export function useOAuthTokens(_c: unknown) {}
export function useCreateWallet() { return { createWallet: async () => undefined }; }
export function useUser() { return { refreshUser: async () => ({ id: "x", linkedAccounts: [] }) }; }
export function useSubscribeToJwtAuthWithFlag(_c?: unknown) {}
export const usePrivy = () => ({ ready: true, authenticated: false, user: null, getAccessToken: async () => null });
export const useByUsAuth = usePrivy;
