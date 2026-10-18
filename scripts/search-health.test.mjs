import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractHead, parsePublicSitemap, verifySearchHealth } from './search-health.mjs';

const base = 'https://kyaa.io';
const home = `${base}/?locale=ko`;
const paths = ['/','/elina','/live/public-event','/c/elina/raffles','/c/elina/raffles/fff318a6-24c7-4012-8290-3494a55e287c'];
const urls = paths.flatMap(path => ['ko','en'].map(locale=>`${base}${path}?locale=${locale}`));
const sitemap = `<urlset>${urls.map(url=>`<url><loc>${url}</loc></url>`).join('')}</urlset>`;
const head = (canonical = home) => `<html><head><title>kyaa</title><meta content="Public page" name="description"><meta name="robots" content="index, follow, max-image-preview:large"><meta property="og:locale" content="en_US"><meta property="og:title" content="kyaa"><meta property="og:description" content="Public page"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${base}/share/default.png"><meta name="twitter:card" content="summary_large_image"><link href="${canonical}" rel="canonical"></head></html>`;
function fixture() {
  const calls = [];
  return { calls, transport: async (url, options) => {
    calls.push([url, options]);
    const path = new URL(url).pathname;
    if (path === '/robots.txt') return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${base}/sitemap.xml`);
    if (path === '/sitemap.xml') return new Response(sitemap);
    if (path === '/share/default.png') return new Response(new Uint8Array([137,80,78,71,13,10,26,10,0,0]), { headers: { 'content-type': 'image/png', 'cross-origin-resource-policy': 'cross-origin' } });
    if (path === '/api/passports') return new Response('{}', { status: 401 });
    if (path === '/__search-health-missing__') return new Response('<head><meta name="robots" content="noindex"></head>', { status: 404 });
    return new Response(head(url.replace('locale=ja','locale=en')));
  } };
}
test('head parsing handles reordered attributes, escaped ampersands and single quotes', () => {
  const parsed = extractHead(`<head><meta content='a &amp; b' name='description'><link href='${home}' rel='canonical'></head>`);
  assert.equal(parsed.description, 'a & b'); assert.equal(parsed.canonical, home);
});
test('requires initial metadata inside head rather than streamed body metadata', () => {
  const bodyOnly = '<html><head></head><body>' + head().match(/<head>([\s\S]*)<\/head>/)[1] + '</body></html>';
  assert.equal(extractHead(bodyOnly).canonical, undefined);
  assert.equal(extractHead(bodyOnly).title, '');
});
test('sitemap rejects missing, duplicate, external, private and tracking URLs', () => {
  assert.deepEqual(parsePublicSitemap(sitemap), urls);
  for (const url of ['https://evil.example/?locale=ko',`${base}/admin?locale=ko`,`${home}&email=private`,`${base}/test-person?locale=ko`]) {
    assert.throws(() => parsePublicSitemap(`<loc>${url.replaceAll('&','&amp;')}</loc>`));
  }
  assert.throws(() => parsePublicSitemap('unavailable'));
  assert.throws(() => parsePublicSitemap(`<loc>${home}</loc><loc>${home}</loc>`));
});
test('checks public crawler metadata, real image, missing page and anonymous authorization without credentials', async () => {
  const f = fixture();
  const report = await verifySearchHealth({ transport: f.transport });
  assert.equal(report.ok, true); assert.equal(report.sitemapUrls, 10);
  assert.equal(report.pages.length, 13);
  for (const [url, opts] of f.calls) {
    assert.equal(new URL(url).origin, base); assert.equal(opts.redirect, 'error');
    assert.equal(opts.headers.authorization, undefined);
  }
});
test('does not mistake localized app entry pages for creator fallback pages', async () => {
  const f = fixture();
  const appUrls = ['/fandom','/support'].flatMap(path => ['ko','en','ja'].map(locale => `${base}${path}?locale=${locale}`));
  const report = await verifySearchHealth({ transport: (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/sitemap.xml') return new Response(`<urlset>${[...appUrls,...urls].map(address => `<loc>${address}</loc>`).join('')}</urlset>`);
    if (['/fandom','/support'].includes(path)) return new Response(head(url));
    return f.transport(url, options);
  } });
  assert.equal(report.pages.find(page => page.kind === 'creator:en').url, `${base}/elina?locale=en`);
  assert.equal(report.pages.find(page => page.kind === 'creator:ja-fallback').canonical, `${base}/elina?locale=en`);
});
test('fails on changed noindex, canonical, blocked/corrupt image or public private API', async () => {
  for (const broken of ['noindex','canonical','blocked-image','corrupt-image','private-api','redirect']) {
    const f = fixture();
    const transport = async (url, opts) => {
      const p = new URL(url).pathname;
      if (p === '/' && broken === 'noindex') return new Response(head(url).replace('index, follow', 'noindex, follow'));
      if (p === '/' && broken === 'canonical') return new Response(head(`${base}/?locale=en`));
      if (p === '/share/default.png' && broken === 'blocked-image') return new Response(new Uint8Array([137,80,78,71,13,10,26,10]), { headers: { 'content-type':'image/png','cross-origin-resource-policy':'same-origin' } });
      if (p === '/share/default.png' && broken === 'corrupt-image') return new Response('not image', { headers: { 'content-type':'image/png','cross-origin-resource-policy':'cross-origin' } });
      if (p === '/api/passports' && broken === 'private-api') return new Response('{}');
      if (p === '/sitemap.xml' && broken === 'redirect') return new Response(null, { status:302,headers:{location:'https://evil.example'} });
      return f.transport(url, opts);
    };
    await assert.rejects(() => verifySearchHealth({ transport }), undefined, broken);
  }
});

test('requires every representative public type/language and validates fallback', async () => {
  for(const kind of paths){
    const f=fixture();
    await assert.rejects(()=>verifySearchHealth({transport:(url,opts)=>new URL(url).pathname==='/sitemap.xml'?new Response(`<urlset>${urls.filter(u=>new URL(u).pathname!==kind).map(u=>`<loc>${u}</loc>`).join('')}</urlset>`):f.transport(url,opts)}));
  }
  const f=fixture();
  await assert.rejects(()=>verifySearchHealth({transport:(url,opts)=>url.includes('locale=ja')?new Response(head(url)):f.transport(url,opts)}));
});
