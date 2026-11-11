import { appendFile, readFile } from 'node:fs/promises';
import { z } from 'zod';
import { authorizeAdminSession } from '../admin/admin-session-gate';
import { createPrivyNodeAccessVerifier } from '../auth/privy-node-verifier';
import { localSignupEnabled } from './local';
const schema = z.object({
  users:z.array(z.object({id:z.uuid(),privyUserId:z.string().min(1),verifiedEmail:z.email(),status:z.enum(['active','disabled'])})),
  admins:z.array(z.object({id:z.uuid(),email:z.email(),role:z.enum(['admin','operator','viewer']),active:z.boolean()})),
}).strict();
/** Existing verified Google/admin gate, with local files for identity, allowlist and audit. */
export async function authorizeLocalAdmin(input: {authorization:string;correlationId:string}) {
  if (!localSignupEnabled()) throw new Error('SIGNUP_EVENT_LOCAL_DISABLED');
  const path = process.env.KYAA_SIGNUP_EVENT_ADMIN_FILE;
  if (!path) throw new Error('SIGNUP_EVENT_LOCAL_ADMIN_REQUIRED');
  const data = schema.parse(JSON.parse(await readFile(path,'utf8')));
  const verifier = createPrivyNodeAccessVerifier({appId:process.env.PRIVY_APP_ID ?? '',appSecret:process.env.PRIVY_APP_SECRET ?? '',appEnvironment:process.env.PRIVY_APP_ENVIRONMENT === 'development' ? 'development' : 'production',appleLoginEnabled:process.env.APPLE_LOGIN_ENABLED === 'true'});
  return authorizeAdminSession({...input,verifier,repository:{
    findUserByPrivyId:async id=>data.users.find(user=>user.privyUserId===id) ?? null,
    findActiveAdminByEmail:async email=>data.admins.find(admin=>admin.email===email && admin.active) ?? null,
    appendAuthorizationAudit:async event=>{await appendFile(`${path}.audit.jsonl`,JSON.stringify(event)+'\n',{mode:0o600});},
  }});
}
