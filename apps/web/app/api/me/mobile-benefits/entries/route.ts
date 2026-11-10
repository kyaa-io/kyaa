import { luckyDrawPreviewRejection } from "@/features/benefit/lucky-draw-entry";
import { createMobileBenefitsRouteHandlers, mobileBenefitsUnavailable } from "@/server/mobile-benefits/dependencies";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { const preview = luckyDrawPreviewRejection(); if (preview) return preview; try { return await createMobileBenefitsRouteHandlers().enter(request); } catch { return mobileBenefitsUnavailable(); } }
