import { expect, it } from 'vitest';
import { APP_LOCALES } from '@/i18n/locales';
import { homeBannerSchema, localizedBannerHref } from './home-banner';
import { signupRaffleHomeBanner } from './signup-raffle-home-banner';
it('provides registrable responsive data and preserves campaign attribution in every locale', () => {
  for (const locale of APP_LOCALES) {
    const banner = homeBannerSchema.parse(signupRaffleHomeBanner(locale));
    const href = new URL(localizedBannerHref(banner.href, locale), 'https://kyaa.io');
    expect(href.pathname).toBe('/s/raffle');
    expect(href.searchParams.get('utm_campaign')).toBe('signup_raffle');
    expect(href.searchParams.get('locale')).toBe(locale);
    expect(banner.description).toContain('US$400');
    expect(banner.mobileImage?.width).toBe(390);
  }
});
