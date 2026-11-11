import { afterEach, expect, it, vi } from 'vitest';
import { POST } from './route';
afterEach(()=>vi.unstubAllEnvs());
it('retires share bonuses and keeps production unavailable',async()=>{
 vi.stubEnv('KYAA_SIGNUP_EVENT_LOCAL','1');expect((await POST()).status).toBe(410);
 vi.stubEnv('NODE_ENV','production');expect((await POST()).status).toBe(404);
});
