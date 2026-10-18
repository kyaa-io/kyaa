import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://kyaa.io';
const LOCALES = new Set(['ko','en','ja','zh-Hans','zh-Hant','es','id','vi','th','pt','fr']);
const PRIVATE = /^\/(?:api|admin|my|passports|stamps|settings|notifications|onboarding|login|creator|connect|s)(?:\/|$)|^\/c\/[^/]+\/(?:verify|tickets)(?:\/|$)|^\/live\/[^/]+\/(?:missions|survey)(?:\/|$)/;
const decode = (value) => value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[a-f0-9]+);/gi, (entity) => {
  const named = { '&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>' };
  return named[entity] ?? String.fromCodePoint(entity.startsWith('&#x') ? parseInt(entity.slice(3,-1),16) : Number(entity.slice(2,-1)));
});
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map(([,name,double,single,bare]) => [name.toLowerCase(),decode(double ?? single ?? bare)]));
}
export function extractHead(html) {
  const source = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? '';
  const head = { title: decode(source.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '') };
  for (const tag of source.match(/<(?:meta|link)\b[^>]*>/gi) ?? []) {
    const attr = attributes(tag);
    if (/^<meta/i.test(tag) && (attr.name || attr.property)) head[attr.name ?? attr.property] = attr.content;
    if (/^<link/i.test(tag) && attr.rel === 'canonical') head.canonical = attr.href;
  }
  return head;
}
export function parsePublicSitemap(xml) {
  const urls = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/g)].map(([,url]) => decode(url.trim()));
  assert(urls.length > 0 && urls.length <= 10_000, 'SITEMAP_COUNT_INVALID');
  assert.equal(new Set(urls).size, urls.length, 'SITEMAP_DUPLICATE');
  for (const address of urls) {
    const url = new URL(address);
    assert(url.origin === SITE && !url.username && !url.password && !url.hash && !PRIVATE.test(url.pathname), 'SITEMAP_PUBLIC_URL_INVALID');
    assert(!/(?:^|[/-])(?:rehearsal|test|demo)(?:[/-]|$)/i.test(url.pathname), 'SITEMAP_REHEARSAL');
    assert(LOCALES.has(url.searchParams.get('locale')) && [...url.searchParams].length === 1, 'SITEMAP_QUERY_INVALID');
    assert.equal(address, `${SITE}${url.pathname}?locale=${url.searchParams.get('locale')}`, 'SITEMAP_CANONICAL_INVALID');
  }
  return urls;
}

