export const useSearchParams = () => new URLSearchParams(location.search);
export const usePathname = () => location.pathname;
const router = { push: (url:string) => location.assign(url), replace: (url:string) => location.replace(url), refresh: () => {} };
export const useRouter = () => router;
