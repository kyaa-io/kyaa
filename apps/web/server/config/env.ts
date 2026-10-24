import "server-only";

import { z } from "zod";
import { isAwsHosting, runtimeEnvironment } from "./hosting";
import { bufferConfig } from "../webhook-intake/core";

type EnvironmentSource = Record<string, string | undefined>;

const FORBIDDEN_ENV_KEYS = new Set([
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "PASSPORT_CONTRACT_ADDRESS",
  "AWS_ACCESS_KEY_ID",
  "AWS_S3_BUCKET",
  "AWS_SECRET_ACCESS_KEY",
  "GIWA_RELAYER_PRIVATE_KEY",
  "PINATA_GATEWAY_URL",
  "PINATA_JWT",
  "PRIVY_SECRET",
  "RELAYER_PRIVATE_KEY",
  "STAMP_CONTRACT_ADDRESS",
  "SUPABASE_ANON_KEY",
]);

const evmAddress = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{40}$/, "must be a canonical 0x-prefixed EVM address");

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isSecureAppUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      return false;
    }
    return (
      url.protocol === "https:" ||
      (url.protocol === "http:" && url.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

const httpsUrl = z.string().trim().refine(isHttpsUrl, "must be an HTTPS URL");
const optionalNonEmptyString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);
const booleanFlag = z.enum(["true", "false"]).default("false").transform((value) => value === "true");
const privyAppEnvironment = z.enum(["development", "production"]).default("production");
const dataEnvironment = z.enum(["development", "production"]);
const telegramSecret = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(32).max(256).regex(/^[A-Za-z0-9_-]+$/).optional(),
);
const PRODUCTION_SUPABASE_HOSTNAME = "gmrykvmtmuaeswpajteq.supabase.co";

function isProductionHostname(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "byus.kr" || hostname === "www.byus.kr" ||
      hostname === "kyaa.io" || hostname === "www.kyaa.io";
  } catch {
    return false;
  }
}

const publicEnvSchema = z
  .object({
    NEXT_PUBLIC_APP_URL: z
      .string()
      .trim()
      .refine(isSecureAppUrl, "must be HTTPS, except for an HTTP localhost app URL"),
    NEXT_PUBLIC_PRIVY_APP_ID: z.string().trim().min(1),
    NEXT_PUBLIC_BYUS_DATA_ENVIRONMENT: dataEnvironment,
    NEXT_PUBLIC_PRIVY_APP_ENVIRONMENT: privyAppEnvironment,
    NEXT_PUBLIC_PRIVY_APPLE_LOGIN_ENABLED: booleanFlag,
    NEXT_PUBLIC_PRIVY_TEST_ACCOUNT_LOGIN_ENABLED: booleanFlag,
  })
  .superRefine((value, context) => {
    if (
      value.NEXT_PUBLIC_PRIVY_TEST_ACCOUNT_LOGIN_ENABLED &&
      (value.NEXT_PUBLIC_PRIVY_APP_ENVIRONMENT !== "development" ||
        isProductionHostname(value.NEXT_PUBLIC_APP_URL))
    ) {
      context.addIssue({
        code: "custom",
        message: "Privy Test Account login is restricted to a non-production Privy app and URL",
        path: ["NEXT_PUBLIC_PRIVY_TEST_ACCOUNT_LOGIN_ENABLED"],
      });
    }
  });

