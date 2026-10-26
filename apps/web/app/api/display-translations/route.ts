import { loadServerEnv } from "@/server/config/env";
import { isAwsHosting } from "@/server/config/hosting";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { createDisplayTranslationHandler } from "@/server/content-translation/display-route";
import { translateTexts } from "@/server/content-translation/google-translate";
import { requestHashSecret } from "@/server/inquiries/fanmeeting-route";
import { withWaveAccess } from "@/server/wave/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const env = loadServerEnv();
  return createDisplayTranslationHandler({ ...createFanpageDependencies(), translate: translateTexts,
    secret: requestHashSecret(env), appOrigin: env.NEXT_PUBLIC_APP_URL, aws: isAwsHosting(),
    vercel: process.env.VERCEL === "1", localDevelopment: process.env.NODE_ENV === "development" })(request);
}
export const POST = withWaveAccess(handle);
