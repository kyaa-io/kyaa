import { APP_LOCALES, type AppLocale } from '@/i18n/locales';

/** Synthetic stand-in for celebrity_localizations (content locales ko and en only). The second page has no en row on purpose, so the fallback order is visible. */
const fanPageNames: Record<string, { ko: string; en?: string }> = {
  nchive: { ko: '엔카이브 팬페이지', en: 'NCHIVE fan page' },
  elina: { ko: '엘리나' },
};

/** Same order as public.group_page_name: requested content locale, en, stored ko name. */
export function fanPageName(slug: string, locale: AppLocale, stored: string) {
  const row = fanPageNames[slug];
  if (!row) return stored;
  return (locale === 'ko' ? row.ko : row.en) ?? row.en ?? row.ko ?? stored;
}

type Page = { kind?: string; celebrityId?: string | null; slug?: string | null; name?: string };
const localized = (page: Page, locale: AppLocale): Page => page.kind === 'fan' && page.celebrityId && page.slug ? { ...page, name: fanPageName(page.slug, locale, page.name ?? '') } : page;

/** Rewrites names on the read paths that carry ?locale=, the way the server does. Other paths and requests without a locale pass through. */
export function withGroupNameLocale(base: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await base(input, init);
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
    const requested = url.searchParams.get('locale');
    if ((init?.method ?? 'GET').toUpperCase() !== 'GET' || !response.ok || !requested || !(APP_LOCALES as readonly string[]).includes(requested)) return response;
    if (!/^\/api\/groups(?:\/resolve\/[^/]+|\/[0-9a-f-]{36})?$/i.test(url.pathname)) return response;
    const locale = requested as AppLocale;
    const body: unknown = await response.clone().json().catch(() => null);
    if (typeof body !== 'object' || body === null) return response;
    const value = body as { items?: Page[]; page?: Page };
    if (Array.isArray(value.items)) value.items = value.items.map(item => localized(item, locale));
    if (value.page) value.page = localized(value.page, locale);
    return Response.json(value, { status: response.status });
  }) as typeof fetch;
}
