// 합성 하니스 전용: history 기반 최소 라우터(push/replace는 실제 history에 반영).
const fire = () => window.dispatchEvent(new Event('f10-nav'));
const router = {
  push: (h: string) => { history.pushState({}, '', h); fire(); },
  replace: (h: string) => { history.replaceState({}, '', h); fire(); },
  refresh: () => {}, prefetch: () => {}, back: () => history.back(),
};
export const useRouter = () => router;
export const usePathname = () => location.pathname;
export const useSearchParams = () => new URLSearchParams(location.search);
