// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/components/notice/notice-share", () => ({ NoticeShare: () => <button type="button">공유</button> }));

import { PostShareAction } from "./post-share-action";

afterEach(cleanup);

it("opens the share sheet with no point badge: opening a shared link pays nothing (BUGS-261110 B6)", () => {
  const { container } = render(<PostShareAction title="글" locale="ko" contentType="post" />);
  expect(container.querySelector("button")?.textContent).toBe("공유");
  expect(container.querySelector("[data-earn]")).toBeNull();
  expect(container.querySelector("[data-earn-badge]")).toBeNull();
  expect(container.textContent).not.toMatch(/\+\s*\d|P\b/);
});
