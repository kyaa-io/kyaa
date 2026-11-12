import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
const sql=readFileSync(resolve(process.cwd(),'../../supabase/migrations/20261226040000_unified_search.sql'),'utf8');
it('indexes public searchable text and filters hidden, member-only and blocked posts',()=>{
 expect(sql.match(/gin_trgm_ops/g)).toHaveLength(5);
 expect(sql).toContain("p.visibility='public' and p.deleted_at is null and p.hidden_at is null");
 expect(sql).toContain("p.visibility='public' and p.removed_at is null and g.status='published'");
 expect(sql).toContain("n.publication_status='published' and n.archived_at is null and n.visibility='public'");
 expect(sql).toContain('not public.fan_web_blocked(p_actor,p.app_user_id)');
 expect(sql).toContain('not public.fan_web_blocked(p_actor,p.author_id)');
 expect(sql).toContain('limit 31');
 expect(sql).toContain('to service_role');
});

it('matches extracted notice text, not formatting',()=>{expect(sql).toContain('nl.search_body_text');expect(sql).not.toContain('body_json::text');});
