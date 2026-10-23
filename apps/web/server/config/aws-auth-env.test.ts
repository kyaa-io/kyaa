import{expect,it,vi}from"vitest";
vi.mock("server-only",()=>({}));
import{parsePublicEnv,parseServerEnv}from"./env";
const base={NEXT_PUBLIC_APP_URL:"http://localhost:3000",NEXT_PUBLIC_PRIVY_APP_ID:"app",NEXT_PUBLIC_BYUS_DATA_ENVIRONMENT:"development",PRIVY_APP_ID:"app",PRIVY_APP_SECRET:"server-secret",BYUS_DATA_ENVIRONMENT:"development",SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"service-role-key-value",GIWA_CHAIN_ID:"91342",GIWA_RPC_URL:"https://rpc.example.test",GIWA_EXPLORER_URL:"https://explorer.example.test",BYUS_PASSPORT_CONTRACT_ADDRESS:"0x1111111111111111111111111111111111111111",BYUS_STAMP_CONTRACT_ADDRESS:"0x2222222222222222222222222222222222222222",BYUS_RELAYER_ADDRESS:"0x3333333333333333333333333333333333333333"};
const cognito={AUTH_PROVIDER:"cognito",COGNITO_USER_POOL_ID:"ap-northeast-2_social",COGNITO_CLIENT_ID:"social-client",COGNITO_DOMAIN:"https://pool.auth.ap-northeast-2.amazoncognito.com",COGNITO_REDIRECT_URI:"http://localhost:3000/api/auth/cognito/callback",COGNITO_LOGOUT_URI:"http://localhost:3000/login",AUTH_COOKIE_SECRET:Buffer.alloc(32,7).toString("base64")};
it("keeps legacy authentication, cron and storage defaults unchanged",()=>{
 expect(parseServerEnv(base)).toMatchObject({AUTH_PROVIDER:"privy",EMAIL_AUTH_PROVIDER:"legacy",LEGACY_EMAIL_AUTH_ENABLED:true,CRON_OWNER:"vercel",AWS_STORAGE_ENABLED:false});
 expect(Object.keys(parsePublicEnv({...base,...cognito}))).not.toContain("AUTH_COOKIE_SECRET");
});
it("requires separate email pools, canonical callbacks and a full encryption key",()=>{
 const email={...base,...cognito,EMAIL_AUTH_PROVIDER:"cognito",COGNITO_EMAIL_USER_POOL_ID:"ap-northeast-2_email",COGNITO_EMAIL_CLIENT_ID:"email-client",LEGACY_EMAIL_AUTH_ENABLED:"false"};
 expect(parseServerEnv(email).LEGACY_EMAIL_AUTH_ENABLED).toBe(false);
 for(const wrong of [{COGNITO_EMAIL_USER_POOL_ID:"ap-northeast-2_social"},{COGNITO_EMAIL_CLIENT_ID:""},{COGNITO_REDIRECT_URI:"https://attacker.example/api/auth/cognito/callback"},{AUTH_COOKIE_SECRET:"short"}])expect(()=>parseServerEnv({...email,...wrong})).toThrow();
 expect(()=>parseServerEnv({...base,LEGACY_EMAIL_AUTH_ENABLED:"false"})).toThrow();
});
it("requires paired PostgREST credentials and distinct configured S3 buckets",()=>{
 expect(()=>parseServerEnv({...base,POSTGREST_URL:"http://127.0.0.1:3001"})).toThrow();
 expect(parseServerEnv({...base,POSTGREST_URL:"http://127.0.0.1:3001",POSTGREST_SERVICE_TOKEN:"a".repeat(40)}).POSTGREST_URL).toBe("http://127.0.0.1:3001");
 expect(()=>parseServerEnv({...base,AWS_STORAGE_ENABLED:"true"})).toThrow();
 expect(()=>parseServerEnv({...base,AWS_STORAGE_ENABLED:"true",AWS_REGION:"ap-northeast-2",S3_PUBLIC_BUCKET:"same-bucket",S3_PRIVATE_BUCKET:"same-bucket",ASSET_PUBLIC_BASE_URL:"https://assets.example.test"})).toThrow();
});

it("removes Supabase credentials only after every AWS data and Cognito-email condition is configured",()=>{
 const {SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,...withoutLegacy}=base;
 expect(SUPABASE_URL).toBeTruthy();expect(SUPABASE_SERVICE_ROLE_KEY).toBeTruthy();
 const full={...withoutLegacy,...cognito,EMAIL_AUTH_PROVIDER:"cognito",LEGACY_EMAIL_AUTH_ENABLED:"false",COGNITO_EMAIL_USER_POOL_ID:"ap-northeast-2_email",COGNITO_EMAIL_CLIENT_ID:"email-client",POSTGREST_URL:"http://127.0.0.1:3001",POSTGREST_SERVICE_TOKEN:"a".repeat(40),AWS_STORAGE_ENABLED:"true",AWS_REGION:"ap-northeast-2",S3_PUBLIC_BUCKET:"public-bucket",S3_PRIVATE_BUCKET:"private-bucket",ASSET_PUBLIC_BASE_URL:"https://assets.example.test"};
 expect(parseServerEnv(full).SUPABASE_URL).toBeUndefined();
 for(const missing of ["POSTGREST_SERVICE_TOKEN","ASSET_PUBLIC_BASE_URL","COGNITO_EMAIL_USER_POOL_ID"]){expect(()=>parseServerEnv({...full,[missing]:undefined})).toThrow();}
 expect(()=>parseServerEnv({...full,LEGACY_EMAIL_AUTH_ENABLED:"true"})).toThrow();
 expect(()=>parseServerEnv({...full,AWS_STORAGE_ENABLED:"false"})).toThrow();
});

it("webhook buffering is opt-in and enabled configuration binds the exact account and environment",()=>{
 expect(parseServerEnv(base).WEBHOOK_BUFFER_ENABLED).toBe(false);
 expect(()=>parseServerEnv({...base,WEBHOOK_BUFFER_ENABLED:"true"})).toThrow();
 const buffering={...base,APP_ENV:"dev",WEBHOOK_BUFFER_ENABLED:"true",WEBHOOK_BUFFER_QUEUE_URL:"https://sqs.ap-northeast-2.amazonaws.com/996702758024/byus-webhook-buffer-dev.fifo",WEBHOOK_BUFFER_BUCKET:"byus-webhooks-dev-996702758024",WEBHOOK_BUFFER_KMS_KEY_ID:"arn:aws:kms:ap-northeast-2:996702758024:key/11111111-1111-1111-1111-111111111111"};
 expect(parseServerEnv(buffering).WEBHOOK_BUFFER_ENABLED).toBe(true);
 expect(()=>parseServerEnv({...buffering,WEBHOOK_BUFFER_QUEUE_URL:buffering.WEBHOOK_BUFFER_QUEUE_URL.replace("-dev.","-prod.")})).toThrow();
 expect(()=>parseServerEnv({...base,WEBHOOK_BUFFER_ENABLED:"yes"})).toThrow();
});
