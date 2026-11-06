import { redirect } from "next/navigation";
import { parseAppLocale } from "@/i18n/locales";
// New fan page applications all go through group_applications and /admin/groups.
export default async function Page({ searchParams }: { searchParams: Promise<{ locale?: string; name?: string }> }) {
  const query = await searchParams, params = new URLSearchParams({ kind: "fan", locale: parseAppLocale(query.locale) }), name = query.name?.trim().slice(0, 100);
  if (name) params.set("name", name);
  redirect(`/pages/groups/apply?${params}`);
}
