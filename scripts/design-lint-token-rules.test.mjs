import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanTokens } from './design-lint-token-rules.mjs';
for (const [id, bad, good] of [
 ['D1','font-size:16px','font-size:var(--fan-body-size)'],
 ['D1','font-weight:700','font-weight:var(--fan-body-weight)'],
 ['D1','line-height:1.5','line-height:var(--fan-body-leading)'],
 ['D2','padding:16px','padding:var(--space-4)'],
 ['D2','margin:1rem','margin:0 auto'],
 ['D2','gap:8px','gap:var(--space-2)'],
 ['D3','border-radius:16px','border-radius:var(--radius-card)'],
 ['D4','color:#fff','color:var(--color-ink)'],
 ['D5','box-shadow:0 2px 4px black','box-shadow:var(--shadow-overlay)'],
]) test(`${id} ${bad}`, () => {
 assert.ok([...scanTokens(`.x{${bad}}`).keys()].some(k => k.startsWith(id+'|')));
 assert.equal(scanTokens(`.x{${good}}`).size,0);
});
test('icon button needs token gap',()=>{
 assert.equal(scanTokens('.button{svg{width:16px}}').size,1);
 assert.equal(scanTokens('.button{gap:var(--space-2);svg{width:16px}}').size,0);
});
