/** The deployed commit, only when RELEASE_SHA is a full 40-character hex SHA. */
export function releaseSha(env: Record<string, string | undefined> = process.env): string | undefined {
  const value = env.RELEASE_SHA ?? "";
  return /^[a-f0-9]{40}$/.test(value) ? value : undefined;
}
