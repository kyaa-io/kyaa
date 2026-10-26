import { GetAccountCommand, GetEmailIdentityCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { fromTemporaryCredentials } from "@aws-sdk/credential-providers";
import type { SesV2SendClient } from "./adapters/ses-email-sender.js";

export const LEGACY_SES_ROLE_ARN = "arn:aws:iam::200151116034:role/byus-notification-prod-email-bridge";

export async function resolveSesEmailClient(roleArn?: string): Promise<SesV2SendClient | undefined> {
  if (roleArn === undefined) return undefined;
  if (roleArn !== LEGACY_SES_ROLE_ARN) throw new Error("SES_BRIDGE_ROLE_INVALID");

  const config = {
    region: "ap-northeast-2",
    maxAttempts: 1,
    requestHandler: { connectionTimeout: 2_000, requestTimeout: 8_000, throwOnRequestTimeout: true },
  };
  const primary = new SESv2Client(config);
  let reason: "primary_not_ready" | "primary_check_failed" = "primary_not_ready";
  try {
    const account = await primary.send(new GetAccountCommand({}));
    if (account.ProductionAccessEnabled && account.SendingEnabled) {
      const identity = await primary.send(new GetEmailIdentityCommand({ EmailIdentity: "kyaa.io" }));
      if (identity.VerifiedForSendingStatus) {
        console.info(JSON.stringify({ event: "ses_account_selected", account: "primary", reason: "primary_ready" }));
        return primary;
      }
    }
  } catch {
    reason = "primary_check_failed";
  }

  const legacy = new SESv2Client({
    ...config,
    credentials: fromTemporaryCredentials({
      params: { RoleArn: roleArn, RoleSessionName: "byus-notification-email", DurationSeconds: 900 },
      clientConfig: {
        region: "ap-northeast-2",
        maxAttempts: 1,
        requestHandler: { connectionTimeout: 2_000, requestTimeout: 5_000, throwOnRequestTimeout: true },
      },
    }),
  });
  try {
    await legacy.config.credentials();
  } catch {
    throw new Error("SES_BRIDGE_CREDENTIALS_UNAVAILABLE");
  }
  console.info(JSON.stringify({ event: "ses_account_selected", account: "legacy", reason }));
  return legacy;
}
