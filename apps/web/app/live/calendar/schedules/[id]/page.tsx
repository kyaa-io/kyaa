import { ScheduleDetail } from "@/features/schedules/ui/schedule-detail";
import { scheduleSchema, uuid } from "@/features/schedules/domain/participation";
import { parseAppLocale, toContentLocale } from "@/i18n/locales";
import { createFanpageDependencies } from "@/server/fanpage/dependencies";
import { serializeStructuredData } from "@/seo/structured-data";
import { notFound } from "next/navigation";

export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const locale = parseAppLocale((await searchParams).locale);
  const raw = await createFanpageDependencies().rpc("fan_web_get_schedule", {
    p_schedule_id: id, p_locale: toContentLocale(locale), p_app_user_id: null,
  });
  if (raw === null) notFound();
  const schedule = scheduleSchema.parse(raw);
  const event = schedule.kind === "concert" && {
    "@context": "https://schema.org", "@type": "Event", name: schedule.title,
    startDate: schedule.startsAt, endDate: schedule.endsAt, description: schedule.description,
    location: schedule.location || undefined,
    eventStatus: schedule.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
  };
  return <>
    {event && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(event) }} />}
    <ScheduleDetail id={id} locale={locale} />
  </>;
}
