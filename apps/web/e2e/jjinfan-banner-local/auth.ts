const getAccessToken = async () => "local-fixture";
export const useByUsAuth = () => ({ ready: true, authenticated: new URLSearchParams(location.search).has("viewer"), user: { id: "translation-local" }, getAccessToken, login: () => {} });
export const usePrivy = useByUsAuth;
