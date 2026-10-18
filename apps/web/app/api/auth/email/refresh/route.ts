import { createEmailAuthHandler } from "@/server/auth/email/email-route";
export const dynamic = "force-dynamic";
export const POST = createEmailAuthHandler("refresh");
