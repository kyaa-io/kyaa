import "server-only";
import { createClient } from "@/server/data/client";
import { z } from "zod";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { loadServerEnv } from "@/server/config/env";
import { createContentThumbnail, normalizePublicImage } from "@/server/media/public-image-processing";
import { translateText, translateTexts } from "@/server/content-translation/google-translate";
import { contentThumbnailPath, readContentThumbnail } from "./stored-thumbnail";
import type { ContentDependencies } from "./routes";

export function createContentDependencies(): ContentDependencies {
  const deps = createFanpageDependencies(), env = loadServerEnv();
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000) }) },
  });
  return { ...deps, translate: translateText, translateTexts,
    async upload(owner, slug, bytes) {
      const image = await normalizePublicImage(bytes);
      const thumbnail = await createContentThumbnail(image.bytes);
      const reserved = z.object({ id: z.uuid(), storagePath: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/) }).strict().parse(await deps.rpc("reserve_content_asset", {
        p_app_user_id: owner, p_slug: slug, p_byte_size: image.bytes.byteLength, p_width: image.width, p_height: image.height, p_sha256: image.sha256,
      }));
      try {
        const { error } = await db.storage.from("fan-content-assets").upload(reserved.storagePath, image.bytes, { contentType: "image/webp", cacheControl: "0", upsert: false });
        if (error) throw new Error("FAN_WEB_UNAVAILABLE");
        const variant = await db.storage.from("fan-content-assets").upload(contentThumbnailPath(reserved.storagePath), thumbnail, { contentType: "image/webp", cacheControl: "0", upsert: false });
        if (variant.error) throw new Error("FAN_WEB_UNAVAILABLE");
        await deps.rpc("finish_content_asset_upload", { p_app_user_id: owner, p_asset_id: reserved.id });
      } catch (error) {
        // Cleanup is allowed after account disable; the durable reservation exists before upload.
        await deps.rpc("abandon_content_asset_upload", { p_app_user_id: owner, p_asset_id: reserved.id });
        throw error;
      }
      return { id: reserved.id, width: image.width, height: image.height };
    },
    async download(path, thumbnail = false) {
      if (thumbnail) return readContentThumbnail(db, path);
      const { data, error } = await db.storage.from("fan-content-assets").download(path);
      if (error || !data) throw new Error("FAN_WEB_UNAVAILABLE");
      return data;
    },
  };
}