const serverEnvSchema = publicEnvSchema
  .extend({
    MEDIA_WORKER_FUNCTION_ARN: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^arn:aws:lambda:ap-northeast-2:996702758024:function:byus-media-(dev|staging|prod)$/).optional()),
    CRON_OWNER: z.enum(["vercel", "aws", "disabled"]).default("vercel"),
    WEBHOOK_INGRESS_HOLD: booleanFlag,
    WEBHOOK_BUFFER_ENABLED: booleanFlag,
    WEBHOOK_REPLAY_ENABLED: booleanFlag,
    WEBHOOK_BUFFER_QUEUE_URL: optionalNonEmptyString,
    WEBHOOK_BUFFER_BUCKET: optionalNonEmptyString,
    WEBHOOK_BUFFER_KMS_KEY_ID: optionalNonEmptyString,
    WEBHOOK_DB_SECRET_ARN: optionalNonEmptyString,
    WEBHOOK_BUFFER_INSTAGRAM_SECRET_SHA256: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^[a-f0-9]{64}$/).optional()),
    AUTH_PROVIDER: z.enum(["privy", "cognito"]).default("privy"),
    LEGACY_EMAIL_AUTH_ENABLED: z.enum(["true", "false"]).default("true").transform((value) => value === "true"),
    EMAIL_AUTH_PROVIDER: z.enum(["legacy", "cognito"]).default("legacy"),
    COGNITO_EMAIL_USER_POOL_ID: optionalNonEmptyString,
    COGNITO_EMAIL_CLIENT_ID: optionalNonEmptyString,
    COGNITO_ENROLLMENT_ENABLED: booleanFlag,
    COGNITO_NATIVE_REDIRECT_URI: optionalNonEmptyString,
    COGNITO_USER_POOL_ID: optionalNonEmptyString,
    COGNITO_CLIENT_ID: optionalNonEmptyString,
    COGNITO_DOMAIN: optionalNonEmptyString,
    COGNITO_REDIRECT_URI: optionalNonEmptyString,
    COGNITO_LOGOUT_URI: optionalNonEmptyString,
    AUTH_COOKIE_SECRET: z.preprocess((v) => v === "" ? undefined : v, z.string().refine((v) => /^[A-Za-z0-9+/]{43}=$/.test(v) && Buffer.from(v, "base64").length === 32, "must be a 32-byte base64 secret").optional()),
    POSTGREST_URL: optionalNonEmptyString,
    POSTGREST_SERVICE_TOKEN: optionalNonEmptyString,
    AWS_STORAGE_ENABLED: booleanFlag,
    AWS_REGION: optionalNonEmptyString,
    S3_PUBLIC_BUCKET: optionalNonEmptyString,
    S3_PRIVATE_BUCKET: optionalNonEmptyString,
    ASSET_PUBLIC_BASE_URL: optionalNonEmptyString,
    PRIVY_APP_ID: z.string().trim().min(1),
    PRIVY_APP_SECRET: z.string().trim().min(8),
    BYUS_DATA_ENVIRONMENT: dataEnvironment,
    PRIVY_APP_ENVIRONMENT: privyAppEnvironment,
    PRIVY_APPLE_LOGIN_ENABLED: booleanFlag,
    PRIVY_TEST_ACCOUNT_LOGIN_ENABLED: booleanFlag,
    SUPABASE_URL: z.preprocess((value) => value === "" ? undefined : value, httpsUrl.optional()),
    SUPABASE_SERVICE_ROLE_KEY: z.preprocess((value) => value === "" ? undefined : value, z.string().trim().min(16).optional()),
    REQUEST_HASH_SECRET: z.preprocess((value) => value === "" ? undefined : value, z.string().min(16).optional()),
    LEGACY_DOMAIN_REDIRECT_STATUS: z.preprocess(
      (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
      z.enum(["307", "308"]).optional(),
    ),
    GOOGLE_TRANSLATION_API_KEY: optionalNonEmptyString,
    GIWA_CHAIN_ID: z.coerce.number().int().refine((value) => value === 91342),
    GIWA_RPC_URL: httpsUrl,
    GIWA_EXPLORER_URL: httpsUrl,
    BYUS_PASSPORT_CONTRACT_ADDRESS: evmAddress,
    BYUS_STAMP_CONTRACT_ADDRESS: evmAddress,
    BYUS_RELAYER_ADDRESS: evmAddress,
    KAKAO_OAUTH_MODE: z.enum(["test_sink", "provider"]).default("test_sink"),
    KAKAO_CLIENT_ID: optionalNonEmptyString,
    KAKAO_CLIENT_SECRET: optionalNonEmptyString,
    KAKAO_REDIRECT_URI: optionalNonEmptyString,
    KAKAO_TEST_SINK_SECRET: z.preprocess(
      (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
      z.string().min(16).optional(),
    ),
    KAKAO_ALIMTALK_ENROLLMENT_ENABLED: booleanFlag,
    PHONE_SMS_ENROLLMENT_MODE: z.enum(["disabled", "solapi"]).default("disabled"),
    PHONE_SMS_SOLAPI_API_KEY: optionalNonEmptyString,
    PHONE_SMS_SOLAPI_API_SECRET: optionalNonEmptyString,
    PHONE_SMS_SENDER: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^\d{8,12}$/).optional()),
    PHONE_SMS_OTP_SECRET: z.preprocess((value) => value === "" ? undefined : value, z.string().min(32).max(256).optional()),
    SOLAPI_WEBHOOK_SECRET: z.preprocess(
      (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
      z.string().min(16).max(256).optional(),
    ),
    TELEGRAM_BUG_REPORT_BOT_TOKEN: z.preprocess(
      (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
      z.string().trim().regex(/^\d{8,12}:[A-Za-z0-9_-]{30,}$/).optional(),
    ),
    TELEGRAM_BUG_REPORT_WEBHOOK_SECRET: telegramSecret,
    TELEGRAM_BUG_REPORT_OPERATOR_SECRET: telegramSecret,
    CHZZK_CLIENT_ID: optionalNonEmptyString,
    CHZZK_CLIENT_SECRET: optionalNonEmptyString,
    CHZZK_LIVE_ENABLED: booleanFlag,
  })
  .superRefine((value, context) => {
    const issue = (key: string, message: string) => context.addIssue({ code: "custom", message, path: [key] });
    const awsOnly = Boolean(value.POSTGREST_URL && value.POSTGREST_SERVICE_TOKEN && value.AWS_STORAGE_ENABLED && !value.LEGACY_EMAIL_AUTH_ENABLED && value.EMAIL_AUTH_PROVIDER === "cognito");
    if (!awsOnly) {
      if (!value.SUPABASE_URL) issue("SUPABASE_URL", "required while legacy database, storage or email authentication is enabled");
      if (!value.SUPABASE_SERVICE_ROLE_KEY) issue("SUPABASE_SERVICE_ROLE_KEY", "required while legacy database, storage or email authentication is enabled");
    }
    if (Boolean(value.SUPABASE_URL) !== Boolean(value.SUPABASE_SERVICE_ROLE_KEY)) issue("SUPABASE_URL", "Supabase URL and key must be configured together");
    if (Boolean(value.POSTGREST_URL) !== Boolean(value.POSTGREST_SERVICE_TOKEN)) issue("POSTGREST_URL", "PostgREST URL and service token must be provided together");
    if (value.POSTGREST_SERVICE_TOKEN && value.POSTGREST_SERVICE_TOKEN.length < 40) issue("POSTGREST_SERVICE_TOKEN", "must contain at least 40 characters");
    if (value.POSTGREST_URL) {
      try {
        const url = new URL(value.POSTGREST_URL);
        if (url.username || url.password || url.search || url.hash || !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)))) throw new Error();
      } catch { issue("POSTGREST_URL", "must be HTTPS or a loopback HTTP sidecar URL without credentials, query or hash"); }
    }
    if (value.AWS_STORAGE_ENABLED) {
      for (const key of ["AWS_REGION", "S3_PUBLIC_BUCKET", "S3_PRIVATE_BUCKET", "ASSET_PUBLIC_BASE_URL"] as const) if (!value[key]) issue(key, "required when AWS storage is enabled");
      if (value.S3_PUBLIC_BUCKET && value.S3_PUBLIC_BUCKET === value.S3_PRIVATE_BUCKET) issue("S3_PRIVATE_BUCKET", "public and private buckets must differ");
      if (value.ASSET_PUBLIC_BASE_URL && !isHttpsUrl(value.ASSET_PUBLIC_BASE_URL)) issue("ASSET_PUBLIC_BASE_URL", "must be HTTPS without credentials");
    }
    if (!value.LEGACY_EMAIL_AUTH_ENABLED && value.EMAIL_AUTH_PROVIDER !== "cognito") issue("LEGACY_EMAIL_AUTH_ENABLED", "legacy email can be disabled only after Cognito email is configured");
    if (value.EMAIL_AUTH_PROVIDER === "cognito") {
      if (!value.COGNITO_EMAIL_CLIENT_ID) issue("COGNITO_EMAIL_CLIENT_ID", "required for Cognito email authentication");
      if (!value.COGNITO_EMAIL_USER_POOL_ID || !/^[a-z]{2}(?:-[a-z]+)+-\d_[A-Za-z0-9]+$/.test(value.COGNITO_EMAIL_USER_POOL_ID)) issue("COGNITO_EMAIL_USER_POOL_ID", "must identify the dedicated email user pool");
      if (value.COGNITO_EMAIL_USER_POOL_ID && value.COGNITO_EMAIL_USER_POOL_ID === value.COGNITO_USER_POOL_ID) issue("COGNITO_EMAIL_USER_POOL_ID", "email and social authentication must use separate pools");
    }
    if (value.AUTH_PROVIDER === "cognito" || value.EMAIL_AUTH_PROVIDER === "cognito") {
      for (const key of ["COGNITO_USER_POOL_ID", "COGNITO_CLIENT_ID", "COGNITO_DOMAIN", "COGNITO_REDIRECT_URI", "COGNITO_LOGOUT_URI", "AUTH_COOKIE_SECRET"] as const) if (!value[key]) issue(key, "required for Cognito authentication");
      if (value.COGNITO_NATIVE_REDIRECT_URI) {
        try {
          const url = new URL(value.COGNITO_NATIVE_REDIRECT_URI);
          if (["http:","https:","javascript:","data:","file:","intent:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) throw new Error();
        } catch { issue("COGNITO_NATIVE_REDIRECT_URI", "must be one registered native callback URI without credentials, query or hash"); }
      }
      if (value.COGNITO_USER_POOL_ID && !/^[a-z]{2}(?:-[a-z]+)+-\d_[A-Za-z0-9]+$/.test(value.COGNITO_USER_POOL_ID)) issue("COGNITO_USER_POOL_ID", "must identify an AWS Cognito user pool");
      if (value.COGNITO_DOMAIN && (!isHttpsUrl(value.COGNITO_DOMAIN) || new URL(value.COGNITO_DOMAIN).pathname !== "/" || new URL(value.COGNITO_DOMAIN).search || new URL(value.COGNITO_DOMAIN).hash)) issue("COGNITO_DOMAIN", "must be an HTTPS origin");
      for (const key of ["COGNITO_REDIRECT_URI", "COGNITO_LOGOUT_URI"] as const) {
        if (value[key]) {
          try {
            const url = new URL(value[key]);
            const expected = key === "COGNITO_REDIRECT_URI" ? "/api/auth/cognito/callback" : "/login";
            if (!isSecureAppUrl(value[key]) || url.origin !== new URL(value.NEXT_PUBLIC_APP_URL).origin || url.pathname !== expected || url.search || url.hash) throw new Error();
          } catch { issue(key, "must match the configured application origin and callback/logout path"); }
        }
      }
    }
    if (value.PHONE_SMS_ENROLLMENT_MODE === "solapi" && (!value.PHONE_SMS_SOLAPI_API_KEY || !value.PHONE_SMS_SOLAPI_API_SECRET || !value.PHONE_SMS_SENDER || !value.PHONE_SMS_OTP_SECRET)) {
      context.addIssue({ code: "custom", message: "SMS enrollment requires provider credentials, a registered sender and an OTP secret", path: ["PHONE_SMS_ENROLLMENT_MODE"] });
    }
    if (value.PRIVY_APP_ID !== value.NEXT_PUBLIC_PRIVY_APP_ID) {
      context.addIssue({
        code: "custom",
        message: "must match NEXT_PUBLIC_PRIVY_APP_ID",
        path: ["PRIVY_APP_ID"],
      });
    }
    if (value.BYUS_DATA_ENVIRONMENT !== value.NEXT_PUBLIC_BYUS_DATA_ENVIRONMENT) {
      context.addIssue({
        code: "custom",
        message: "must match NEXT_PUBLIC_BYUS_DATA_ENVIRONMENT",
        path: ["BYUS_DATA_ENVIRONMENT"],
      });
    }
    if (value.PRIVY_APP_ENVIRONMENT !== value.NEXT_PUBLIC_PRIVY_APP_ENVIRONMENT) {
      context.addIssue({
        code: "custom",
        message: "must match NEXT_PUBLIC_PRIVY_APP_ENVIRONMENT",
        path: ["PRIVY_APP_ENVIRONMENT"],
      });
    }
    if (
      value.PRIVY_APPLE_LOGIN_ENABLED !==
      value.NEXT_PUBLIC_PRIVY_APPLE_LOGIN_ENABLED
    ) {
      context.addIssue({
        code: "custom",
        message: "must match NEXT_PUBLIC_PRIVY_APPLE_LOGIN_ENABLED",
        path: ["PRIVY_APPLE_LOGIN_ENABLED"],
      });
    }
    if (
      value.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED !==
      value.NEXT_PUBLIC_PRIVY_TEST_ACCOUNT_LOGIN_ENABLED
    ) {
      context.addIssue({
        code: "custom",
        message: "must match NEXT_PUBLIC_PRIVY_TEST_ACCOUNT_LOGIN_ENABLED",
        path: ["PRIVY_TEST_ACCOUNT_LOGIN_ENABLED"],
      });
    }
    if (value.BYUS_DATA_ENVIRONMENT === "production") {
      if (value.SUPABASE_URL && new URL(value.SUPABASE_URL).hostname !== PRODUCTION_SUPABASE_HOSTNAME) {
        context.addIssue({
          code: "custom",
          message: "must identify the ByUs Production Supabase project",
          path: ["SUPABASE_URL"],
        });
      }
      if (
        value.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED ||
        value.NEXT_PUBLIC_PRIVY_TEST_ACCOUNT_LOGIN_ENABLED
      ) {
        context.addIssue({
          code: "custom",
          message: "Production data forbids Privy Test Account login in every Privy environment",
          path: ["PRIVY_TEST_ACCOUNT_LOGIN_ENABLED"],
        });
      }
    }
    if (value.KAKAO_OAUTH_MODE === "provider" && (!value.KAKAO_CLIENT_ID || !value.KAKAO_CLIENT_SECRET || !value.KAKAO_REDIRECT_URI)) {
      context.addIssue({ code: "custom", message: "provider mode requires Kakao credentials and redirect URI", path: ["KAKAO_OAUTH_MODE"] });
    }
    if (value.CHZZK_LIVE_ENABLED && (!value.CHZZK_CLIENT_ID || !value.CHZZK_CLIENT_SECRET)) {
      context.addIssue({ code: "custom", message: "CHZZK LIVE requires client credentials", path: ["CHZZK_LIVE_ENABLED"] });
    }
    if (value.KAKAO_REDIRECT_URI) {
      try {
        const appUrl = new URL(value.NEXT_PUBLIC_APP_URL);
        const redirect = new URL(value.KAKAO_REDIRECT_URI);
        if (!isSecureAppUrl(value.KAKAO_REDIRECT_URI) ||
          redirect.origin !== appUrl.origin ||
          redirect.pathname !== "/settings/kakao/callback" ||
          redirect.search || redirect.hash) {
          throw new Error("invalid Kakao redirect");
        }
      } catch {
        context.addIssue({
          code: "custom",
          message: "must be the same-origin /settings/kakao/callback URL without query or hash",
          path: ["KAKAO_REDIRECT_URI"],
        });
      }
    }
  });

