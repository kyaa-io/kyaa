import { describe, expect, it } from "vitest";
import { adminReturnPath } from "./admin-login";

describe("adminReturnPath", () => {
  it("returns to the admin page the link was opened from", () => {
    expect(adminReturnPath("?returnTo=%2Fadmin%2Fgroups")).toBe("/admin/groups");
    expect(adminReturnPath("?lang=en&returnTo=%2Fadmin%2Fcertifications%3Fstatus%3Dpending")).toBe("/admin/certifications?status=pending");
  });
  it("falls back to the default admin page for anything outside /admin", () => {
    for (const bad of ["", "?returnTo=", "?returnTo=%2F%2Fevil.example%2Fadmin", "?returnTo=https%3A%2F%2Fevil.example%2Fadmin", "?returnTo=%2Fmy", "?returnTo=%2Fadministrator", "?returnTo=%2Fadmin%2Flogin", "?returnTo=%2Fadmin%5C%5Cevil", "?returnTo=%2Fadmin%2F..%2Fmy"]) {
      expect(adminReturnPath(bad), bad).toBe("/admin/celebrities");
    }
  });
});
