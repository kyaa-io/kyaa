export const useRouter = () => ({ push: (url: string) => { window.location.assign(url); } });

export const usePathname = () => "/my";
export const useSearchParams = () => new URLSearchParams(location.search);
