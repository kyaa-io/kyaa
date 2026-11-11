import { open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { localSignupEnabled, localSnapshotSchema, type LocalSnapshot } from './local';
import { projectSources } from './source-adapter';
/** Privileged local ingestion of original source records, never a public reward claim. */
export async function ingestLocalSources(raw: unknown, replaceActions = false): Promise<void> {
  if (!localSignupEnabled()) throw new Error('SIGNUP_EVENT_LOCAL_DISABLED');
  const path = process.env.KYAA_SIGNUP_EVENT_SNAPSHOT;
  if (!path) throw new Error('SIGNUP_EVENT_LOCAL_PATH_REQUIRED');
  const incoming = projectSources(raw);
  const lock = await open(`${path}.lock`, 'wx', 0o600);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    let current: LocalSnapshot | null = null;
    try { const raw = JSON.parse(await readFile(path,'utf8')); current = 'app_users' in raw ? projectSources(raw) : localSnapshotSchema.parse(raw); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
    const users = new Map(current?.users.map(user=>[user.id,user]));
    for (const user of incoming.users) {
      const previous = users.get(user.id);
      if (previous && Date.parse(previous.createdAt) !== Date.parse(user.createdAt)) throw new Error('SIGNUP_EVENT_SOURCE_CONFLICT');
      users.set(user.id,user);
    }
    const actions = new Map(current?.actions.filter(action=>!replaceActions || !incoming.users.some(user=>user.id===action.userId)).map(action=>[`${action.userId}:${action.kind}:${action.sourceId}`,action]));
    for (const action of incoming.actions) {
      const key=`${action.userId}:${action.kind}:${action.sourceId}`;
      const previous=actions.get(key);
      if (previous && JSON.stringify(previous)!==JSON.stringify(action)) throw new Error('SIGNUP_EVENT_SOURCE_CONFLICT');
      actions.set(key,action);
    }
    const snapshot=localSnapshotSchema.parse({users:[...users.values()],actions:[...actions.values()],policy:incoming.policy,entries:[...(current?.entries ?? []),...incoming.entries].filter((entry,index,all)=>all.findIndex(value=>value.userId===entry.userId)===index)});
    await writeFile(temporary,JSON.stringify(snapshot),{mode:0o600,flag:'wx'});
    await rename(temporary,path);
  } finally {
    await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});
    await lock.close();
    await unlink(`${path}.lock`);
  }
}
