export type HostingEnvironment = Record<string, string | undefined>;

export function isAwsHosting(source: HostingEnvironment = process.env): boolean {
  return source.HOSTING_PROVIDER === "aws";
}

/** Use indexed reads: NEXT_PUBLIC values must not be frozen by the Next build. */
export function runtimeEnvironment(source: HostingEnvironment = process.env): HostingEnvironment {
  if (!isAwsHosting(source)) return source;
  const mapped = { ...source };
  for (const name of ["APP_URL", "PRIVY_APP_ID", "BYUS_DATA_ENVIRONMENT", "PRIVY_APP_ENVIRONMENT", "PRIVY_APPLE_LOGIN_ENABLED", "PRIVY_TEST_ACCOUNT_LOGIN_ENABLED", "WEB_PUSH_VAPID_PUBLIC_KEY"]) {
    mapped[`NEXT_PUBLIC_${name}`] = source[name];
  }
  return mapped;
}
