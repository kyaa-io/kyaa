import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, open } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
const slideText = z.record(z.string().regex(/^(0|[1-9]\d{0,2})$/), z.string().max(2000))
  .refine(value => Object.keys(value).length <= 300, '화면 문구가 너무 많습니다.');
const fields = { label: z.string().trim().min(1).max(200), script: z.array(z.string().max(4000)).max(100), slideText: slideText.optional() };
const overrideSchema = z.object(fields).strict();
const inputSchema = z.object({ expectedVersion: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1), cueId: z.string().min(1).max(100), ...fields }).strict();
const diskSchema = z.object({ revision: z.string(), version: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), cues: z.record(z.string(), overrideSchema) }).strict();
const pending = new Map();
function rejectPrototypeKeys(value) {
  if (!value || typeof value !== 'object') return;
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('허용되지 않은 편집 데이터입니다.');
  for (const key of Object.keys(value)) {
    if (forbidden.has(key)) throw new Error('허용되지 않은 편집 항목입니다.');
    rejectPrototypeKeys(value[key]);
  }
}
function filePath(userData, manifest) {
  return join(userData, `content-edits-${createHash('sha256').update(manifest.revision).digest('hex')}.json`);
}
function validateCues(manifest, cues) {
  for (const [id, value] of Object.entries(cues)) {
    const cue = manifest.cues.find(item => item.id === id);
    if (!cue) throw new Error('존재하지 않는 큐입니다.');
    if (value.slideText !== undefined && cue.type !== 'html') throw new Error('이 화면의 문구는 직접 수정할 수 없습니다.');
  }
}
export async function loadContentEdits(userData, manifest) {
  let raw;
  try { raw = await readFile(filePath(userData, manifest), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return { version: 0, cues: {} }; throw error; }
  const parsed = JSON.parse(raw);
  rejectPrototypeKeys(parsed);
  const data = diskSchema.parse(parsed);
  if (data.revision !== manifest.revision) throw new Error('현재 공연과 다른 편집 파일입니다.');
  validateCues(manifest, data.cues);
  return { version: data.version, cues: data.cues };
}
export function applyContentEdits(manifest, edits) {
  rejectPrototypeKeys(edits);
  const data = diskSchema.parse({ ...edits, revision: manifest.revision });
  validateCues(manifest, data.cues);
  return { ...manifest, cues: manifest.cues.map(cue => ({ ...cue, ...data.cues[cue.id], script: [...(data.cues[cue.id]?.script ?? cue.script)] })) };
}
export async function saveContentEdits(userData, manifest, input) {
  rejectPrototypeKeys(input);
  const { expectedVersion, cueId, ...override } = inputSchema.parse(input);
  validateCues(manifest, { [cueId]: override });
  const path = filePath(userData, manifest);
  const previous = pending.get(path) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    const current = await loadContentEdits(userData, manifest);
    if (current.version !== expectedVersion) throw new Error('다른 편집이 먼저 저장되었습니다. 편집기를 다시 열어 확인해 주세요.');
    const next = { version: current.version + 1, cues: { ...current.cues, [cueId]: override } };
    await mkdir(userData, { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    let handle;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(JSON.stringify({ revision: manifest.revision, ...next }), 'utf8');
      await handle.sync();
      await handle.close(); handle = undefined;
      await rename(temporary, path);
    } finally {
      await handle?.close();
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
    return next;
  });
  pending.set(path, operation);
  try { return await operation; }
  finally { if (pending.get(path) === operation) pending.delete(path); }
}
