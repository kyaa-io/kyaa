import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(
    process.cwd(),
    "../../supabase/migrations/20261112000000_mobile_default_passport.sql",
  ),
  "utf8",
);

describe("mobile default passport SQL contract", () => {
  it("keeps default passports separate from fan certification and XP", () => {
    expect(sql).toContain("create table public.mobile_default_passports");
    expect(sql).toContain(
      "unique references public.app_users(id) on delete cascade",
    );
    expect(sql).toContain("and c.primary_role<>'brand'");
    expect(sql).not.toMatch(
      /insert into public\.(fan_passports|fan_score_ledger|community_stamps)/i,
    );
  });

  it("projects only real friend and invite ledger rows", () => {
    expect(sql).toContain("from public.social_friendships friendship");
    expect(sql).toContain("friendship.accepted_at is not null");
    expect(sql).toContain("from public.community_stamps stamp");
    expect(sql).toContain("stamp.kind='invite'");
  });

  it("provisions idempotently and removes the passport on account deletion", () => {
    expect(sql).toContain("on conflict(app_user_id) do nothing");
    expect(sql).toContain("app_users_provision_mobile_default_passport");
    expect(sql).toContain("app_users_scrub_mobile_default_passport");
    expect(sql).toContain("create_mobile_passport_share_link");
    expect(sql).toContain("include_nickname");
    expect(sql).toContain("include_public_stamps");
    expect(sql).toContain("request.status='pending'");
  });

  it("keeps new mobile shares on an explicit public-stamp projection", () => {
    expect(sql).toContain("create table public.mobile_passport_public_stamps");
    expect(sql).toContain("visibility_mode='explicit_public'");
    expect(sql).toContain("visibility_mode='legacy_all'");
    expect(sql).toContain("MOBILE_PASSPORT_PUBLIC_STAMP_INVALID");
    expect(sql).toContain(
      "from public.mobile_passport_public_stamps public_stamp",
    );
    expect(sql).toContain(
      "public.read_owned_mobile_passport_public_stamp_count(p.app_user_id,p.id)",
    );
    expect(sql).toContain(
      "public.validate_mobile_passport_public_stamp(),",
    );
  });
});
