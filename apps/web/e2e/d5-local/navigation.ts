// 합성 하니스 전용: push/replace를 이동 없이 window.__nav에 기록한다.
const log: string[] = ((window as unknown as { __nav?: string[] }).__nav ??= []);
const router = { push: (h: string) => { log.push('push:' + h); }, replace: (h: string) => { log.push('replace:' + h); }, refresh: () => {}, prefetch: () => {}, back: () => { log.push('back'); } };
export const useRouter = () => router;
export const usePathname = () => location.pathname;
export const useSearchParams = () => new URLSearchParams(location.search);
