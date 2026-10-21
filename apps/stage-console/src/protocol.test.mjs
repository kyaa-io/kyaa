import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assetUrl, readMediaReport, previewPoint } from './protocol.js';
test('asset URL keeps bundle directories and escapes reserved characters', () => {
  assert.equal(assetUrl('slides/한글 #1.png'), '/assets/slides/%ED%95%9C%EA%B8%80%20%231.png');
  assert.equal(assetUrl(undefined), '');
});
test('HTML media report requires the current iframe and exact origin', () => {
  const source = {}, other = {}, options = { origin: 'https://stage.local', source, cueId: 'intro' };
  const event = { origin: options.origin, source, data: { type: 'kyaa-stage-media', playing: false, position: 37, ended: true } };
  assert.deepEqual(readMediaReport(event, options), { cueId: 'intro', playing: false, position: 37, ended: true });
  assert.equal(readMediaReport({ ...event, source: other }, options), null);
  assert.equal(readMediaReport({ ...event, origin: 'https://other.local' }, options), null);
  assert.equal(readMediaReport(event, { ...options, source: null }), null);
});
test('HTML media report refuses malformed times and completion flags', () => {
  const source = {}, options = { origin: 'https://stage.local', source, cueId: 'intro' };
  for (const data of [{ playing: true, position: -1 }, { playing: true, position: Infinity }, { playing: 'yes', position: 1 }, { playing: true, position: 1, ended: 'yes' }]) {
    assert.equal(readMediaReport({ origin: options.origin, source, data: { type: 'kyaa-stage-media', ...data } }, options), null);
  }
});

test('HTML completion events belong only to the current slide', () => {
  const source = {}, options = { origin: 'https://stage.local', source, cueId: 'html-02', slideIndex: 1 };
  const event = { origin: options.origin, source, data: { type: 'kyaa-stage-media', event: 'ended', index: 1, playing: false, position: 37 } };
  assert.equal(readMediaReport(event, options).ended, true);
  assert.equal(readMediaReport({ ...event, data: { ...event.data, index: 0 } }, options), null);
});

test('preview coordinates exclude contain letterboxing and clamp outside content', () => {
  const box = { left: 10, top: 20, width: 160, height: 90 };
  assert.deepEqual(previewPoint(90, 65, box, 100, 100), { x: 0.5, y: 0.5 });
  assert.deepEqual(previewPoint(10, 20, box, 100, 100), { x: 0, y: 0 });
  assert.deepEqual(previewPoint(170, 110, box, 100, 100), { x: 1, y: 1 });
  assert.deepEqual(previewPoint(90, 65, box, 160, 90), { x: 0.5, y: 0.5 });
});
