#!/usr/bin/env node
// Builds the celebrity name dictionary from public data that needs no key or account.
//   node scripts/celebrity-names/fetch.mjs <output directory>
// Writes names.ndjson, load.sql and summary.json. Touches no database.
// Licenses, re-checked 2026-11-07:
//   Wikidata structured data: CC0 (https://www.wikidata.org/wiki/Wikidata:Licensing)
//   MusicBrainz core data, including artist names and aliases: CC0 (https://musicbrainz.org/doc/MusicBrainz_Database)
//   MusicBrainz supplementary data is CC BY-NC-SA and lists "search indexes" and tags. So this uses the browse endpoint, not
//   search, and does not request tags, ratings or annotations.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildLoadSql, categoryFor, makeEntry, mergeSources, summarize } from './lib.mjs';

const USER_AGENT = 'kyaa-celebrity-name-directory/1.0 (https://kyaa.io)';
const KOREA = 'Q884', KPOP = 'Q213665';
const KOREA_AREA_MBID = 'b9f7d640-46e8-313e-b158-ded6d18593b3'; // Wikidata Q884, property P982.
const OCCUPATIONS = ['Q177220', 'Q488205', 'Q2252262', 'Q639669', 'Q33999', 'Q10800557', 'Q10798782', 'Q17125263', 'Q15077007'];
const MUSICAL_GROUP = 'Q215380';
const MUSICBRAINZ_MAX = 20000, MUSICBRAINZ_PAGE = 100, MUSICBRAINZ_GAP_MS = 1100, LABEL_BATCH = 400;

const sleep = ms => new Promise(done => setTimeout(done, ms));
const log = message => process.stderr.write(`${message}\n`);

async function getJson(url, init = {}, attempts = 6) {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, { ...init, headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...init.headers }, signal: AbortSignal.timeout(120_000) }).catch(error => ({ ok: false, status: 0, error }));
    if (response.ok) return response.json();
    if (attempt >= attempts) throw new Error(`request failed ${response.status}: ${String(url).slice(0, 120)}`);
    await sleep(Math.min(60_000, 3_000 * 2 ** attempt));
  }
}

const sparql = query => getJson('https://query.wikidata.org/sparql', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ format: 'json', query }) }).then(body => body.results.bindings);
const qid = binding => binding.value.split('/').pop();
const values = ids => ids.map(id => `wd:${id}`).join(' ');

async function wikidataPeople() {
  const found = new Map();
  const note = (id, patch) => { const item = found.get(id) ?? { occupations: new Set(), kpop: false, group: false, sitelinks: 0 }; found.set(id, item); patch(item); };
  for (const occupation of OCCUPATIONS) {
    const rows = await sparql(`SELECT DISTINCT ?item ?links WHERE { ?item wdt:P31 wd:Q5; wdt:P27 wd:${KOREA}; wdt:P106 wd:${occupation}; wikibase:sitelinks ?links. }`);
    log(`wikidata occupation ${occupation}: ${rows.length}`);
    for (const row of rows) note(qid(row.item), item => { item.occupations.add(occupation); item.sitelinks = Number(row.links.value); });
  }
  // Genre alone also matches albums and songs, so keep people and musical groups only.
  const kpop = await sparql(`SELECT DISTINCT ?item ?links ?human WHERE { ?item wdt:P136 wd:${KPOP}; wikibase:sitelinks ?links. { ?item wdt:P31 wd:Q5. BIND(1 AS ?human) } UNION { ?item wdt:P31/wdt:P279* wd:${MUSICAL_GROUP}. } }`);
  log(`wikidata k-pop: ${kpop.length}`);
  for (const row of kpop) note(qid(row.item), item => { item.kpop = true; item.group = !row.human; item.sitelinks = Number(row.links.value); });
  const groups = await sparql(`SELECT DISTINCT ?item ?links WHERE { ?item wdt:P495 wd:${KOREA}; wdt:P31/wdt:P279* wd:${MUSICAL_GROUP}; wikibase:sitelinks ?links. }`);
  log(`wikidata groups: ${groups.length}`);
  for (const row of groups) note(qid(row.item), item => { item.group = true; item.sitelinks = Number(row.links.value); });
  return found;
}

