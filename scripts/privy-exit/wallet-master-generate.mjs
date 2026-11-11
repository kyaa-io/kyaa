// PRIVY-EXIT-0005: generate the member wallet master seed once per environment.
// Operator tool, run with the OperatorRoleArn of infrastructure/aws/platform/wallet-issuance.json.
// The seed exists only in memory and in the KMS-sealed secret; the script prints only the public account xpub,
// which becomes KYAA_WALLET_XPUB. It refuses to replace an existing seed (that would orphan every issued address).
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { HDKey } from "viem/accounts";

export const ACCOUNT_PATH = "m/44'/60'/0'";
export function accountFromSeed(seed) {
  if (!(seed instanceof Uint8Array) || seed.length !== 32) throw new Error("Seed must be 32 bytes");
  const account = HDKey.fromMasterSeed(seed).derive(ACCOUNT_PATH);
  return { xpub: account.publicExtendedKey };
}

export async function generateMasterSeed({ secretId, region, client }) {
  const { SecretsManagerClient, ListSecretVersionIdsCommand, PutSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
  const secrets = client ?? new SecretsManagerClient({ region });
  const versions = await secrets.send(new ListSecretVersionIdsCommand({ SecretId: secretId, IncludeDeprecated: true }));
  if ((versions.Versions ?? []).length > 0) throw new Error("A master seed already exists; refusing to replace it");
  const seed = randomBytes(32);
  const { xpub } = accountFromSeed(seed);
  await secrets.send(new PutSecretValueCommand({ SecretId: secretId, SecretString: JSON.stringify({ version: 1, seedHex: seed.toString("hex"), accountPath: ACCOUNT_PATH, xpub }) }));
  seed.fill(0);
  return xpub;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [secretId, region = "ap-northeast-2"] = process.argv.slice(2);
  if (!secretId) throw new Error("Usage: node wallet-master-generate.mjs kyaa/<env>/wallet-master-seed [region]");
  console.log(`KYAA_WALLET_XPUB=${await generateMasterSeed({ secretId, region })}`);
}
