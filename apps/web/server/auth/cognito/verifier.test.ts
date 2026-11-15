import { TextEncoder as NodeTextEncoder } from "node:util";
import { beforeAll, expect, it, vi } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
vi.mock("server-only",()=>({}));
import { createCognitoVerifier, COGNITO_TOKEN_PREFIX, isCognitoToken } from "./verifier";
const issuer="https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_pool",clientId="client";
let privateKey:CryptoKey,publicKey:CryptoKey;
beforeAll(async()=>{Object.defineProperty(globalThis,"Uint8Array",{configurable:true,value:new NodeTextEncoder().encode("").constructor});({privateKey,publicKey}=await generateKeyPair("RS256"));});
const token=(overrides:Record<string,unknown>={})=>new SignJWT({sub:"owner-sub",iss:issuer,client_id:clientId,token_use:"access",...overrides}).setProtectedHeader({alg:"RS256"}).setIssuedAt().setExpirationTime("5m").sign(privateKey);
it("verifies an issuer/client-bound Cognito access token",async()=>{
 const jwt=await token();expect(isCognitoToken(jwt)).toBe(true);
 await expect(createCognitoVerifier({issuer,clientId},async()=>publicKey)(COGNITO_TOKEN_PREFIX+jwt)).resolves.toMatchObject({issuer,subject:"owner-sub"});
});
it.each([{iss:"https://attacker.test"},{client_id:"other"},{token_use:"id"},{sub:""}])("rejects wrong Cognito claims %j",async claims=>{
 await expect(createCognitoVerifier({issuer,clientId},async()=>publicKey)(await token(claims))).rejects.toMatchObject({status:401});
});
it("verifies ID audience, nonce, provider subject and email before enrollment",async()=>{
 const jwt=await token({token_use:"id",aud:clientId,nonce:"nonce",email:"FAN@example.test",email_verified:true,identities:[{providerName:"Google",userId:"google-sub",primary:true}]});
 const verify=createCognitoVerifier({issuer,clientId},async()=>publicKey);
 await expect(verify(jwt,"id","nonce")).resolves.toMatchObject({email:"fan@example.test",provider:{name:"google",issuer:"https://accounts.google.com",subject:"google-sub"}});
 await expect(verify(jwt,"id","wrong")).rejects.toMatchObject({status:401});
 await expect(createCognitoVerifier({issuer,clientId:"wrong"},async()=>publicKey)(jwt,"id","nonce")).rejects.toMatchObject({status:401});
});
it("rejects expired, unsigned, tampered and wrong-algorithm tokens",async()=>{
 const verify=createCognitoVerifier({issuer,clientId},async()=>publicKey);
 const expired=await new SignJWT({iss:issuer,sub:"sub",token_use:"access",client_id:clientId}).setProtectedHeader({alg:"RS256"}).setIssuedAt(1).setExpirationTime(2).sign(privateKey);
 const jwt=await token();const parts=jwt.split(".");parts[1]=Buffer.from(JSON.stringify({iss:issuer,sub:"attacker"})).toString("base64url");
 for(const invalid of [expired,parts.join("."),"eyJhbGciOiJub25lIn0.e30."]){await expect(verify(invalid)).rejects.toMatchObject({status:401});}
});
