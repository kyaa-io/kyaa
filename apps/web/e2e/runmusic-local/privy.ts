const params = new URLSearchParams(location.search);
export const OWNER_ID = "91000000-0000-4000-8000-000000000001";
const getAccessToken = async () => { if(params.get("scenario")==="token-error")throw new Error("Local SDK token failure");return "local-example-token-not-a-secret"; };
export const usePrivy = () => ({ ready: params.get("scenario") !== "restoring", authenticated: params.get("auth") !== "off", user: params.get("auth") === "off" ? null : {id:OWNER_ID}, getAccessToken });

export const useByUsAuth = usePrivy;
