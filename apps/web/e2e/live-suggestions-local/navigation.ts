export const useRouter = () => ({ push: (url: string) => { location.assign(url); } });
export const usePathname = () => "/live/sample-live/suggestions";
export const useSearchParams = () => new URLSearchParams(location.search);
export function notFound(): never { throw new Error("Fixture not found"); }
