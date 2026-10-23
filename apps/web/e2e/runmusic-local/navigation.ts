export const useSearchParams = () => new URLSearchParams(location.search);
export const usePathname = () => location.pathname;
export const useRouter = () => ({push:(url:string)=>location.assign(url),replace:(url:string)=>location.replace(url)});
