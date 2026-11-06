import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { expect, it, vi } from "vitest";
import { editorSource } from "@/components/editor/editor-source";
import { useGroupPostBody } from "./group-post-body";

vi.mock("@/components/editor/lazy-rich-editor", () => ({ LazyRichEditor: ({ onChange }: { onChange: (next: unknown) => void }) => <button type="button" onClick={() => onChange({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "가".repeat(120_000) }] }] })}>oversize</button> }));
vi.mock("@/features/content-safety/ui/use-wave-media-upload", () => ({ useWaveMediaUpload: () => ({ items: [], invalid: false, add: vi.fn(), remove: vi.fn(), retry: vi.fn(), markUsed: vi.fn(), busy: false }) }));
vi.mock("./group-post-asset", () => ({ GroupPostAsset: () => null }));

type Body = ReturnType<typeof useGroupPostBody>;
const seen: { latest?: Body } = {};
function Harness({ initial }: { initial?: Parameters<typeof useGroupPostBody>[0]["initial"] }) {
  const value = useGroupPostBody({ locale: "en", label: "Body", initial });
  useEffect(() => { seen.latest = value; });
  return <>{value.field}</>;
}

it("M2: leaves the body to the server when it sends a document", () => {
  render(<Harness initial={{ body: "첫 줄\n\n둘째 줄" }} />);
  const sent = seen.latest?.submission();
  expect(sent).not.toHaveProperty("body");
  expect(sent?.bodyDoc?.content.map(node => node.type)).toEqual(["paragraph", "paragraph", "paragraph"]);
  expect(seen.latest?.blocked).toBe(false);
});

it("M2: says why a post is too large and blocks sending", () => {
  render(<Harness />);
  act(() => screen.getByRole("button", { name: "oversize" }).click());
  expect(screen.getByRole("alert")).toHaveTextContent(editorSource.documentTooLarge.en);
  expect(seen.latest?.blocked).toBe(true);
});

it("M1: does not open an editor over a document it could not read", () => {
  render(<Harness initial={{ body: "본문", bodyDocUnavailable: true }} />);
  expect(screen.getByRole("alert")).toHaveTextContent(editorSource.bodyDocUnavailable.en);
  expect(screen.queryByRole("button", { name: "oversize" })).toBeNull();
  expect(seen.latest?.blocked).toBe(true);
});
