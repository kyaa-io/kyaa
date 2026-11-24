/** On for the DEV deployment and local development; production and staging stay off, including when APP_ENV is missing. */
export function accountSwitchEnabled(env: { APP_ENV?: string; NODE_ENV?: string }) { return env.APP_ENV === "dev" || (env.APP_ENV === undefined && env.NODE_ENV === "development"); }
