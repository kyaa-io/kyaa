import { expect,it,vi } from "vitest";
vi.mock("server-only",()=>({}));
import { seal,unseal,readCookie,cookie,challenge,opaque,requireOrigin,boundedAuthJson } from "./browser-session";
import type { CognitoConfig } from "./config";
const secret=Buffer.alloc(32,7).toString("base64");
it("encrypts credentials and rejects tampering or a different environment key",()=>{
 const value={accessToken:"private-access",refreshToken:"private-refresh"},encrypted=seal(value,secret);
 expect(encrypted).not.toContain("private");expect(unseal(encrypted,secret)).toEqual(value);
 const bytes=Buffer.from(encrypted,"base64url");bytes[30]^=1;
 expect(()=>unseal(bytes.toString("base64url"),secret)).toThrow();
 expect(()=>unseal(encrypted,Buffer.alloc(32,8).toString("base64"))).toThrow();
});
it("keeps cookies secure and rejects ambiguous cookie values",()=>{
 expect(cookie("__Host-test","value",60)).toContain("HttpOnly; Secure; SameSite=Lax");
 expect(readCookie(new Request("https://kyaa.io",{headers:{cookie:"x=one; x=two"}}),"x")).toBeNull();
 expect(readCookie(new Request("https://kyaa.io",{headers:{cookie:"x=opaque"}}),"x")).toBe("opaque");
 expect(opaque()).toHaveLength(43);expect(challenge("verifier")).toHaveLength(43);
});
it("rejects CSRF while origin Host can differ behind CloudFront",()=>{
 const config={origin:"https://kyaa.io"} as CognitoConfig;
 expect(()=>requireOrigin(new Request("https://origin-alb.test",{headers:{origin:"https://kyaa.io"}}),config)).not.toThrow();
 expect(()=>requireOrigin(new Request("https://kyaa.io",{headers:{origin:"https://attacker.test"}}),config)).toThrow();
});

it("bounds native request bodies before JSON processing",async()=>{
 await expect(boundedAuthJson(new Request("https://kyaa.io",{method:"POST",headers:{"content-type":"application/json"},body:"x".repeat(3000)}))).rejects.toMatchObject({status:401});
 await expect(boundedAuthJson(new Request("https://kyaa.io",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({code:"opaque"})}))).resolves.toEqual({code:"opaque"});
});
