export const useRouter = () => ({ push: (url: string) => { window.location.assign(url); }, replace: (url: string) => { window.location.replace(url); }, refresh: () => window.location.reload(), prefetch: () => {} });
export const usePathname = () => location.pathname;
export const useSearchParams = () => new URLSearchParams(location.search);
