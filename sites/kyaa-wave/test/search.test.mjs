import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, existsSync} from 'node:fs';
const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
execFileSync(process.execPath, ['build.mjs'], {cwd:root});

test('both language URLs serve complete, self-canonical HTML without JavaScript', () => {
 const copy=JSON.parse(read('content.json'));
 for (const [lang,file,url,index] of [['ko','index.html','https://kyaawave.com/',0],['en','en/index.html','https://kyaawave.com/en/',1]]) {
  const html=read(`dist/${file}`);
  assert.match(html,new RegExp(`<html lang="${lang}">`));
  assert.ok(html.includes(copy.heroTitle[index]));
  assert.ok(html.includes(copy.aboutCopy[index]));
  assert.ok(html.includes(copy.eventNote[index]));
  assert.ok(html.includes(`<link rel="canonical" href="${url}">`));
  assert.ok(html.includes('<link rel="alternate" hreflang="ko" href="https://kyaawave.com/">'));
  assert.ok(html.includes('<link rel="alternate" hreflang="en" href="https://kyaawave.com/en/">'));
  assert.ok(html.includes('<link rel="alternate" hreflang="x-default" href="https://kyaawave.com/">'));
  assert.match(html,/<a href="\/en\/" lang="en"/);
  assert.ok(html.includes('name="naver-site-verification"'));
  assert.ok(html.includes('name="msvalidate.01"'));
  assert.match(html,/<meta name="robots" content="index, follow, max-image-preview:large">/);
  assert.equal((html.match(/<h1\b/g)||[]).length,1);
  assert.ok(!html.includes('salon.webp'));
  const graph=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])['@graph'];
  assert.equal(graph.find(node=>node['@type']==='WebPage').url,url);
  assert.equal(graph.find(node=>node['@type']==='WebPage').inLanguage,lang);
  assert.equal(graph.find(node=>node['@type']==='WebSite').name,'kyaa wave');
  assert.ok(!graph.some(node=>['FAQPage','Event','AggregateRating'].includes(node['@type'])));
  for (const key of ['og:locale','og:site_name','og:image:width','og:image:height','og:image:type','twitter:title','twitter:description','twitter:image','twitter:image:alt']) assert.ok(html.includes(`="${key}"`),key);
 }
});

test('sitemap exposes both canonical language pages and crawl assets exist', () => {
 const xml=read('dist/sitemap.xml');
 assert.equal((xml.match(/<loc>/g)||[]).length,2);
 assert.ok(xml.includes('<loc>https://kyaawave.com/en/</loc>'));
 assert.match(read('dist/robots.txt'),/Sitemap: https:\/\/kyaawave.com\/sitemap.xml/);
 assert.ok(!read('dist/robots.txt').includes('Disallow: /'));
 for (const path of ['assets/og-kyaa-wave-dhl-20261019.jpg','assets/icon-192.png','assets/icon-512.png','assets/apple-touch-icon.png','favicon.ico']) assert.ok(existsSync(new URL(`dist/${path}`,root)),path);
});

test('legacy language queries redirect on the server and unknown paths stay 404', () => {
 const config=JSON.parse(read('vercel.json'));
 assert.ok(config.redirects.some(item=>item.source==='/' && item.destination==='/en/' && item.has?.some(rule=>rule.type==='query' && rule.key==='lang' && rule.value==='en')));
 assert.ok(config.redirects.some(item=>item.source==='/en/' && item.destination==='/' && item.has?.some(rule=>rule.type==='query' && rule.key==='lang' && rule.value==='ko')));
 assert.ok(!config.rewrites.some(item=>item.source==='/(.*)'));
});


test('real DHL photographs replace generated scenes in both languages and sharing metadata', () => {
 for (const [file,alt] of [['index.html','드래곤힐로지 호텔 야경'],['en/index.html','Dragon Hill Lodge exterior at night']]) {
  const html=read(`dist/${file}`);
  assert.match(html,/class="hero-photo" src="\/assets\/dhl-exterior-night-20261019.webp"/);
  assert.match(html,/class="venue" src="\/assets\/dhl-naija-ballroom-20261019.webp"/);
  assert.ok(html.includes(`alt="${alt}"`));
  assert.doesNotMatch(html,/community-ai|gathering-ai|AI-generated|AI로 표현/);
  assert.equal((html.match(/https:\/\/kyaawave.com\/assets\/og-kyaa-wave-dhl-20261019.jpg/g)||[]).length,3);
 }
 for (const asset of ['dhl-exterior-night-20261019.webp','dhl-naija-ballroom-20261019.webp']) assert.ok(existsSync(new URL(`dist/assets/${asset}`,root)));
});
