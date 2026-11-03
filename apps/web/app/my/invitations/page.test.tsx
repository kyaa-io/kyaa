import type {ReactElement} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import Page from './page';
afterEach(()=>vi.unstubAllEnvs());
it('gates the actual service route and sanitizes referral input before passing it to the client',async()=>{vi.stubEnv('KYAA_GROUPS_ENABLED','false');await expect(Page({searchParams:Promise.resolve({})})).rejects.toThrow();vi.stubEnv('KYAA_GROUPS_ENABLED','true');const result=await Page({searchParams:Promise.resolve({locale:'ko',invite:'1',code:'abc123',destination:'https://outside.test'})})as ReactElement<{code:string;destination:string;initialInvite:boolean}>;expect(result.props.code).toBe('ABC123');expect(result.props.destination).toBe('/');expect(result.props.initialInvite).toBe(true);});
