import { EventParticipantsManager } from "@/components/admin/event-participants-manager";
import { NO_INDEX } from "@/seo/metadata";

export const metadata = { title: "이벤트 참여자 | kyaa Admin", robots: NO_INDEX };

export default async function Page({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = (await searchParams).lang === "en" ? "en" : "ko";
  return <EventParticipantsManager locale={locale} />;
}
