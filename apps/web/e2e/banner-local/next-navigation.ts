export { usePathname, useSearchParams } from "../mission-local/next-navigation";
const router = {
  push: (url: string) => location.assign(url),
  replace: (url: string) => location.replace(url),
  // Static fixtures have no server components to refresh when a LIVE start passes.
  refresh: () => undefined,
};
export const useRouter = () => router;
