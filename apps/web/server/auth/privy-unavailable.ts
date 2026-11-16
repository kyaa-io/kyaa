import "server-only";

/** Privy could not be reached or failed on its side. This says nothing about the token or the account, so it is never a revocation. */
export class PrivyUnavailableError extends Error {
  readonly code = "PRIVY_UNAVAILABLE";
  constructor(message = "Privy is temporarily unavailable", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PrivyUnavailableError";
  }
}

/** A timeout, a dropped connection or a 5xx/429 answer is Privy's trouble. A 4xx answer (unknown user, rejected call) is a verdict. */
export function privyFailureIsTransient(error: unknown): boolean {
  const status = typeof error === "object" && error !== null ? (error as { status?: unknown }).status : undefined;
  return typeof status === "number" ? status >= 500 || status === 408 || status === 429 : true;
}
