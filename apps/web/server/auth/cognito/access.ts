import "server-only";
import { cognitoConfig } from "./config";
import { createCognitoVerifier, cognitoDenied } from "./verifier";
import { readCognitoMapping } from "./identity-repository";

export async function resolveCognitoAccess(token: string) {
  const identity = await createCognitoVerifier(cognitoConfig())(token);
  const mapping = await readCognitoMapping(identity);
  if (!mapping) throw cognitoDenied();
  return { identity, mapping };
}
