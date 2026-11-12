import { afterEach, expect, it, vi } from 'vitest';
import { POST } from './route';
afterEach(()=>vi.unstubAllEnvs());
it('retires share bonuses and respects the server switch',async()=>{
 vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE','true');expect((await POST()).status).toBe(410);
 vi.stubEnv('KYAA_FEATURE_SIGNUP_RAFFLE','false');expect((await POST()).status).toBe(404);
});
