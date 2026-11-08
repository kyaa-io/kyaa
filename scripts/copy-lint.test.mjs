import test from 'node:test';
import assert from 'node:assert/strict';
import { COPY_RULES, compare, hangulLiterals } from './copy-lint.mjs';

test('K1–K3 catch the banned wording, K6 keeps the allow list', () => {
  assert.equal(COPY_RULES.K1.test('광고 보고 교환하기'), 1);
  assert.equal(COPY_RULES.K2.test('3분 전'), 1);
  assert.equal(COPY_RULES.K2.test('11. 08. 13:47'), 0);
  assert.equal(COPY_RULES.K3.test('지금 3번 가능'), 1);
  assert.equal(COPY_RULES.K3.test('응모 가능 3장'), 0);
  assert.equal(COPY_RULES.K6.test('HOME MY LIVE'), 0);
  assert.equal(COPY_RULES.K6.test('FAVORITES'), 1);
});

test('reads Hangul string literals and JSX text, not comments', () => {
  const found = hangulLiterals('// 주석 3분 전\nconst a = "내 최애 소식"; const b = <p>새 소식이 없습니다</p>;');
  assert.deepEqual(found, ['내 최애 소식', '새 소식이 없습니다']);
});

test('only growth over the baseline is reported', () => {
  assert.deepEqual(compare({ 'K1|a.ts': 1 }, { 'K1|a.ts': 1 }), []);
  assert.equal(compare({ 'K1|a.ts': 2 }, { 'K1|a.ts': 1 })[0].sev, 'fail');
});
