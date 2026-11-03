import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WinnerNotice } from "./winner-notice";
import records from "./winner-notice-data.json";
describe("winner notice", () => {
 it("contains only masked public data with approved prize counts", () => {
  expect(records).toHaveLength(104);
  expect(records.filter(r=>r.prize==="안동참마요거트 1L")).toHaveLength(15);
  expect(records.filter(r=>r.prize==="스타벅스 1만원")).toHaveLength(89);
  expect(records.every(r=>/^[^@]*\*{3}@.\*{3}\.[a-z]+$/.test(r.email))).toBe(true);
 });
 it("resets pagination on prize and search changes", () => {
  render(<WinnerNotice/>);
  expect(screen.getAllByRole("listitem")).toHaveLength(24);
  fireEvent.click(screen.getByRole("button",{name:"다음 →"}));
  expect(screen.getByRole("status").textContent).toContain("2 / 5");
  fireEvent.click(screen.getByRole("button",{name:"요거트 15"}));
  expect(screen.getAllByRole("listitem")).toHaveLength(15);
  expect(screen.getByRole("status").textContent).toContain("1 / 1");
  fireEvent.change(screen.getByRole("textbox"),{target:{value:"no-match"}});
  expect(screen.queryAllByRole("listitem")).toHaveLength(0);
 });
});
