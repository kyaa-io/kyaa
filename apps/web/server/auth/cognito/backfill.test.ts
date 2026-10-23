import {expect,it} from "vitest";
// @ts-expect-error Maintainer CLI is JavaScript, exercised directly here.
import {normalizeLegacyInventory,normalizeUnownedInventory} from "./backfill.mjs";
const owner={id:"11111111-1111-4111-8111-111111111111",privy_user_id:"did:privy:old"};
const user={id:owner.privy_user_id,linked_accounts:[{type:"google_oauth",subject:"google-sub",verified_at:1}]};
it("preserves existing UUID/DID and provider subjects without using email as a merge key",()=>{
 expect(normalizeLegacyInventory([user],[owner])).toEqual([{appUserId:owner.id,privyUserId:owner.privy_user_id,accounts:[{issuer:"https://accounts.google.com",subject:"google-sub"}]}]);
});
it("refuses incomplete coverage and conflicting subjects",()=>{
 expect(()=>normalizeLegacyInventory([], [owner])).toThrow();
 expect(()=>normalizeLegacyInventory([user], [owner,owner])).toThrow();
 expect(()=>normalizeLegacyInventory([user,{...user,id:"did:privy:other"}],[owner,{id:"22222222-2222-4222-8222-222222222222",privy_user_id:"did:privy:other"}])).toThrow();
 expect(()=>normalizeLegacyInventory([{...user,linked_accounts:[{type:"google_oauth",subject:"sub",verified_at:0}]}],[owner])).toThrow();
});

it("retains provider and verified email guards for Privy users with no app owner yet",()=>{
 expect(normalizeUnownedInventory([{...user,id:"did:privy:pending",linked_accounts:[{type:"google_oauth",subject:"pending-sub",email:"old@example.test",verified_at:1}]}],[])).toEqual([{privyUserId:"did:privy:pending",accounts:[{issuer:"https://accounts.google.com",subject:"pending-sub"}],emails:["old@example.test"]}]);
});

it("covers local and retired owners without inventing Privy identities",()=>{
 const local={...owner,privy_user_id:`review-demo:${owner.id}`};
 const retired={...owner,privy_user_id:`deleted:${owner.id}`,status:"disabled"};
 const email={...owner,privy_user_id:`supabase-email:${owner.id}`};
 for(const record of [local,retired,email]) expect(normalizeLegacyInventory([], [record])).toEqual([{appUserId:record.id,privyUserId:record.privy_user_id,accounts:[]}]);
 expect(()=>normalizeLegacyInventory([], [{...retired,status:"active"}])).toThrow();
 expect(()=>normalizeLegacyInventory([], [{...owner,privy_user_id:"unknown:owner"}])).toThrow();
 expect(()=>normalizeLegacyInventory([], [{...local,privy_user_id:"review-demo:22222222-2222-4222-8222-222222222222"}])).toThrow();
});
