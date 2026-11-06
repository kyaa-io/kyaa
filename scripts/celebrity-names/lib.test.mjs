import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLoadSql, categoryFor, cleanName, makeEntry, mergeSources, summarize } from './lib.mjs';

test('cleanName keeps real names and drops what is not a name', () => {
  assert.equal(cleanName('  아이유  '), '아이유');
  assert.equal(cleanName('IU'), 'IU');
  assert.equal(cleanName('아이유'.normalize('NFD')), '아이유');
  assert.equal(cleanName('a  b'), 'a b');
  for (const bad of ['', '   ', 'Q12345', '!!!', 'a\u0000b', '<b>x</b>', 'x'.repeat(121), null, 7]) assert.equal(cleanName(bad), null, String(bad));
});

test('categoryFor prefers idol, then the known occupations', () => {
  assert.equal(categoryFor({ kpop: true, occupations: ['Q33999'] }), 'idol');
  assert.equal(categoryFor({ group: true }), 'idol');
  assert.equal(categoryFor({ occupations: ['Q33999', 'Q177220'] }), null);
  assert.equal(categoryFor({ occupations: ['Q177220'] }), 'singer');
  assert.equal(categoryFor({ occupations: ['Q10800557'] }), 'actor');
  assert.equal(categoryFor({ occupations: ['Q17125263'] }), 'creator');
  assert.equal(categoryFor({ occupations: ['Q1'] }), null);
});

test('makeEntry needs a usable name and collects unique search terms', () => {
  assert.equal(makeEntry({ source: 'wikidata', sourceId: 'Q1', ko: 'Q1' }), null);
  const entry = makeEntry({ source: 'wikidata', sourceId: 'Q1', ko: '아이유', en: 'IU', aliases: ['이지은', '아이유', '!!!'], category: 'singer', popularity: 9.7 });
  assert.deepEqual(entry.terms, ['아이유', 'IU', '이지은']);
  assert.equal(entry.popularity, 9);
  assert.equal(entry.license, 'CC0-1.0');
  assert.equal(makeEntry({ source: 'musicbrainz', sourceId: 'm', other: 'Xx' }).name_other, 'Xx');
  assert.equal(makeEntry({ source: 'musicbrainz', sourceId: 'm', en: 'Yy', other: 'Xx' }).name_other, null);
});

test('mergeSources folds a linked MusicBrainz artist into its Wikidata entry', () => {
  const wikidata = [makeEntry({ source: 'wikidata', sourceId: 'Q1', ko: '아이유' })];
  const musicbrainz = [makeEntry({ source: 'musicbrainz', sourceId: 'm1', en: 'IU', aliases: ['Lee Ji-eun'] }), makeEntry({ source: 'musicbrainz', sourceId: 'm2', en: 'Other' })];
  const { entries, mergedCount } = mergeSources(wikidata, musicbrainz, new Map([['m1', 'Q1']]));
  assert.equal(mergedCount, 1);
  assert.deepEqual(entries.map(entry => entry.source_id), ['Q1', 'm2']);
  assert.deepEqual(entries[0].terms, ['아이유', 'IU', 'Lee Ji-eun']);
});

test('buildLoadSql refuses anything that is not CC0 and keeps the data quoted', () => {
  const entry = makeEntry({ source: 'wikidata', sourceId: 'Q1', ko: "O'Neil" });
  assert.match(buildLoadSql([entry]), /O'Neil/);
  assert.throws(() => buildLoadSql([{ ...entry, license: 'CC-BY-NC-SA-3.0' }]), /non-CC0/);
  assert.throws(() => buildLoadSql([{ ...entry, terms: ['$names$'] }]), /quote tag/);
});

test('summarize counts each source', () => {
  const summary = summarize([makeEntry({ source: 'wikidata', sourceId: 'Q1', ko: '가', en: 'A', category: 'idol' }), makeEntry({ source: 'musicbrainz', sourceId: 'm', en: 'B' })]);
  assert.deepEqual([summary.entries, summary.wikidata, summary.musicbrainz, summary.withKorean, summary.withEnglish, summary.terms, summary.categories.idol, summary.categories.none], [2, 1, 1, 1, 2, 3, 1, 1]);
});
