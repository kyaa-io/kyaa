export type ChemiMaintenanceRpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export async function runChemiMail(rpc: ChemiMaintenanceRpc, environment: string | undefined, sink: string | undefined) {
  if (environment !== "dev" || sink !== "true") return 0;
  const count = await rpc("chemi_mail_drain_test", { p_environment: environment });
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > 50) {
    throw new Error("CHEMI_MAIL_INVALID_RESULT");
  }
  return count;
}
