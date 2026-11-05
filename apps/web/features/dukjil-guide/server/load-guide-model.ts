import "server-only";

import { dukjilCatalogResponseSchema } from "@/features/passport/domain/dukjil-types";
import { createDukjilRouteHandlers } from "@/server/dukjil/dependencies";
import { buildGuideModel, type GuideModel } from "../domain/guide-model";

/** Reads the same catalog the public /api/dukjil/catalog route serves. A failed read renders the empty guide, never stale numbers. */
export async function loadGuideModel(locale: string): Promise<GuideModel> {
  try {
    const response = await createDukjilRouteHandlers().catalog(new Request(`http://localhost/api/dukjil/catalog?locale=${encodeURIComponent(locale)}`));
    if (!response.ok) return null;
    const parsed = dukjilCatalogResponseSchema.safeParse(await response.json());
    return parsed.success ? buildGuideModel(parsed.data) : null;
  } catch {
    return null;
  }
}
