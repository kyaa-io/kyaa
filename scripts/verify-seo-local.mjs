import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const origin = process.env.SEO_TEST_ORIGIN || 'http://localhost:3108';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Local verification only');
const output = process.env.SEO_TEST_OUTPUT_DIR
  ? pathToFileURL(`${resolve(process.env.SEO_TEST_OUTPUT_DIR)}/`)
  : new URL('../work/kyaa-seo-20261018/', import.meta.url);
const localeSource = await readFile(new URL('../apps/web/i18n/locales.ts', import.meta.url), 'utf8');
const locales = JSON.parse(localeSource.match(/export const APP_LOCALES = (\[[^;]+?\]) as const;/)?.[1] ?? 'null');
assert.equal(locales?.length, 11, 'APP_LOCALES contract');
const ogLocales = { ko: 'ko_KR', en: 'en_US', ja: 'ja_JP', 'zh-Hans': 'zh_CN', 'zh-Hant': 'zh_TW', es: 'es_ES', id: 'id_ID', vi: 'vi_VN', th: 'th_TH', pt: 'pt_PT', fr: 'fr_FR' };
const request = (path, options = {}) => fetch(new URL(path, origin), { redirect: 'manual', ...options });
await mkdir(output, { recursive: true });
const report = { origin, pages: [], redirects: [], crawlers: [], private: [], raffles: [], images: [], sitemapUrls: 0 };
const agent = 'kakaotalk-scrap/1.0';
const sitemap = await request('/sitemap.xml');
assert.equal(sitemap.status, 200);
const xml = await sitemap.text();
const sitemapDoc = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
const urls = [...sitemapDoc.querySelectorAll('url > loc')].map((node) => node.textContent);
assert(urls.length >= locales.length * 9);
assert.equal(new Set(urls).size, urls.length);
const pathLocales = new Map();
for (const value of urls) {
  const url = new URL(value);
  assert.equal(url.origin, 'https://kyaa.io');
  assert(locales.includes(url.searchParams.get('locale')), value);
  assert.equal([...url.searchParams].length, 1, value);
  assert(!url.hash, value);
  assert(!/(?:^|[/-])(?:rehearsal|test|demo)(?:[/-]|$)|^\/(?:my|admin|verify|passports|stamps|settings|notifications|onboarding|login|creator|connect|s)(?:\/|$)|^\/c\/[^/]+\/(?:verify|tickets)|^\/live\/[^/]+\/(?:missions|survey)/.test(url.pathname), value);
  const available = pathLocales.get(url.pathname) ?? [];
  available.push(url.searchParams.get('locale'));
  pathLocales.set(url.pathname, available);
}
report.sitemapUrls = urls.length;
await writeFile(new URL('sitemap.xml', output), xml);
const staticPaths = ['/', '/live', '/celebrities', '/community', '/guide', '/pages/us-fanmeetings', '/pages/creator-onboarding', '/pages/partners', '/pages/onchain'];
for (const path of staticPaths) assert.deepEqual([...(pathLocales.get(path) ?? [])].sort(), [...locales].sort(), path);
const livePath = [...pathLocales.keys()].find((path) => path.startsWith('/live/'));
const creatorPath = [...pathLocales.keys()].find((path) => !staticPaths.includes(path) && !path.startsWith('/live/'));
assert(livePath, 'Sitemap must contain a published public LIVE for SSR verification');
assert(creatorPath, 'Sitemap must contain a published creator');
const paths = [...staticPaths, creatorPath, livePath];
for (const path of paths) {
  const availableLocales = pathLocales.get(path);
  const requestedLocales = [...availableLocales, ...(!staticPaths.includes(path) && availableLocales.includes('en') ? ['ja'] : [])];
  for (const locale of requestedLocales) {
    const seoLocale = !staticPaths.includes(path) && locale === 'ja' ? 'en' : locale;
    const response = await request(`${path}?locale=${locale}&utm_source=seo-check`, { headers: { 'user-agent': agent } });
    assert.equal(response.status, 200, `${path} ${locale}`);
    const html = await response.text();
    const doc = new JSDOM(html).window.document;
    const meta = (key) => doc.head.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.content;
    const canonical = doc.head.querySelector('link[rel="canonical"]')?.href;
    assert.equal(canonical, `https://kyaa.io${path}?locale=${seoLocale}`);
    assert.equal(meta('og:url'), canonical);
    assert.equal(meta('og:type'), 'website');
    assert.equal(meta('og:site_name'), 'kyaa');
    assert.equal(meta('twitter:card'), 'summary_large_image');
    assert.equal(meta('og:locale'), ogLocales[seoLocale]);
    assert.equal(doc.documentElement.lang, locale);
    assert(meta('description'));
    assert(meta('og:image'));
    assert.equal(meta('twitter:image'), meta('og:image'));
    assert(meta('og:image:alt'));
    assert(!meta('robots')?.includes('noindex'));
    if (path === '/' || path === '/guide') {
      const schemas = [...doc.querySelectorAll('script[type="application/ld+json"]')].map((node) => JSON.parse(node.textContent));
      if (path === '/') assert(schemas.some((schema) => schema['@graph']?.some((entity) => entity['@type'] === 'WebSite')));
      if (path === '/guide') {
        const faq = schemas.find((schema) => schema['@type'] === 'FAQPage');
        assert.equal(faq?.mainEntity.length, 6);
        for (const question of faq.mainEntity) {
          assert(doc.body.textContent.includes(question.name));
          assert(doc.body.textContent.includes(question.acceptedAnswer.text));
        }
      }
    }
    for (const other of availableLocales) assert.equal(doc.head.querySelector(`link[hreflang="${other}"]`)?.href, `https://kyaa.io${path}?locale=${other}`);
    assert.equal(doc.head.querySelectorAll('link[hreflang]').length, availableLocales.length);
    if (path.startsWith('/live/')) {
      assert(doc.querySelector('h1')?.textContent?.trim(), 'LIVE title must be in initial HTML');
      assert(doc.body.textContent.includes('KST'), 'LIVE timezone must be in initial HTML');
    }
    report.pages.push({ path, locale, title: doc.title, canonical, image: meta('og:image') });
    if (locale === 'ko' && ['/', livePath].includes(path)) {
      const localImage = new URL(meta('og:image'));
      assert.equal(localImage.origin, 'https://kyaa.io');
      const imageResponse = await request(`${localImage.pathname}${localImage.search}`);
      assert.equal(imageResponse.status, 200);
      const bytes = Buffer.from(await imageResponse.arrayBuffer());
      const info = await sharp(bytes).metadata();
      assert(info.width <= 1200);
      assert(bytes.length < 1024 * 1024, 'Share image should be under 1 MiB');
      const name = path === '/' ? 'default-share.png' : `live-share.${info.format}`;
      await writeFile(new URL(name, output), bytes);
      report.images.push({ name, bytes: bytes.length, width: info.width, height: info.height, format: info.format });
    }
  }
}
// Follow real catalog links; draft teasers may intentionally lead to a 404.
for (const creator of [...new Set([creatorPath, '/elina'])]) {
  const catalogPath = `/c${creator}/raffles`;
  let detailPath;
  for (const locale of ['ko', 'en']) {
    const response = await request(`${catalogPath}?locale=${locale}`, { headers: { 'user-agent': agent } });
    if (response.status === 404) continue;
    assert.equal(response.status, 200);
    const doc = new JSDOM(await response.text()).window.document;
    assert.equal(doc.head.querySelector('link[rel="canonical"]')?.href, `https://kyaa.io${catalogPath}?locale=${locale}`);
    assert(doc.querySelector('h1')?.textContent.trim());
    detailPath ??= [...doc.querySelectorAll('a[href]')].map(node => new URL(node.href, origin).pathname)
      .find(path => path.startsWith(`${catalogPath}/`) && /^\/c\/[^/]+\/raffles\/[0-9a-f-]{36}$/.test(path));
    report.raffles.push({ path: catalogPath, locale, status: 200 });
  }
  if (!detailPath) continue;
  for (const locale of ['ko', 'en', 'ja']) {
    const response = await request(`${detailPath}?locale=${locale}`, { headers: { 'user-agent': agent } });
    const doc = new JSDOM(await response.text()).window.document;
    if (response.status === 404) {
      assert(doc.querySelector('meta[name="robots"]')?.content.includes('noindex'));
    } else {
      assert.equal(response.status, 200);
      const seoLocale = locale === 'ja' ? 'en' : locale;
      assert.equal(doc.head.querySelector('link[rel="canonical"]')?.href, `https://kyaa.io${detailPath}?locale=${seoLocale}`);
      assert(doc.title.includes(' | '));
      assert(doc.head.querySelector('meta[property="og:image"]')?.content);
      assert(doc.head.querySelector('meta[property="og:description"]')?.content);
      assert(doc.querySelector('h1')?.textContent.trim());
    }
    report.raffles.push({ path: detailPath, locale, status: response.status });
  }
}
for (const userAgent of ['facebookexternalhit/1.1', 'Twitterbot', 'TelegramBot', 'Yeti', 'Daumoa', 'Googlebot', 'Bingbot', 'OAI-SearchBot', 'PerplexityBot', 'Claude-SearchBot']) {
  const response = await request('/?locale=ko', { headers: { 'user-agent': userAgent } });
  assert.equal(response.status, 200);
  const doc = new JSDOM(await response.text()).window.document;
  assert(doc.head.querySelector('meta[property="og:image"]'), userAgent);
  assert.equal(doc.head.querySelector('link[rel="canonical"]')?.href, 'https://kyaa.io/?locale=ko', userAgent);
  assert(doc.head.querySelector('meta[name="description"]')?.content, userAgent);
  report.crawlers.push(userAgent);
}
const robots = await request('/robots.txt');
assert.equal(robots.status, 200);
assert(robots.headers.get('content-type').includes('text/plain'));
assert((await robots.text()).includes('Sitemap: https://kyaa.io/sitemap.xml'));
for (const [path, destination, status] of [
  ['/pages/ifew-fan-guide', '/live/ifew-100-days-tiktok-20260912', 307],
  ['/pages/elina-fan-guide', '/c/elina/raffles', 308],
]) {
  for (const locale of locales) {
    const response = await request(`${path}?locale=${locale}`, { headers: { 'user-agent': agent } });
    assert.equal(response.status, status, `${path} ${locale}`);
    const location = new URL(response.headers.get('location'), origin);
    assert.equal(location.pathname, destination);
    assert.equal(location.search, `?locale=${locale}`);
    assert([new URL(origin).origin, 'https://kyaa.io'].includes(location.origin));
    report.redirects.push({ path, locale, destination: location.pathname, status });
  }
}
const creatorDetailPath = creatorPath.startsWith('/c/') ? creatorPath : `/c${creatorPath}`;
for (const path of ['/my', '/admin', '/passports', '/settings', '/notifications', '/stamps/seo-check', '/onboarding/profile', '/login', '/creator/instagram', '/connect', '/s/seo-check', `${creatorDetailPath}/verify`, `${creatorDetailPath}/tickets`, `${livePath}/missions`, `${livePath}/survey`, '/live/nonexistent-seo-check-rehearsal']) {
  const response = await request(`${path}?locale=ko&lang=ko`, { headers: { 'user-agent': agent } });
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  const document = new JSDOM(await response.text()).window.document;
  if (response.status === 200 || response.status === 404) assert(document.querySelector('meta[name="robots"]')?.content.includes('noindex'), path);
  else assert([307, 308].includes(response.status), `${path}: unexpected private response ${response.status}`);
  report.private.push({ path, status: response.status, noindex: true });
}
for (const path of ['/api/me/rewards', '/api/admin/session', '/api/passports']) {
  const response = await request(path);
  assert.equal(response.status, 401, `Unauthenticated ${path}`);
}
for (const path of ['/live/nonexistent-seo-check', '/nonexistent-seo-check']) {
  const response = await request(`${path}?locale=ko&lang=ko`, { headers: { 'user-agent': agent } });
  assert.equal(response.status, 404, path);
}
await writeFile(new URL('verification.json', output), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
