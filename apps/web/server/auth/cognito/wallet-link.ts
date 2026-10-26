import "server-only";
import { NotFoundError, PrivyClient } from "@privy-io/node";
import { AuthError } from "../../../features/auth/domain/auth-errors";
import { loadServerEnv } from "../../config/env";
import { createPrivyNodeAccessVerifier, createPrivyNodeSessionResolver, extractEmbeddedEvmWallet } from "../privy-node-verifier";
import { syncAuthenticatedSession } from "../session-sync";
import { createSupabaseSessionSyncRepository } from "../supabase-session-sync-repository";
import { cognitoConfig } from "./config";
import { createCognitoVerifier, isCognitoToken, cognitoDenied } from "./verifier";
import { identityDatabase, linkCognitoMapping, readCognitoMapping } from "./identity-repository";
import { authHeaders, readSession, requireOrigin, rpc, writeSession } from "./browser-session";

export async function walletLink(request: Request, complete = false): Promise<Response> {
  try {
    const config=cognitoConfig(); requireOrigin(request,config);
    const {key,session}=await readSession(request,config);
    const identity=await createCognitoVerifier(config)(session.idToken,"id");
    if(!identity.email || session.enrollment?.mode === "blocked")throw cognitoDenied();
    const token=/^Bearer[ \t]+([^\s]+)$/i.exec(request.headers.get("authorization")??"")?.[1];
    if(!token || isCognitoToken(token) || token.startsWith("kyaa-email:"))throw cognitoDenied();
    const env=loadServerEnv();
    const privyConfig={appId:env.PRIVY_APP_ID,appSecret:env.PRIVY_APP_SECRET,appEnvironment:env.PRIVY_APP_ENVIRONMENT,testAccountLoginEnabled:env.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED,appleLoginEnabled:env.PRIVY_APPLE_LOGIN_ENABLED};
    if(!complete && session.enrollment?.mode==="new"){
      const verified=await createPrivyNodeAccessVerifier(privyConfig).verify(token);
      const candidate=await new PrivyClient({appId:env.PRIVY_APP_ID,appSecret:env.PRIVY_APP_SECRET}).users()._get(verified.privyUserId);
      const provider=identity.provider;
      if(candidate.id!==verified.privyUserId || !provider || !candidate.linked_accounts.some(a=>a.type===`${provider.name}_oauth` && "subject" in a && a.subject===provider.subject && typeof a.verified_at==="number" && a.verified_at>0))throw cognitoDenied();
      if(!extractEmbeddedEvmWallet(candidate,env.GIWA_CHAIN_ID)){
        const permit=session.enrollment.permit;
        if(!env.COGNITO_ENROLLMENT_ENABLED || !permit || await rpc(identityDatabase(),"cognito_initial_wallet_allowed",{p_token_hash:(await import("./browser-session")).digest(permit),p_issuer:identity.issuer,p_subject:identity.subject,p_provider_issuer:provider.issuer,p_provider_subject:provider.subject,p_verified_email:identity.email,p_privy_user_id:candidate.id})!==true)throw cognitoDenied();
        return Response.json({walletCreationAllowed:true,privyUserId:candidate.id},{headers:authHeaders()});
      }
    }
    const resolver=createPrivyNodeSessionResolver(privyConfig);
    const {identity:privyIdentity,wallet}=await resolver.resolve(token,env.GIWA_CHAIN_ID);
    if(session.enrollment?.expectedPrivyUserId && session.enrollment.expectedPrivyUserId!==privyIdentity.privyUserId)throw cognitoDenied();
    const mapping=await readCognitoMapping(identity);
    if(mapping && (mapping.privyUserId!==privyIdentity.privyUserId || mapping.walletAddress!==wallet.address)) throw new AuthError("IDENTITY_LINK_CONFLICT",409,"Account linking requires review");
    const users=new PrivyClient({appId:env.PRIVY_APP_ID,appSecret:env.PRIVY_APP_SECRET}).users();
    let user=await users._get(privyIdentity.privyUserId);
    if(session.enrollment?.mode === "new") {
      const provider=identity.provider;
      if(!provider || !user.linked_accounts.some(a=>a.type===`${provider.name}_oauth` && "subject" in a && a.subject===provider.subject && typeof a.verified_at==="number" && a.verified_at>0))throw cognitoDenied();
    }
    if(!complete){
      if(session.enrollment?.mode === "new") {
        const permit=session.enrollment.permit;
        if(!permit || await rpc(identityDatabase(),"reserve_cognito_enrollment_permit",{p_token_hash:(await import("./browser-session")).digest(permit),p_issuer:identity.issuer,p_subject:identity.subject,p_privy_user_id:privyIdentity.privyUserId,p_wallet_address:wallet.address,p_chain_id:wallet.chainId})!==true)throw cognitoDenied();
      }
      // Existing server synchronization keeps UUID and wallet ownership checks intact for new and returning fans.
      await syncAuthenticatedSession({authorization:`Bearer ${token}`,chainId:env.GIWA_CHAIN_ID,preferredLocale:session.preferredLocale??"ko",resolver,repository:createSupabaseSessionSyncRepository({url:env.SUPABASE_URL,serviceRoleKey:env.SUPABASE_SERVICE_ROLE_KEY})});
      await rpc(identityDatabase(),"link_external_auth_identity",{p_issuer:identity.issuer,p_subject:identity.subject,p_privy_user_id:privyIdentity.privyUserId,p_wallet_address:wallet.address,p_chain_id:wallet.chainId,p_verified_email:identity.email,p_permit_hash:session.enrollment?.permit ? (await import("./browser-session")).digest(session.enrollment.permit):null,p_commit:false});
      session.linkProof={privyUserId:privyIdentity.privyUserId,walletAddress:wallet.address,chainId:wallet.chainId,expiresAt:Date.now()+600_000};
      await writeSession(key,session,config);
      return Response.json({walletToken:session.idToken,privyUserId:privyIdentity.privyUserId,walletAddress:wallet.address,alreadyLinked:user.linked_accounts.some(a=>a.type==="custom_auth" && a.custom_user_id===identity.subject)},{headers:authHeaders()});
    }
    const proof=session.linkProof;
    if(!proof || proof.expiresAt<=Date.now() || proof.privyUserId!==privyIdentity.privyUserId || proof.walletAddress!==wallet.address || proof.chainId!==wallet.chainId)throw cognitoDenied();
    // The link may be visible to the browser before the server's user lookup reflects it.
    for(let attempt=0;attempt<4 && user.id===proof.privyUserId && !user.linked_accounts.some(a=>a.type==="custom_auth");attempt++){
      await new Promise(resolve=>setTimeout(resolve,500));
      user=await users._get(proof.privyUserId);
    }
    if(proof.expiresAt<=Date.now())throw cognitoDenied();
    if(user.id===proof.privyUserId && !user.linked_accounts.some(a=>a.type==="custom_auth")){
      // Query the linked subject directly when the owner's general lookup still has no link.
      try{user=await users.getByCustomAuthID({custom_user_id:identity.subject},{timeout:5_000,maxRetries:0});}
      catch(error){if(error instanceof NotFoundError)throw cognitoDenied();throw error;}
    }
    if(proof.expiresAt<=Date.now() || user.id!==proof.privyUserId || !user.linked_accounts.some(a=>a.type==="custom_auth" && a.custom_user_id===identity.subject))throw cognitoDenied();
    const linked=await linkCognitoMapping(identity,{privyUserId:proof.privyUserId,walletAddress:proof.walletAddress,chainId:proof.chainId,permit:session.enrollment?.permit});
    if(linked.privyUserId!==proof.privyUserId || linked.walletAddress!==proof.walletAddress)throw cognitoDenied();
    delete session.linkProof;await writeSession(key,session,config);
    return Response.json({linked:true},{headers:authHeaders()});
  }catch(error){return Response.json({error:{code:error instanceof AuthError?error.code:"IDENTITY_LINK_UNAVAILABLE"}},{status:error instanceof AuthError?error.status:503,headers:authHeaders()});}
}
