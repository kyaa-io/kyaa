export const useAdminSession = () => ({status:"authorized",admin:{email:"fixture@example.invalid",role:new URLSearchParams(location.search).get("role")??"admin"}});
