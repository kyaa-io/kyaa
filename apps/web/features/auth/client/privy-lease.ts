// Standalone (no SDK, no backend): the error a Privy island lease gives a call that was still waiting when its
// component instance let the lease go (unmount, or the StrictMode remount). Callers that start a Privy flow from a
// mount effect clear their own guards on this error so the next generation starts once (plan-b §0-7).
export class PrivyLeaseReleasedError extends Error {
  constructor(kind: string) {
    super(`The ${kind} lease was released before Privy attached it`);
    this.name = "PrivyLeaseReleasedError";
  }
}

export function isPrivyLeaseReleased(error: unknown): error is PrivyLeaseReleasedError {
  return error instanceof PrivyLeaseReleasedError;
}
