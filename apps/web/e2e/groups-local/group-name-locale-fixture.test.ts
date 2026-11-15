import { describe, expect, it } from 'vitest';
import { fanPageName, withGroupNameLocale } from './group-name-locale-fixture';

const page = (slug: string, name: string) => ({ id: slug, kind: 'fan', celebrityId: slug, slug, name });
const base = (async () => Response.json({ items: [page('nchive', '엔카이브 팬페이지'), page('elina', '엘리나 팬페이지'), { id: 'h', kind: 'hobby', celebrityId: null, slug: null, name: '한강 러닝 크루' }], page: page('nchive', '엔카이브 팬페이지') })) as typeof fetch;
const names = async (path: string) => { const body = await (await withGroupNameLocale(base)(path)).json() as { items: { name: string }[] }; return body.items.map(item => item.name); };

describe('group name locale fixture', () => {
  it('chooses requested locale, then en, then the stored name', () => {
    expect(fanPageName('nchive', 'ko', 'x')).toBe('엔카이브 팬페이지');
    for (const locale of ['en', 'ja', 'ru'] as const) expect(fanPageName('nchive', locale, 'x')).toBe('NCHIVE fan page');
    expect(fanPageName('elina', 'ru', 'x')).toBe('엘리나 팬페이지');
    expect(fanPageName('unknown', 'ru', 'stored')).toBe('stored');
  });
  it('rewrites fan pages only, and only when the request carries a locale', async () => {
    expect(await names('/api/groups?locale=ja')).toEqual(['NCHIVE fan page', '엘리나 팬페이지', '한강 러닝 크루']);
    expect(await names('/api/groups?locale=ko')).toEqual(['엔카이브 팬페이지', '엘리나 팬페이지', '한강 러닝 크루']);
    expect(await names('/api/groups')).toEqual(['엔카이브 팬페이지', '엘리나 팬페이지', '한강 러닝 크루']);
  });
});
