import "server-only";
import { unstable_cache } from "next/cache";
import { isAwsHosting } from "../config/hosting";

/** ECS tasks must not retain independently stale data after a publication. */
export const hostingCache: typeof unstable_cache = (callback, keyParts, options) => {
  const cached = unstable_cache(callback, keyParts, options);
  return ((...args: Parameters<typeof callback>) => isAwsHosting() ? callback(...args) : cached(...args)) as typeof callback;
};
