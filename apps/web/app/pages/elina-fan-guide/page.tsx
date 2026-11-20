import { permanentRedirectTo } from "@/lib/navigation/untyped";
import { parseAppLocale } from "@/i18n/locales";
import { elinaRafflesHref } from "@/features/live/domain/elina-event";

type Props = { searchParams: Promise<{ locale?: string | string[] }> };

export default async function Page({ searchParams }: Props) {
  permanentRedirectTo(elinaRafflesHref(parseAppLocale((await searchParams).locale)));
}
