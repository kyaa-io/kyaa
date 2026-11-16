import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { deriveEmailUnsubscribeKey, signEmailUnsubscribeToken } from "../../../worker/src/email-unsubscribe";
import { createEmailUnsubscribePostHandler } from "./email-unsubscribe-route";

// Explicit opt-in: disposable local DB only. No env files or external credentials.
const db = process.env.ACTIVITY_LOCAL_TEST_DB;
it.skipIf(!db)("real route invokes the real activity-only RPC for an old required-mail token", async () => {
  const url = new URL(db!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/activity_1116") throw Error("disposable local DB only");
  const sql = (query: string) => execFileSync("psql", [db!, "-XAtq", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8" }).trim();
  const u = randomUUID(), n = randomUUID(), c = randomUUID();
  const key = deriveEmailUnsubscribeKey("local-example-secret-".repeat(4));
  try {
    sql(`insert into app_users(id,privy_user_id,verified_email,status) values('${u}','did:privy:activity-${u}','${u}@example.invalid','active');
      insert into fan_notification_channels(id,app_user_id,kind,status,consent_version,consented_at,destination_fingerprint,destination_label,verified_at) values('${c}','${u}','email','eligible','test',now(),public.email_destination_fingerprint('${u}@example.invalid'),'example',now());
      insert into fan_notifications(id,app_user_id,kind,source_key,scheduled_for) values('${n}','${u}','runmusic_result','activity:${n}',now());`);
    const handler = createEmailUnsubscribePostHandler(() => ({ key, client: { rpc: async (_name, a) => {
      const literal = (v: unknown) => v === null ? "null" : `'${String(v).replaceAll("'", "''")}'`;
      try {
        const data = sql(`select public.apply_email_unsubscribe(${literal(a.p_notification_id)}::uuid,${literal(a.p_template_key)},${literal(a.p_scope)},null,${a.p_enabled},now(),${literal(a.p_destination_binding)},${literal(a.p_via)})`);
        return { data: JSON.parse(data), error: null };
      } catch { return { data: null, error: { code: "55000" } }; }
    } } }));
    const token = signEmailUnsubscribeToken(key, { notificationId: n, templateKey: "runmusic_result", destination: `${u}@example.invalid` });
    const request = (scope?: string) => new Request(`http://localhost/api/email/unsubscribe?t=${token}`, { method: "POST", body: new URLSearchParams(scope ? { scope, enabled: "false" } : { "List-Unsubscribe": "One-Click" }) });
    expect((await handler(request())).status).toBe(200);
    const oldPayload = Buffer.from(JSON.stringify({ n, k: "runmusic_result", e: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    const oldToken = `v1.${oldPayload}.${createHmac("sha256", key).update(`email-unsubscribe:v1.${oldPayload}`).digest("base64url")}`;
    expect((await handler(new Request(`http://localhost/api/email/unsubscribe?t=${oldToken}`, { method: "POST", body: new URLSearchParams({ "List-Unsubscribe": "One-Click" }) }))).status).toBe(200);
    expect(sql(`select (not p.activity_email_notifications and p.benefit_notifications and p.live_reminders and p.activity_email_updated_via='one_click' and c.consent_revoked_at is null)::text from notification_preferences p join fan_notification_channels c using(app_user_id) where p.app_user_id='${u}'`)).toBe("true");
    expect((await handler(request("preference"))).status).toBe(400);
    sql(`update fan_notification_channels set destination_fingerprint=public.email_destination_fingerprint('${u}-changed@example.invalid') where id='${c}'`);
    expect((await handler(request())).status).toBe(410);
  } finally {
    // Append-only product events are removed by dropping this disposable DB after the suite.

  }
});
