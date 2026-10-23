// Synthetic identity for loopback UI verification only.
const getAccessToken = async () => {
 const query = new URLSearchParams(location.search);
 return query.get("auth") === "1" ? `kyaa-wave-local-token${query.has("owner") ? `:${query.get("owner")}` : ""}` : null;
};
const guest = { ready: true, authenticated: false, user: null, login: () => undefined, getAccessToken };
const member = { ...guest, authenticated: true, user: { id: "kyaa-wave-local-user" } };
export function usePrivy() { return new URLSearchParams(location.search).get("auth") === "1" ? member : guest; }
export const useCreateWallet = () => ({ createWallet: async () => undefined });
export const useUser = () => ({ refreshUser: async () => undefined });
