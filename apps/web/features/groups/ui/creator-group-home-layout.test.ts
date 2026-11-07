import{readFileSync}from'node:fs';
import{join}from'node:path';
import{describe,expect,it}from'vitest';

const css=readFileSync(join(__dirname,'creator-group-home.module.css'),'utf8');

describe('group home stories column',()=>{
 it('keeps the empty-state box under the chips instead of pushing it to the column bottom',()=>{
  const rules=[...css.matchAll(/\.stories\s*>\s*:last-child([^{]*)\{[^}]*margin-top:\s*auto/g)];
  expect(rules.length).toBeGreaterThan(0);
  for(const rule of rules)expect(rule[1]).toContain(':not(.emptyStories)');
 });
});
