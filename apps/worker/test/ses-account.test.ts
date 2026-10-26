import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(), credentials: vi.fn(), clients: [] as Array<{ send: ReturnType<typeof vi.fn>; config: { credentials: ReturnType<typeof vi.fn> } }>,
  provider: vi.fn(), constructor: vi.fn(),
}));
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send = mocks.send;
    config = { credentials: mocks.credentials };
    constructor(config: unknown) { mocks.constructor(config); mocks.clients.push(this); }
  },
  GetAccountCommand: class { constructor(public input: unknown) {} },
  GetEmailIdentityCommand: class { constructor(public input: unknown) {} },
}));
vi.mock("@aws-sdk/credential-providers", () => ({ fromTemporaryCredentials: mocks.provider }));

import { GetAccountCommand, GetEmailIdentityCommand } from "@aws-sdk/client-sesv2";
import { LEGACY_SES_ROLE_ARN, resolveSesEmailClient } from "../src/ses-account.js";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.clients.length = 0;
  mocks.credentials.mockResolvedValue({ accessKeyId: "private-key", secretAccessKey: "private-secret" });
  mocks.provider.mockReturnValue(mocks.credentials);
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

function expectSelection(account: "primary" | "legacy", reason: string) {
  expect(console.info).toHaveBeenCalledExactlyOnceWith(JSON.stringify({ event: "ses_account_selected", account, reason }));
}

it("keeps the default sender without creating clients or providers when unset", async () => {
  await expect(resolveSesEmailClient()).resolves.toBeUndefined();
  expect(mocks.constructor).not.toHaveBeenCalled();
  expect(mocks.provider).not.toHaveBeenCalled();
  expect(console.info).not.toHaveBeenCalled();
});

it.each(["", "arn:aws:iam::123456789012:role/private-role"])("rejects unapproved role %s before client creation", async (role) => {
  await expect(resolveSesEmailClient(role)).rejects.toThrow("SES_BRIDGE_ROLE_INVALID");
  expect(mocks.constructor).not.toHaveBeenCalled();
  expect(mocks.provider).not.toHaveBeenCalled();
  expect(console.info).not.toHaveBeenCalled();
});

it("selects the primary only after production, sending and domain readiness checks", async () => {
  mocks.send.mockResolvedValueOnce({ ProductionAccessEnabled: true, SendingEnabled: true }).mockResolvedValueOnce({ VerifiedForSendingStatus: true });
  await expect(resolveSesEmailClient(LEGACY_SES_ROLE_ARN)).resolves.toBe(mocks.clients[0]);
  expect(mocks.send.mock.calls[0]?.[0]).toBeInstanceOf(GetAccountCommand);
  expect(mocks.send.mock.calls[1]?.[0]).toBeInstanceOf(GetEmailIdentityCommand);
  expect(mocks.send.mock.calls[1]?.[0].input).toEqual({ EmailIdentity: "kyaa.io" });
  expect(mocks.send).toHaveBeenCalledTimes(2);
  expect(mocks.provider).not.toHaveBeenCalled();
  expect(mocks.credentials).not.toHaveBeenCalled();
  expectSelection("primary", "primary_ready");
});

it.each([
  [{ ProductionAccessEnabled: false, SendingEnabled: true }, undefined, 1],
  [{ ProductionAccessEnabled: true, SendingEnabled: false }, undefined, 1],
  [{ ProductionAccessEnabled: true, SendingEnabled: true }, { VerifiedForSendingStatus: false }, 2],
  [{}, undefined, 1],
])("selects legacy before any send when readiness is missing: %j", async (account, identity, calls) => {
  mocks.send.mockResolvedValueOnce(account).mockResolvedValueOnce(identity);
  const result = await resolveSesEmailClient(LEGACY_SES_ROLE_ARN);
  expect(result).toBe(mocks.clients[1]);
  expect(mocks.send).toHaveBeenCalledTimes(calls);
  expect(mocks.credentials).toHaveBeenCalledOnce();
  expect(mocks.provider).toHaveBeenCalledExactlyOnceWith({
    params: { RoleArn: LEGACY_SES_ROLE_ARN, RoleSessionName: "byus-notification-email", DurationSeconds: 900 },
    clientConfig: { region: "ap-northeast-2", maxAttempts: 1, requestHandler: { connectionTimeout: 2000, requestTimeout: 5000, throwOnRequestTimeout: true } },
  });
  expect(mocks.constructor).toHaveBeenNthCalledWith(1, { region: "ap-northeast-2", maxAttempts: 1, requestHandler: { connectionTimeout: 2000, requestTimeout: 8000, throwOnRequestTimeout: true } });
  expect(mocks.constructor).toHaveBeenNthCalledWith(2, { region: "ap-northeast-2", maxAttempts: 1, requestHandler: { connectionTimeout: 2000, requestTimeout: 8000, throwOnRequestTimeout: true }, credentials: mocks.credentials });
  expectSelection("legacy", "primary_not_ready");
});

it.each(["account", "identity"])("uses legacy on %s check error without exposing provider details", async (stage) => {
  if (stage === "identity") mocks.send.mockResolvedValueOnce({ ProductionAccessEnabled: true, SendingEnabled: true });
  mocks.send.mockRejectedValueOnce(new Error("private-secret https://private-provider.test"));
  const result = await resolveSesEmailClient(LEGACY_SES_ROLE_ARN);
  expect(result).toBe(mocks.clients[1]);
  expect(mocks.credentials).toHaveBeenCalledOnce();
  expectSelection("legacy", "primary_check_failed");
});

it("awaits credentials and sanitizes STS errors before returning a sender", async () => {
  mocks.send.mockResolvedValueOnce({ ProductionAccessEnabled: false });
  mocks.credentials.mockRejectedValueOnce(new Error("private STS token https://private-provider.test"));
  await expect(resolveSesEmailClient(LEGACY_SES_ROLE_ARN)).rejects.toThrow(/^SES_BRIDGE_CREDENTIALS_UNAVAILABLE$/);
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(console.info).not.toHaveBeenCalled();
});
