import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { RoleBadge, pageRoleOf } from "./role-badge";

it("marks an artist from the page presence first, then owners and managers as operators, and nobody else", () => {
  const artists = new Set(["a"]);
  expect(pageRoleOf({ profileId: "a", role: "member" }, artists)).toBe("artist");
  expect(pageRoleOf({ profileId: "b", role: "owner" }, artists)).toBe("operator");
  expect(pageRoleOf({ profileId: "c", role: "manager" }, artists)).toBe("operator");
  expect(pageRoleOf({ profileId: "d", role: "member" }, artists)).toBeNull();
});
it("draws one text chip", () => {
  render(<RoleBadge role="artist" locale="ko" />);
  expect(screen.getByText("아티스트")).toHaveAttribute("data-role-badge", "artist");
});
