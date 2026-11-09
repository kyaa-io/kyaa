import "server-only";
import { loadServerEnv } from "../config/env";
import { createHomeGalleryRepository } from "./home-gallery-repository";

export function createPublicHomeGalleryRepository() {
  const env = loadServerEnv();
  return createHomeGalleryRepository({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
}
