import {readFile,lstat} from 'node:fs/promises';
export const DEV_PRIVY_APP_ID='cmrtb8b7z002w0cjsyo5it6g6';
export function validateIdentityMap(value){
 if(value?.appId!==DEV_PRIVY_APP_ID||!Array.isArray(value.actors)||value.actors.length!==3)throw Error('Exact dev test identity map required');
 const actors=value.actors;
 for(let i=0;i<3;i++){
  const a=actors[i];
  if(a.n!==i+1||!/^did:privy:[A-Za-z0-9:_-]{1,200}$/.test(a.privyUserId)||typeof a.email!=='string'||a.email!==a.email.trim().toLowerCase()||!/^\S+@\S+\.\S+$/.test(a.email)||a.email.length>254||!/^0x[0-9a-f]{40}$/.test(a.walletAddress))throw Error('Invalid dev test identity');
 }
 for(const key of ['privyUserId','email','walletAddress'])if(new Set(actors.map(a=>a[key])).size!==3)throw Error('Duplicate dev test identity');
 return actors.map(({n,privyUserId,email,walletAddress})=>({n,privyUserId,email,walletAddress}));
}
export async function verifyProviderIdentities(actors,privy){
 const {data}=await privy.apps().getTestCredentials(DEV_PRIVY_APP_ID);
 for(const a of actors){
  if(!data.some(t=>t.email.toLowerCase()===a.email))throw Error('Only official dev test accounts allowed');
  const u=await privy.users().getByEmailAddress({address:a.email});
  const w=u.linked_accounts.find(x=>x.type==='wallet'&&x.chain_type==='ethereum'&&x.connector_type==='embedded'&&x.wallet_client==='privy'&&typeof x.address==='string');
  if(u.id!==a.privyUserId||w?.address.toLowerCase()!==a.walletAddress)throw Error('Provider identity or selected wallet differs');
 }
}
export async function loadIdentityMap(path,privy){
 const info=await lstat(path);if(!info.isFile()||(info.mode&0o077)!==0)throw Error('Identity map must be a private regular file');
 const actors=validateIdentityMap(JSON.parse(await readFile(path,'utf8')));await verifyProviderIdentities(actors,privy);return actors;
}
export function identityMapSetting(actors){return `set byus.groups_pencil_identities = '${JSON.stringify(actors).replaceAll("'","''")}';\n`;}
