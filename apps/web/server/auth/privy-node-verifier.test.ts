import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createPrivyNodeAccessVerifier,
  createPrivyNodeSessionResolver,
  extractEmbeddedEvmWallet,
} from "./privy-node-verifier";

describe("@privy-io/node server adapter", () => {
  it("verifies the access token and resolves the same Privy user's Google email", async () => {
    const verifyAccessToken = vi.fn().mockResolvedValue({
      app_id: "app-1",
      user_id: "did:privy:user-1",
    });
    const getUser = vi.fn().mockResolvedValue({
      id: "did:privy:user-1",
      linked_accounts: [
        { type: "google_oauth", email: "old@example.com", verified_at: 10 },
        { type: "google_oauth", email: "fan@example.com", verified_at: 20 },
      ],
    });
    const verifier = createPrivyNodeAccessVerifier(
      { appId: "app-1", appSecret: "secret", appleLoginEnabled: false },
      {
        utils: () => ({ auth: () => ({ verifyAccessToken }) }),
        users: () => ({ _get: getUser }),
      },
    );

    await expect(verifier.verify("access-token")).resolves.toEqual({
      privyUserId: "did:privy:user-1",
      verifiedEmail: "fan@example.com",
      googleLinked: true,
      providerAccounts: [],
    });
    expect(getUser).toHaveBeenCalledWith("did:privy:user-1");
  });

  it.each([
    ["fan@example.com", "fan@example.com"],
    ["fan.opaque@privaterelay.appleid.com", "fan.opaque@privaterelay.appleid.com"],
  ])("accepts a verified Apple OAuth email, including relay addresses: %s", async (email, expected) => {
    const verifier = createPrivyNodeAccessVerifier({
      appId: "app-1",
      appSecret: "secret",
      appleLoginEnabled: true,
    }, {
      utils: () => ({ auth: () => ({ verifyAccessToken: vi.fn().mockResolvedValue({ app_id: "app-1", user_id: "did:privy:apple-1" }) }) }),
      users: () => ({ _get: vi.fn().mockResolvedValue({
        id: "did:privy:apple-1",
        linked_accounts: [{ type: "apple_oauth", email, verified_at: 20 }],
      }) }),
    });

    await expect(verifier.verify("access-token")).resolves.toEqual({
      privyUserId: "did:privy:apple-1",
      verifiedEmail: expected,
      googleLinked: false,
      providerAccounts: [],
    });
  });

  it("keeps verified Google ahead of Apple and preserves Google provenance", async () => {
    const verifier = createPrivyNodeAccessVerifier({
      appId: "app-1",
      appSecret: "secret",
      appleLoginEnabled: true,
    }, {
      utils: () => ({ auth: () => ({ verifyAccessToken: vi.fn().mockResolvedValue({ app_id: "app-1", user_id: "did:privy:mixed-1" }) }) }),
      users: () => ({ _get: vi.fn().mockResolvedValue({
        id: "did:privy:mixed-1",
        linked_accounts: [
          { type: "apple_oauth", email: "apple@example.com", verified_at: 30 },
          { type: "google_oauth", email: "google@example.com", verified_at: 10 },
        ],
      }) }),
    });

    await expect(verifier.verify("access-token")).resolves.toEqual({
      privyUserId: "did:privy:mixed-1",
      verifiedEmail: "google@example.com",
      googleLinked: true,
      providerAccounts: [],
    });
  });

  it.each([
    [{ type: "apple_oauth", email: null, verified_at: 20 }, true, "missing email"],
    [{ type: "apple_oauth", email: "fan@example.com" }, true, "unverified email"],
    [{ type: "apple_oauth", email: "fan@example.com", verified_at: 20 }, false, "disabled policy"],
  ])("rejects Apple OAuth with %s when policy enabled=%s (%s)", async (linkedAccount, appleLoginEnabled, _reason) => {
    const verifier = createPrivyNodeAccessVerifier({
      appId: "app-1",
      appSecret: "secret",
      appleLoginEnabled,
    }, {
      utils: () => ({ auth: () => ({ verifyAccessToken: vi.fn().mockResolvedValue({ app_id: "app-1", user_id: "did:privy:apple-1" }) }) }),
      users: () => ({ _get: vi.fn().mockResolvedValue({ id: "did:privy:apple-1", linked_accounts: [linkedAccount] }) }),
    });

    await expect(verifier.verify("access-token")).resolves.toMatchObject({
      verifiedEmail: null,
      googleLinked: false,
      providerAccounts: [],
    });
  });

  it("rejects a provider response whose user does not match the token subject", async () => {
    const verifier = createPrivyNodeAccessVerifier(
      { appId: "app-1", appSecret: "secret", appleLoginEnabled: false },
      {
        utils: () => ({
          auth: () => ({
            verifyAccessToken: vi.fn().mockResolvedValue({
              app_id: "app-1",
              user_id: "did:privy:user-1",
            }),
          }),
        }),
        users: () => ({
          _get: vi.fn().mockResolvedValue({
            id: "did:privy:user-2",
            linked_accounts: [],
          }),
        }),
      },
    );

    await expect(verifier.verify("access-token")).rejects.toThrow(/subject mismatch/i);
  });

  it("accepts only a verified @privy.io email account behind the development Test Account policy", async () => {
    const client = {
      utils: () => ({ auth: () => ({ verifyAccessToken: vi.fn().mockResolvedValue({ app_id: "app-1", user_id: "did:privy:test-1" }) }) }),
      users: () => ({ _get: vi.fn().mockResolvedValue({
        id: "did:privy:test-1",
        linked_accounts: [{ type: "email", address: "test-8129@privy.io", verified_at: 20 }],
      }) }),
    };

    await expect(createPrivyNodeAccessVerifier({
      appId: "app-1",
      appSecret: "secret", appleLoginEnabled: false,
      appEnvironment: "development",
      testAccountLoginEnabled: true,
    }, client).verify("access-token")).resolves.toEqual({
      privyUserId: "did:privy:test-1",
      verifiedEmail: "test-8129@privy.io",
      googleLinked: false,
      providerAccounts: [],
    });
    await expect(createPrivyNodeAccessVerifier({
      appId: "app-1",
      appSecret: "secret", appleLoginEnabled: false,
      appEnvironment: "development",
      testAccountLoginEnabled: false,
    }, client).verify("access-token")).resolves.toEqual({
      privyUserId: "did:privy:test-1",
      verifiedEmail: null,
      googleLinked: false,
      providerAccounts: [],
    });
  });

  it.each([
    [{ type: "email", address: "fan@example.com", verified_at: 20 }, "non-Privy domain"],
    [{ type: "email", address: "test-8129@privy.io" }, "unverified account"],
  ])("rejects a %s as a Test Account identity", async (linkedAccount, _reason) => {
    const verifier = createPrivyNodeAccessVerifier({
      appId: "app-1",
      appSecret: "secret", appleLoginEnabled: false,
      appEnvironment: "development",
      testAccountLoginEnabled: true,
    }, {
      utils: () => ({ auth: () => ({ verifyAccessToken: vi.fn().mockResolvedValue({ app_id: "app-1", user_id: "did:privy:test-1" }) }) }),
      users: () => ({ _get: vi.fn().mockResolvedValue({ id: "did:privy:test-1", linked_accounts: [linkedAccount] }) }),
    });
    await expect(verifier.verify("access-token")).resolves.toMatchObject({ verifiedEmail: null });
  });

  it("fails closed if Test Account policy is paired with a production Privy app", async () => {
    const verifier = createPrivyNodeAccessVerifier({
      appId: "app-1",
      appSecret: "secret", appleLoginEnabled: false,
      appEnvironment: "production",
      testAccountLoginEnabled: true,
    }, {
      utils: () => ({ auth: () => ({ verifyAccessToken: vi.fn().mockResolvedValue({ app_id: "app-1", user_id: "did:privy:test-1" }) }) }),
      users: () => ({ _get: vi.fn().mockResolvedValue({
        id: "did:privy:test-1",
        linked_accounts: [{ type: "email", address: "test-8129@privy.io", verified_at: 20 }],
      }) }),
    });
    await expect(verifier.verify("access-token")).rejects.toThrow(/development Privy app/i);
  });

  it("maps a Privy embedded EVM wallet to the configured GIWA chain", () => {
    expect(
      extractEmbeddedEvmWallet(
        {
          id: "did:privy:user-1",
          linked_accounts: [
            {
              type: "wallet",
              chain_type: "ethereum",
              connector_type: "embedded",
              wallet_client: "privy",
              address: "0xEEE82F960476C888950C798C444C1FD92CBBFE50",
            },
          ],
        },
        91342,
      ),
    ).toEqual({
      chainId: 91342,
      address: "0xeee82f960476c888950c798c444c1fd92cbbfe50",
    });
  });

  it("waits for Privy's newly provisioned embedded wallet to become visible", async () => {
    const verifyAccessToken = vi.fn().mockResolvedValue({
      app_id: "app-1",
      user_id: "did:privy:user-1",
    });
    const getUser = vi
      .fn()
      .mockResolvedValueOnce({
        id: "did:privy:user-1",
        linked_accounts: [
          { type: "google_oauth", email: "fan@example.com", verified_at: 20 },
        ],
      })
      .mockResolvedValueOnce({
        id: "did:privy:user-1",
        linked_accounts: [
          { type: "google_oauth", email: "fan@example.com", verified_at: 20 },
          {
            type: "wallet",
            chain_type: "ethereum",
            connector_type: "embedded",
            wallet_client: "privy",
            address: "0xEEE82F960476C888950C798C444C1FD92CBBFE50",
          },
        ],
      });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const resolver = createPrivyNodeSessionResolver(
      { appId: "app-1", appSecret: "secret", appleLoginEnabled: false },
      {
        utils: () => ({ auth: () => ({ verifyAccessToken }) }),
        users: () => ({ _get: getUser }),
      },
      { walletVisibilityAttempts: 2, walletVisibilityDelayMs: 750, sleep },
    );

    await expect(resolver.resolve("access-token", 91342)).resolves.toEqual({
      identity: {
        privyUserId: "did:privy:user-1",
        verifiedEmail: "fan@example.com",
        googleLinked: true,
        providerAccounts: [],
      },
      wallet: {
        chainId: 91342,
        address: "0xeee82f960476c888950c798c444c1fd92cbbfe50",
      },
    });
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
    expect(sleep).toHaveBeenCalledWith(750);
  });

  it("keeps the default session sync open through a slower wallet propagation window", async () => {
    const withoutWallet = {
      id: "did:privy:user-1",
      linked_accounts: [
        { type: "google_oauth", email: "fan@example.com", verified_at: 20 },
      ],
    };
    const getUser = vi
      .fn()
      .mockResolvedValueOnce(withoutWallet)
      .mockResolvedValueOnce(withoutWallet)
      .mockResolvedValueOnce(withoutWallet)
      .mockResolvedValueOnce(withoutWallet)
      .mockResolvedValueOnce(withoutWallet)
      .mockResolvedValueOnce(withoutWallet)
      .mockResolvedValueOnce(withoutWallet)
      .mockResolvedValueOnce(withoutWallet)
      .mockResolvedValueOnce(withoutWallet)
      .mockResolvedValueOnce({
        id: "did:privy:user-1",
        linked_accounts: [
          { type: "google_oauth", email: "fan@example.com", verified_at: 20 },
          {
            type: "wallet",
            chain_type: "ethereum",
            connector_type: "embedded",
            wallet_client: "privy",
            address: "0xEEE82F960476C888950C798C444C1FD92CBBFE50",
          },
        ],
      });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const resolver = createPrivyNodeSessionResolver(
      { appId: "app-1", appSecret: "secret", appleLoginEnabled: false },
      {
        utils: () => ({ auth: () => ({ verifyAccessToken: vi.fn().mockResolvedValue({ app_id: "app-1", user_id: "did:privy:user-1" }) }) }),
        users: () => ({ _get: getUser }),
      },
      { sleep },
    );

    await expect(resolver.resolve("access-token", 91342)).resolves.toMatchObject({
      wallet: { chainId: 91342 },
    });
    expect(getUser).toHaveBeenCalledTimes(10);
    expect(sleep).toHaveBeenCalledTimes(9);
  });
});

