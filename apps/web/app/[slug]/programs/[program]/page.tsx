import { WaveAccessBoundary } from "@/features/fanpage/ui/wave-access-boundary";
import { notFound } from "next/navigation";
import { parseAppLocale } from "@/i18n/locales";
import { loadSeoCreator } from "@/server/seo/public-content";
import { WAVE_FANPAGE_SLUG, waveProgramKeySchema } from "@/features/fanpage/domain/wave-programs";
import { WaveProgramPage } from "@/features/fanpage/ui/wave-programs";

export const dynamic = "force-dynamic";
export default async function ProgramPage({ params, searchParams }: { params: Promise<{ slug: string; program: string }>; searchParams: Promise<{ locale?: string }> }) {
  const { slug, program } = await params;
  const parsed = waveProgramKeySchema.safeParse(program);
  if (slug !== WAVE_FANPAGE_SLUG || !parsed.success) notFound();
  const locale = parseAppLocale((await searchParams).locale);
  const creator = await loadSeoCreator(slug, locale);
  if (!creator?.roles.includes("brand")) notFound();
  return <WaveAccessBoundary locale={locale}><WaveProgramPage key={parsed.data} program={parsed.data} locale={locale} /></WaveAccessBoundary>;
}
