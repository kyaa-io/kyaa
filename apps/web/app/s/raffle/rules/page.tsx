import { redirect } from 'next/navigation';
import { parseAppLocale } from '@/i18n/locales';

export default async function RulesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach(item => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  params.set('locale', parseAppLocale(query.locale, 'en'));
  redirect(`/s/raffle?${params}#rules`);
}