export async function verifySearchHealth({ transport = fetch } = {}) {
  const request = async (url) => {
    assert.equal(new URL(url).origin, SITE, 'EXTERNAL_REQUEST_REJECTED');
    return transport(url, { redirect: 'error', headers: { 'user-agent':'Twitterbot/1.0 (kyaa search health)' }, signal: AbortSignal.timeout(10_000) });
  };
  const text = async (path) => {
    const response = await request(new URL(path, SITE).href);
    assert.equal(response.status,200,`HTTP_${new URL(path,SITE).pathname}`);
    const body = await response.text();
    assert(body.length <= 2_000_000, 'RESPONSE_TOO_LARGE');
    return { response, body };
  };
  const { body: robots } = await text('/robots.txt');
  assert(/User-Agent:\s*\*/i.test(robots) && /Allow:\s*\/\s*(?:\n|$)/i.test(robots), 'ROBOTS_PUBLIC_CRAWL_BLOCKED');
  assert(!/^Disallow:\s*\/\s*$/im.test(robots), 'ROBOTS_ALL_BLOCKED');
  assert(robots.includes(`Sitemap: ${SITE}/sitemap.xml`), 'ROBOTS_SITEMAP_MISSING');
  const { body: xml } = await text('/sitemap.xml');
  const urls = parsePublicSitemap(xml);
  const selected = new Map();
  for (const url of urls) {
    const parsed = new URL(url), locale = parsed.searchParams.get('locale');
    if (!['ko','en'].includes(locale)) continue;
    const path = parsed.pathname;
    const kind = path === '/' ? 'home' : /^\/c\/[^/]+\/raffles\/[^/]+$/.test(path) ? 'gift'
      : /^\/c\/[^/]+\/raffles$/.test(path) ? 'raffles' : /^\/live\//.test(path) ? 'live'
      : /^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path) && !['/celebrities','/community','/live','/guide'].includes(path) ? 'creator' : null;
    if (kind && !selected.has(`${kind}:${locale}`)) selected.set(`${kind}:${locale}`, url);
  }
  for (const kind of ['home','creator','live','raffles','gift']) {
    for (const locale of ['ko','en']) assert(selected.has(`${kind}:${locale}`), `SITEMAP_MISSING_${kind}_${locale}`);
  }
  const pages = [], images = new Set();
  for (const [kind,url] of selected) {
    const { response, body } = await text(url);
    assert(!/noindex/i.test(response.headers.get('x-robots-tag') ?? ''), 'PUBLIC_HEADER_NOINDEX');
    const head = extractHead(body);
    assert(head.title && head.description && !/noindex/i.test(head.robots ?? ''), `PUBLIC_META_INVALID_${kind}`);
    assert.equal(head.canonical, url, `CANONICAL_${kind}`);
    assert.equal(head['og:url'], url, `OG_URL_${kind}`);
    assert(head['og:title'] && head['og:description'] && head['og:image'], `OG_META_${kind}`);
    assert.equal(head['twitter:card'], 'summary_large_image', `TWITTER_CARD_${kind}`);
    if (kind.startsWith('home:') || kind.startsWith('gift:')) images.add(head['og:image']);
    pages.push({ kind,url,status:response.status,canonical:head.canonical });
  }
  for (const kind of ['creator','live','gift']) {
    const canonical = selected.get(`${kind}:en`);
    const fallback = canonical.replace('locale=en','locale=ja');
    const { body } = await text(fallback);
    const head = extractHead(body);
    assert.equal(head.canonical,canonical,`FALLBACK_CANONICAL_${kind}`);
    assert.equal(head['og:url'],canonical,`FALLBACK_OG_URL_${kind}`);
    assert.equal(head['og:locale'],'en_US',`FALLBACK_OG_LOCALE_${kind}`);
    pages.push({kind:`${kind}:ja-fallback`,url:fallback,status:200,canonical});
  }
  const imageResults = [];
  for (const image of images) {
    const response = await request(image);
    assert.equal(response.status,200,'OG_IMAGE_HTTP');
    assert(response.headers.get('content-type')?.startsWith('image/'), 'OG_IMAGE_MIME');
    assert.equal(response.headers.get('cross-origin-resource-policy'),'cross-origin','OG_IMAGE_BLOCKED');
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert(bytes.length <= 10_000_000 && bytes.length >= 8, 'OG_IMAGE_SIZE');
    const png = [137,80,78,71,13,10,26,10].every((value,i) => bytes[i] === value);
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = Buffer.from(bytes.subarray(0,4)).toString() === 'RIFF' && Buffer.from(bytes.subarray(8,12)).toString() === 'WEBP';
    assert(png || jpeg || webp, 'OG_IMAGE_CORRUPT');
    imageResults.push({ url:image,bytes:bytes.length,status:response.status });
  }
  const missing = await request(`${SITE}/__search-health-missing__`);
  assert.equal(missing.status,404,'MISSING_PAGE_STATUS');
  assert(/noindex/i.test(extractHead(await missing.text()).robots ?? ''),'MISSING_PAGE_INDEXABLE');
  const privateApi = await request(`${SITE}/api/passports`);
  assert.equal(privateApi.status,401,'PRIVATE_API_EXPOSED');
  return { ok:true,checkedAt:new Date().toISOString(),sitemapUrls:urls.length,pages,images:imageResults,missingPage:404,anonymousPrivateApi:401 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = resolve(process.env.SEARCH_HEALTH_OUTPUT ?? 'work/search-health.json');
  try {
    const report = await verifySearchHealth();
    await mkdir(dirname(output),{recursive:true}); await writeFile(output,JSON.stringify(report,null,2)+'\n');
    console.log(`Search health passed: ${report.sitemapUrls} sitemap URLs, ${report.pages.length} crawler pages, ${report.images.length} images.`);
  } catch (error) {
    await mkdir(dirname(output),{recursive:true});
    await writeFile(output,JSON.stringify({ok:false,checkedAt:new Date().toISOString(),error:error.message},null,2)+'\n');
    console.error(`Search health failed: ${error.message}`); process.exitCode=1;
  }
}
