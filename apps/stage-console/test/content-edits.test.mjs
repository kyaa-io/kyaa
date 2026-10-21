import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, stat, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContentEdits, saveContentEdits, applyContentEdits } from '../host/content-edits.mjs';
const manifest = { revision: 'bundle-one', title: 'Show', version: 1, cues: [
  { id: 'html', type: 'html', asset: 'personal.html', slideIndex: 0, label: 'HTML', script: ['Original'], section: 'A', nextOnEnd: 'image' },
  { id: 'image', type: 'slide', asset: 'slide.png', label: 'Image', script: [], section: 'B' },
] };
async function fixture(t) {
  const path = await mkdtemp(join(tmpdir(), 'stage-edits-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}
const input = { expectedVersion: 0, cueId: 'html', label: 'New', script: ['Edited'], slideText: { 0: '<script>plain text</script>', 3: '' } };
test('private edits survive restart, retain metadata and leave original untouched', async t => {
  const path = await fixture(t), original = structuredClone(manifest);
  assert.deepEqual(await loadContentEdits(path, manifest), { version: 0, cues: {} });
  const saved = await saveContentEdits(path, manifest, input);
  assert.deepEqual(await loadContentEdits(path, structuredClone(manifest)), saved);
  const applied = applyContentEdits(manifest, saved);
  assert.equal(applied.cues[0].label, 'New');
  assert.equal(applied.cues[0].asset, 'personal.html');
  assert.equal(applied.cues[0].nextOnEnd, 'image');
  assert.equal(applied.cues[0].slideText[0], '<script>plain text</script>');
  assert.deepEqual(manifest, original);
  const files = await readdir(path);
  assert.equal(files.length, 1);
  assert.equal((await stat(join(path, files[0]))).mode & 0o777, 0o600);
  applied.cues[0].script[0] = 'unshared';
  assert.equal(saved.cues.html.script[0], 'Edited');
});
test('revisions keep separate edits and concurrent stale writes cannot overwrite', async t => {
  const path = await fixture(t);
  const outcomes = await Promise.allSettled([saveContentEdits(path, manifest, input), saveContentEdits(path, manifest, { ...input, label: 'Stale' })]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  const revised = { ...manifest, revision: 'bundle-two' };
  assert.equal((await loadContentEdits(path, revised)).version, 0);
  await saveContentEdits(path, revised, { ...input, label: 'Second bundle' });
  assert.equal((await loadContentEdits(path, manifest)).cues.html.label, 'New');
  assert.equal((await readdir(path)).length, 2);
});
test('reject unknown, oversized, prototype, missing cue and fixed-image edits before writing', async t => {
  const path = await fixture(t);
  for (const bad of [
    { ...input, asset: '/secret' }, { ...input, cueId: 'absent' }, { ...input, cueId: 'image' },
    { ...input, label: 'x'.repeat(201) }, { ...input, script: ['x'.repeat(4001)] },
    { ...input, script: Array(101).fill('x') }, { ...input, slideText: { '-1': 'x' } },
    { ...input, slideText: { 1000: 'x' } }, { ...input, slideText: { 0: 'x'.repeat(2001) } },
    { ...input, slideText: Object.fromEntries(Array.from({ length: 301 }, (_, i) => [i, 'x'])) },
    JSON.parse('{"expectedVersion":0,"cueId":"html","label":"Bad","script":[],"__proto__":{}}'),
    { ...input, slideText: JSON.parse('{"constructor":"bad"}') },
  ]) await assert.rejects(saveContentEdits(path, manifest, bad));
  assert.deepEqual(await readdir(path), []);
});
test('malformed and mismatched disk edits fail closed without overwriting evidence', async t => {
  const path = await fixture(t);
  await saveContentEdits(path, manifest, input);
  const file = join(path, (await readdir(path))[0]);
  for (const raw of ['broken', JSON.stringify({ revision: 'wrong', version: 1, cues: {} }), JSON.stringify({ revision: manifest.revision, version: 1, cues: { unknown: { label: 'Oops', script: [] } } }), '{"revision":"bundle-one","version":1,"cues":{"__proto__":{"label":"Oops","script":[]}}}']) {
    await writeFile(file, raw);
    await assert.rejects(loadContentEdits(path, manifest));
    await assert.rejects(saveContentEdits(path, manifest, { ...input, expectedVersion: 1 }));
    assert.equal(await readFile(file, 'utf8'), raw);
  }
});

test('HTML adapter applies literal text to stable nodes and resets on cue entry', async () => {
  const { runInNewContext } = await import('node:vm');
  const source = await readFile(new URL('../scripts/prepare-assets.py', import.meta.url), 'utf8');
  const adapter = source.match(/ADAPTER = '''[\s\S]*?<script>([\s\S]*?)<\/script>/)[1];
  const normal = value => ({ nodeValue: value, parentElement: { closest: () => null } });
  const first = normal('Title'), second = normal('inline word'), excluded = { nodeValue: 'script source', parentElement: { closest: () => ({}) } };
  const slides = [{ querySelector: () => ({}) }], handlers = {};
  const parent = { postMessage() {} };
  const context = { parent, location: { origin: 'https://stage.local' }, index: 0, slides,
    setPresentation() {}, showSlide(index) { context.index = index; },
    document: { querySelectorAll: selector => selector === 'section.slide' ? slides : [], createTreeWalker: () => {
      const nodes = [first, normal('  '), second, excluded];
      let i = -1;
      return { nextNode() { return ++i < nodes.length; }, get currentNode() { return nodes[i]; } };
    } }, window: { addEventListener: (name, handler) => { handlers[name] = handler; } },
  };
  runInNewContext(adapter, context);
  const send = data => handlers.message({ source: parent, origin: context.location.origin, data: { type: 'kyaa-stage', ...data } });
  await send({ action: 'text', index: 0, slideText: { 0: '', 1: '<b>literal</b>' } });
  assert.equal(first.nodeValue, '');
  assert.equal(second.nodeValue, '<b>literal</b>');
  assert.equal(excluded.nodeValue, 'script source');
  await send({ action: 'slide', index: 0 });
  assert.equal(first.nodeValue, 'Title');
  assert.equal(second.nodeValue, 'inline word');
  await send({ action: 'text', index: 0, slideText: { 0: 'New title' } });
  assert.equal(first.nodeValue, 'New title');
  assert.equal(second.nodeValue, 'inline word');
  await handlers.message({ source: {}, origin: context.location.origin, data: { type: 'kyaa-stage', action: 'text', index: 0, slideText: { 0: 'Untrusted' } } });
  assert.equal(first.nodeValue, 'New title');
});
