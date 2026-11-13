import { describe, expect, it } from 'vitest';
import { homeBannerSchema, localizedBannerHref } from './home-banner';
import { xMissionHomeBanner } from './x-mission-home-banner';
describe('X mission home banner', () => {
  it.each(['ko', 'en'] as const)('provides valid %s copy and localized mission destination', locale => {
    const banner = homeBannerSchema.parse(xMissionHomeBanner(locale));
    expect(localizedBannerHref(banner.href, locale)).toBe(`/s/x?locale=${locale}`);
    expect(banner.description).toContain('Google');
    expect(banner.category).toBe('event');
  });
});
