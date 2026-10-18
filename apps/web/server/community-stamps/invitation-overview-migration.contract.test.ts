import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "../../supabase/migrations/20261109000000_mobile_invitation_overview.sql"), "utf8");

describe("mobile invitation overview SQL contract", () => {
  it("keeps the projection owner scoped and free of invitee identity", () => {
    expect(sql).toContain("where relation_row.inviter_app_user_id=p_app_user_id");
    expect(sql).toContain("limit 100");
    expect(sql).not.toContain("invitee_app_user_id'");
    expect(sql).not.toContain("nickname");
    expect(sql).not.toContain("phone");
    expect(sql).not.toContain("email");
  });
});