export type PublicEnvironment = z.infer<typeof publicEnvSchema>;
export type ServerEnvironment = z.infer<typeof serverEnvSchema>;

export class EnvironmentValidationError extends Error {
  readonly invalidKeys: readonly string[];

  constructor(invalidKeys: readonly string[]) {
    const keys = [...new Set(invalidKeys)].sort();
    super(`Invalid environment variables: ${keys.join(", ")}`);
    this.name = "EnvironmentValidationError";
    this.invalidKeys = keys;
  }
}

function findForbiddenKeys(source: EnvironmentSource): string[] {
  return Object.keys(source).filter(
    (key) => key.startsWith("VITE_") || FORBIDDEN_ENV_KEYS.has(key),
  );
}

function validateHosting(source: EnvironmentSource): void {
  const invalid: string[] = [];
  if (source.HOSTING_PROVIDER && !["aws", "vercel"].includes(source.HOSTING_PROVIDER)) invalid.push("HOSTING_PROVIDER");
  if ((isAwsHosting(source) || source.APP_ENV !== undefined) && !["dev", "staging", "prod"].includes(source.APP_ENV ?? "")) invalid.push("APP_ENV");
  if (source.APP_ENV !== undefined && source.APP_ENV !== "dev" && (source.PRIVY_TEST_ACCOUNT_LOGIN_ENABLED === "true" || source.NEXT_PUBLIC_PRIVY_TEST_ACCOUNT_LOGIN_ENABLED === "true")) invalid.push("PRIVY_TEST_ACCOUNT_LOGIN_ENABLED");
  if (invalid.length) throw new EnvironmentValidationError(invalid);
}

