import { emailUnsubscribeDependencies } from "@/server/notification/email-unsubscribe-dependencies";
import { createEmailUnsubscribeGetHandler, createEmailUnsubscribePostHandler } from "@/server/notification/email-unsubscribe-route";

export const dynamic = "force-dynamic";

export const GET = createEmailUnsubscribeGetHandler();
export const POST = createEmailUnsubscribePostHandler(emailUnsubscribeDependencies);
