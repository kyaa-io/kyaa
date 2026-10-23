import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Input is an authenticated Privy users export and the matching app_users id/DID inventory. */
export function normalizeLegacyInventory(users, owners) {
  if (!Array.isArray(users) || !Array.isArray(owners)) throw new Error("Inventory must contain users and owners arrays");
  const byDid=new Map();
  for(const user of users){if(typeof user.id!=="string" || byDid.has(user.id))throw new Error("Invalid or duplicate Privy user");byDid.set(user.id,user);}
  const seenOwners=new Set(),subjects=new Map();
  return owners.map(owner=>{
    if(!/^[0-9a-f-]{36}$/i.test(owner.id) || typeof owner.privy_user_id!=="string" || seenOwners.has(owner.id))throw new Error("Invalid or duplicate owner");
    seenOwners.add(owner.id);
    if (!owner.privy_user_id.startsWith("did:privy:")) {
      const knownLocal = owner.privy_user_id === `review-demo:${owner.id}`
        || (owner.status === "disabled" && owner.privy_user_id === `deleted:${owner.id}`)
        || /^supabase-email:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner.privy_user_id);
      if (!knownLocal) throw new Error("Unknown non-Privy owner namespace");
      return {appUserId:owner.id,privyUserId:owner.privy_user_id,accounts:[]};
    }
    const user=byDid.get(owner.privy_user_id);
    if(!user || !Array.isArray(user.linked_accounts))throw new Error("Privy export does not cover every owner");
    const accounts=[];
    for(const account of user.linked_accounts){
      if(!["google_oauth","apple_oauth"].includes(account.type))continue;
      if(typeof account.subject!=="string" || !account.subject || account.subject.length>256 || typeof account.verified_at!=="number" || account.verified_at<=0)throw new Error("Unverified provider account in inventory");
      const issuer=account.type==="google_oauth"?"https://accounts.google.com":"https://appleid.apple.com";
      const key=issuer+":"+account.subject;
      if(subjects.has(key) && subjects.get(key)!==owner.id)throw new Error("Provider identity belongs to multiple owners");
      subjects.set(key,owner.id);accounts.push({issuer,subject:account.subject});
    }
    return {appUserId:owner.id,privyUserId:user.id,accounts};
  });
}
export function normalizeUnownedInventory(users, owners) {
  const owned = new Set(owners.map(owner=>owner.privy_user_id));
  const subjects=new Map();
  const all=users.map(user=>{
    const record=normalizeLegacyInventory([user],[{id:"00000000-0000-4000-8000-000000000000",privy_user_id:user.id}])[0];
    for(const account of record.accounts){const key=account.issuer+":"+account.subject;if(subjects.has(key)&&subjects.get(key)!==user.id)throw new Error("Duplicate provider subject in full Privy export");subjects.set(key,user.id);}
    const emails=[...new Set(user.linked_accounts.filter(account=>typeof account.verified_at==="number"&&account.verified_at>0).map(account=>account.email??account.address).filter(email=>typeof email==="string"&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)).map(email=>email.trim().toLowerCase()))];
    return {privyUserId:user.id,accounts:record.accounts,emails};
  });
  return all.filter(user=>!owned.has(user.privyUserId));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const [sourcePath,outputPath]=process.argv.slice(2);
  if(!sourcePath || !outputPath)throw new Error("Usage: node backfill.mjs INPUT.json OUTPUT.json");
  const input=readFileSync(sourcePath);
  const {users,owners}=JSON.parse(input.toString("utf8"));
  const records=normalizeLegacyInventory(users,owners);
  const unownedUsers=normalizeUnownedInventory(users,owners);
  writeFileSync(outputPath,JSON.stringify({expectedPrivyUserCount:users.length,unownedUsers,artifactSha256:createHash("sha256").update(input).digest("hex"),expectedOwnerCount:records.length,owners:records}),{flag:"wx",mode:0o600});
  console.log(`Prepared ${records.length} owner records. No network requests or database changes performed.`);
}