function parseEnvironment<T>(
  schema: z.ZodType<T>,
  source: EnvironmentSource,
): T {
  validateHosting(source);
  const forbiddenKeys = findForbiddenKeys(source);
  if (forbiddenKeys.length > 0) {
    throw new EnvironmentValidationError(forbiddenKeys);
  }

  const result = schema.safeParse(runtimeEnvironment(source));
  if (!result.success) {
    throw new EnvironmentValidationError(
      result.error.issues.map((issue) => String(issue.path[0] ?? "environment")),
    );
  }
  return result.data;
}

export function parsePublicEnv(source: EnvironmentSource): PublicEnvironment {
  return parseEnvironment(publicEnvSchema, source);
}

export function parseServerEnv(source: EnvironmentSource): ServerEnvironment {
  const parsed = parseEnvironment(serverEnvSchema, source);
  if (parsed.WEBHOOK_BUFFER_ENABLED || parsed.WEBHOOK_REPLAY_ENABLED) {
    try { bufferConfig(source); } catch { throw new EnvironmentValidationError(["APP_ENV", "WEBHOOK_BUFFER_QUEUE_URL", "WEBHOOK_BUFFER_BUCKET", "WEBHOOK_BUFFER_KMS_KEY_ID"]); }
  }
  return parsed;
}

export function loadServerEnv(): ServerEnvironment {
  return parseServerEnv(process.env);
}
