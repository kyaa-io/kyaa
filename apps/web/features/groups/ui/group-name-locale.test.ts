import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { groupRequestPath, withNameLocale } from './use-group-resource';
import { creatorHomeCardCopy } from './creator-home-card-copy';
import { APP_LOCALES } from '@/i18n/locales';

const id = '9a1b2c3d-0000-4000-8000-000000000001';
describe('page name language on reads', () => {
  it('adds the page language to name-reading GETs and keeps other queries', () => {
    expect(withNameLocale('/api/groups?type=fan', undefined, 'ja')).toBe('/api/groups?type=fan&locale=ja');
    expect(withNameLocale('/api/groups/resolve/nchive', undefined, 'ru')).toBe('/api/groups/resolve/nchive?locale=ru');
    expect(withNameLocale(`/api/groups/${id}`, { method: 'GET' }, 'en')).toBe(`/api/groups/${id}?locale=en`);
  });
  it('leaves writes, other paths and explicit locales alone', () => {
    expect(withNameLocale(`/api/groups/${id}`, { method: 'POST' }, 'ja')).toBe(`/api/groups/${id}`);
    expect(withNameLocale(`/api/groups/${id}/members`, undefined, 'ja')).toBe(`/api/groups/${id}/members`);
    expect(withNameLocale('/api/groups?locale=ko', undefined, 'ja')).toBe('/api/groups?locale=ko');
  });
});

describe('management detail keeps the stored page name', () => {
  it('sends no locale for the management detail request but does for the normal detail request', () => {
    expect(groupRequestPath(`/api/groups/${id}`, undefined, 'ja')).toBe(`/api/groups/${id}?locale=ja`);
    expect(groupRequestPath(`/api/groups/${id}`, undefined, 'ja', false)).toBe(`/api/groups/${id}`);
    expect(groupRequestPath(`/api/groups/${id}`, undefined, 'ru', false)).not.toContain('locale');
  });
  it('management screen reads detail with nameLocale:false, and the settings form saves that same value', () => {
    const screen = readFileSync(join(__dirname, 'group-manage-screen.tsx'), 'utf8');
    expect(screen).toContain('useGroupResource(`/api/groups/${pageId}`,parse,{nameLocale:false})');
    const settings = readFileSync(join(__dirname, 'group-settings-panel.tsx'), 'utf8');
    expect(settings).toContain('defaultValue={detail.page.name}');
  });
  it('group detail screen drops the locale when it shows the manage tab', () => {
    const detail = readFileSync(join(__dirname, 'group-detail.tsx'), 'utf8');
    const provider = readFileSync(join(__dirname, 'group-page-context.tsx'), 'utf8');
    expect(provider).toContain("useGroupResource(url, parseDetail, { nameLocale: queryTab !== \"manage\" })");
    expect(detail).toContain("tab==='manage'&&detail.membership");
  });
});

describe('creator home card copy', () => {
  it('has a native string for every locale, not the English fallback', () => {
    const en = creatorHomeCardCopy('en');
    for (const locale of APP_LOCALES) {
      const card = creatorHomeCardCopy(locale);
      expect(Object.values(card).every(Boolean)).toBe(true);
      if (locale !== 'en') for (const key of Object.keys(en) as (keyof typeof en)[]) expect(card[key]).not.toBe(en[key]);
    }
  });
});