async function wikidataNames(ids) {
  const names = new Map(), links = new Map();
  for (let start = 0; start < ids.length; start += LABEL_BATCH) {
    const batch = ids.slice(start, start + LABEL_BATCH);
    const rows = await sparql(`SELECT ?item ?label ?kind ?mbid WHERE { VALUES ?item { ${values(batch)} } { ?item rdfs:label ?label. BIND("label" AS ?kind) FILTER(LANG(?label) IN ("ko","en","ja","mul")) } UNION { ?item skos:altLabel ?label. BIND("alias" AS ?kind) FILTER(LANG(?label) IN ("ko","en","ja")) } UNION { ?item wdt:P434 ?mbid. } }`);
    for (const row of rows) {
      const id = qid(row.item);
      if (row.mbid) { links.set(row.mbid.value, id); continue; }
      const item = names.get(id) ?? { aliases: [] };
      names.set(id, item);
      const language = row.label['xml:lang'];
      if (row.kind.value === 'label' && (language === 'ko' || language === 'en')) item[language] = row.label.value;
      else if (row.kind.value === 'label' && language === 'mul') item.mul = row.label.value;
      else item.aliases.push(row.label.value);
    }
    log(`wikidata names: ${Math.min(start + LABEL_BATCH, ids.length)}/${ids.length}`);
    await sleep(500);
  }
  return { names, links };
}

async function musicbrainzArtists() {
  const entries = [];
  for (let offset = 0; offset < MUSICBRAINZ_MAX; offset += MUSICBRAINZ_PAGE) {
    const body = await getJson(`https://musicbrainz.org/ws/2/artist?area=${KOREA_AREA_MBID}&inc=aliases&fmt=json&limit=${MUSICBRAINZ_PAGE}&offset=${offset}`);
    for (const artist of body.artists) {
      if (artist.type && !['Person', 'Group'].includes(artist.type)) continue;
      const hasHangul = text => /\p{Script=Hangul}/u.test(text);
      const aliases = (artist.aliases ?? []).map(alias => alias.name);
      const all = [artist.name, ...aliases];
      const entry = makeEntry({ source: 'musicbrainz', sourceId: artist.id, ko: all.find(hasHangul), en: all.find(name => /^[\p{Script=Latin}\p{N}\p{P}\p{Zs}\p{S}]+$/u.test(name)), other: artist.name, aliases });
      if (entry) entries.push(entry);
    }
    log(`musicbrainz: ${Math.min(offset + MUSICBRAINZ_PAGE, body['artist-count'])}/${body['artist-count']}`);
    if (offset + MUSICBRAINZ_PAGE >= body['artist-count']) break;
    await sleep(MUSICBRAINZ_GAP_MS);
  }
  return entries;
}

const output = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('usage: fetch.mjs <output directory>');
mkdirSync(output, { recursive: true });
const people = await wikidataPeople();
const { names, links } = await wikidataNames([...people.keys()]);
const wikidata = [...people].map(([id, item]) => { const label = names.get(id) ?? { aliases: [] }; return makeEntry({ source: 'wikidata', sourceId: id, ko: label.ko, en: label.en ?? label.mul, aliases: label.aliases, category: categoryFor({ occupations: [...item.occupations], kpop: item.kpop, group: item.group }), popularity: item.sitelinks }); }).filter(Boolean);
const musicbrainz = await musicbrainzArtists();
const { entries, mergedCount } = mergeSources(wikidata, musicbrainz, links);
const fetchedAt = new Date().toISOString();
writeFileSync(join(output, 'names.ndjson'), `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`);
writeFileSync(join(output, 'load.sql'), buildLoadSql(entries));
writeFileSync(join(output, 'summary.json'), `${JSON.stringify(summarize(entries, { fetchedAt, musicbrainzFetched: musicbrainz.length, musicbrainzMerged: mergedCount, musicbrainzArea: 'South Korea', musicbrainzCap: MUSICBRAINZ_MAX }), null, 2)}\n`);
log(`done: ${entries.length} entries in ${output}`);
