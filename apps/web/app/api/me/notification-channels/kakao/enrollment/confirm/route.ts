import { kakaoRegistrationDisabledResponse } from "@/server/notification/kakao-delivery-control";
import { createKakaoEnrollmentDependencies } from "@/server/notification/kakao-enrollment-dependencies";
import { createConfirmKakaoEnrollmentHandler } from "@/server/notification/kakao-enrollment-route";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const disabled = await kakaoRegistrationDisabledResponse();
  if (disabled) return disabled;
 return createConfirmKakaoEnrollmentHandler(createKakaoEnrollmentDependencies())(request); }
