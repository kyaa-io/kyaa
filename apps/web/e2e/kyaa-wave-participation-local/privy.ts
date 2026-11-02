const params = new URLSearchParams(location.search);
const owner = { id: "did:privy:participation-local-fixture" };
const getAccessToken = async () => "participation-local-fixture";
export const usePrivy = () => ({ ready: params.get("scenario") !== "restoring", authenticated: params.get("auth") !== "off", user: params.get("auth") === "off" ? null : owner, getAccessToken });

export const useByUsAuth = usePrivy;

// OAuth is unavailable in local UI fixtures; importing settings must not start it.
const refreshUser = async () => owner;
const initOAuth = async () => { throw new Error('OAuth is not connected in local fixtures'); };
export const useUser = () => ({ user: owner, refreshUser });
export const useLinkWithOAuth = () => ({ initOAuth, loading: false, state: { status: 'initial' as const } });
