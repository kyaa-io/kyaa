import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
const sql=readFileSync('../../supabase/migrations/20261226131113_social_nickname_search.sql','utf8');
it('keeps nickname discovery authenticated, public, bounded and block aware',()=>{
 expect(sql).toContain('fan_web_lock_active_user(p_app_user_id)');
 expect(sql).toContain('s.profile_visible');
 expect(sql).toContain("u.status='active'");
 expect(sql).toContain('not public.fan_web_blocked(p_app_user_id,u.id)');
 expect(sql).toContain('limit 20');
 expect(sql).toContain('from public,anon,authenticated');
 expect(sql).toContain('to service_role');
 expect(sql).not.toMatch(/email|phone|request_social_dm\(/);
});
