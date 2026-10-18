import { readFileSync } from "node:fs";import { resolve } from "node:path";import { describe,expect,it } from "vitest";
const sql=readFileSync(resolve(process.cwd(),"../../supabase/migrations/20261020000000_mobile_settings_notifications.sql"),"utf8");
describe("mobile settings migration",()=>{
 it("keeps tokens private and rechecks every version before send",()=>{expect(sql).toContain("mobile_prepare_push_delivery");expect(sql).toContain("i.installation_version<>d.installation_version");expect(sql).toContain("i.link_version<>d.link_version");expect(sql).toContain("u.mobile_account_version<>d.account_version");expect(sql).toContain("fan_web_notification_path");expect(sql).not.toMatch(/mobile_claim_push_deliveries[\s\S]{0,2500}push_token/);});
 it("invalidates installations during account disable and deletion",()=>{expect(sql).toContain("mobile_disable_installations_on_account");expect(sql).toContain("delete from public.mobile_installations");expect(sql).toContain("scrub_account_deletion_before_mobile_settings");});
});