const providerWallet = { type: "wallet", chain_type: "ethereum", connector_type: "embedded", wallet_client: "privy", address: `0x${"1".repeat(40)}` };
const providerConfig = { appId: "app-1", appSecret: "secret", appleLoginEnabled: true };
const verifiedProviders = [
  { issuer: "https://accounts.google.com", subject: "google-subject" },
  { issuer: "https://appleid.apple.com", subject: "apple-subject" },
  { issuer: "https://accounts.google.com", subject: "second-google" },
];
it("carries every verified provider subject from the token owner's server record in both access and session identities", async () => {
  const getUser = vi.fn().mockResolvedValue({ id: "did:privy:user-1", linked_accounts: [
    { type: "google_oauth", subject: "google-subject", email: "fan@example.com", verified_at: 20 },
    { type: "apple_oauth", subject: "apple-subject", verified_at: 30 },
    { type: "google_oauth", subject: "second-google", verified_at: 10 },
    providerWallet,
  ] });
  const client = {
    utils: () => ({ auth: () => ({ verifyAccessToken: vi.fn().mockResolvedValue({ app_id: "app-1", user_id: "did:privy:user-1" }) }) }),
    users: () => ({ _get: getUser }),
  };
  await expect(createPrivyNodeAccessVerifier(providerConfig, client).verify("token")).resolves.toMatchObject({ providerAccounts: verifiedProviders });
  await expect(createPrivyNodeSessionResolver(providerConfig, client).resolve("token", 91342)).resolves.toMatchObject({ identity: { providerAccounts: verifiedProviders } });
  expect(getUser).toHaveBeenNthCalledWith(1, "did:privy:user-1");
  expect(getUser).toHaveBeenNthCalledWith(2, "did:privy:user-1");
});
it.each([
  { type: "google_oauth", subject: "unverified" },
  { type: "apple_oauth", subject: "zero", verified_at: 0 },
  { type: "google_oauth", subject: "nan", verified_at: NaN },
  { type: "apple_oauth", subject: "infinite", verified_at: Infinity },
  { type: "google_oauth", subject: "", verified_at: 20 },
  { type: "apple_oauth", subject: "   ", verified_at: 20 },
  { type: "google_oauth", subject: 123, verified_at: 20 },
  { type: "apple_oauth", subject: "x".repeat(257), verified_at: 20 },
  { type: "email", subject: "email-is-not-provider", verified_at: 20 },
])("does not promote an unverified or malformed provider claim: %j", async (account) => {
  const client = {
    utils: () => ({ auth: () => ({ verifyAccessToken: vi.fn().mockResolvedValue({ app_id: "app-1", user_id: "did:privy:user-1" }) }) }),
    users: () => ({ _get: vi.fn().mockResolvedValue({ id: "did:privy:user-1", linked_accounts: [
      { type: "google_oauth", email: "fan@example.com", verified_at: 10 }, account, providerWallet,
    ] }) }),
  };
  await expect(createPrivyNodeSessionResolver(providerConfig, client).resolve("token", 91342)).resolves.toMatchObject({ identity: { providerAccounts: [] } });
});
it("never carries claims from a different Privy owner into session synchronization", async () => {
  const client = {
    utils: () => ({ auth: () => ({ verifyAccessToken: vi.fn().mockResolvedValue({ app_id: "app-1", user_id: "did:privy:user-1" }) }) }),
    users: () => ({ _get: vi.fn().mockResolvedValue({ id: "did:privy:other", linked_accounts: [
      { type: "google_oauth", subject: "other-subject", email: "fan@example.com", verified_at: 20 }, providerWallet,
    ] }) }),
  };
  await expect(createPrivyNodeSessionResolver(providerConfig, client).resolve("token", 91342)).rejects.toThrow("subject mismatch");
});
