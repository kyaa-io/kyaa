import { reminderRoute } from "@/server/chemi-mail/reminders";

export const dynamic = "force-dynamic";
export const POST = (request: Request) => reminderRoute(request, true);
export const DELETE = (request: Request) => reminderRoute(request, false);
