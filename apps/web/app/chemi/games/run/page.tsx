import { notFound } from "next/navigation";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import { parseAppLocale } from "@/i18n/locales";
import { RunScreen } from "./screen";

export const dynamic = "force-dynamic";

export default async function RunPage({ searchParams }: {
  searchParams: Promise<{ locale?: string; share?: string }>;
}) {
  if (!chemiEnabled()) notFound();
  const { locale, share } = await searchParams;
  return <RunScreen locale={parseAppLocale(locale)} share={share ?? null} />;
}
