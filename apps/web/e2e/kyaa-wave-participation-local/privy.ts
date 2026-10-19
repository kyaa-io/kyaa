const params = new URLSearchParams(location.search);
const owner = { id: "did:privy:participation-local-fixture" };
const getAccessToken = async () => "participation-local-fixture";
export const usePrivy = () => ({ ready: params.get("scenario") !== "restoring", authenticated: params.get("auth") !== "off", user: params.get("auth") === "off" ? null : owner, getAccessToken });
