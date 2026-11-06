import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { messages } from "@/i18n/catalogs/components__editor";
import { editorSource } from "./editor-source";
import { RichBody } from "./rich-body";
import { RichEditor, type RichEditorHandle } from "./rich-editor";
import { plainTextToRichDocument, sanitizeRichDocument, type RichDocument } from "./rich-document";
import { initialRichDocument } from "./use-rich-post-body";

afterEach(cleanup);
const asset = "11111111-1111-4111-8111-111111111111";
function Harness({ initial = plainTextToRichDocument("", []), onValue }: { initial?: RichDocument; onValue?: (value: RichDocument) => void }) {
  const [value, setValue] = useState(initial), handle = useRef<RichEditorHandle | null>(null);
  return <><RichEditor label="내용" value={value} onChange={next => { setValue(next); onValue?.(next); }} locale="ko" placeholder="여기에 쓰기" handleRef={handle} media={{ onPickPhotos: vi.fn(), renderAttachment: item => <img alt={item.assetId} /> }} /><button type="button" onClick={() => handle.current?.insertAttachment({ assetId: asset, kind: "image" })}>insert</button></>;
}
const ready = () => waitFor(() => expect(screen.getByRole("button", { name: "굵게" })).toBeEnabled());

it("fills every locale and keeps placeholders", () => {
  const placeholders = (text: string) => (text.match(/\{\d+\}/g) ?? []).sort();
  expect(Object.keys(messages).sort()).toEqual(Object.keys(editorSource).sort());
  for (const [key, source] of Object.entries(editorSource)) for (const locale of APP_LOCALES.filter(item => item !== "ko" && item !== "en")) {
    const text = (messages as Record<string, Record<string, string>>)[key]?.[locale];
    expect(text?.trim(), `${key}/${locale}`).toBeTruthy();
    expect(placeholders(text as string), `${key}/${locale}`).toEqual(placeholders(source.en));
  }
});

it("shows the placeholder only while empty and names the writing area", async () => {
  render(<Harness />);
  await ready();
  expect(screen.getByText("여기에 쓰기")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "내용" })).toBeInTheDocument();
  cleanup();
  render(<Harness initial={plainTextToRichDocument("본문", [])} />);
  await ready();
  expect(screen.queryByText("여기에 쓰기")).toBeNull();
});

it("refuses a script link and a look-alike YouTube address in the toolbar", async () => {
  const seen = vi.fn();
  render(<Harness onValue={seen} />);
  await ready();
  fireEvent.click(screen.getByRole("button", { name: "링크" }));
  fireEvent.change(screen.getByLabelText("링크 주소"), { target: { value: "javascript:alert(1)" } });
  fireEvent.click(screen.getByRole("button", { name: "넣기" }));
  expect(screen.getByRole("alert")).toHaveTextContent("https");
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  fireEvent.click(screen.getByRole("button", { name: "YouTube" }));
  fireEvent.change(screen.getByLabelText("YouTube 주소"), { target: { value: "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ" } });
  fireEvent.click(screen.getByRole("button", { name: "넣기" }));
  expect(screen.getByRole("alert")).toHaveTextContent("YouTube");
  expect(seen).not.toHaveBeenCalled();
});

it("keeps an uploaded attachment in a document the server accepts, and a removed one leaves", async () => {
  let latest: RichDocument | undefined;
  render(<Harness onValue={value => { latest = value; }} />);
  await ready();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "insert" })); });
  await screen.findByAltText(asset);
  expect(sanitizeRichDocument(latest).content.some(node => node.type === "attachment" && node.attrs?.assetId === asset)).toBe(true);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "삭제" })); });
  await waitFor(() => expect(screen.queryByAltText(asset)).toBeNull());
  expect(sanitizeRichDocument(latest).content.some(node => node.type === "attachment")).toBe(false);
});

it("opens an old plain post with its text and attachments, and keeps attachments a document misses", () => {
  const old = initialRichDocument({ body: "첫 줄\n둘째 줄", attachments: [{ assetId: asset, kind: "image" }] });
  expect(old.content.map(node => node.type)).toEqual(["paragraph", "paragraph", "attachment"]);
  const stored = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] };
  expect(initialRichDocument({ bodyDoc: stored, attachments: [{ assetId: asset, kind: "image" }] }).content.at(-1)?.type).toBe("attachment");
  expect(initialRichDocument({ body: "plain", bodyDoc: { type: "doc", content: [{ type: "script" }] } }).content[0]?.content?.[0]?.text).toBe("plain");
});

it("reads a document through React: links stay safe, media comes from the post, nothing becomes HTML", () => {
  const document = sanitizeRichDocument({ type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "<img src=x onerror=alert(1)>" }, { type: "text", text: "링크", marks: [{ type: "link", attrs: { href: "https://kyaa.io/a" } }] }] },
    { type: "attachment", attrs: { assetId: asset, kind: "image" } },
    { type: "youtube", attrs: { videoId: "dQw4w9WgXcQ" } },
  ] });
  const { container } = render(<RichBody document={document} locale="ko" renderAttachment={item => <span data-testid="media">{item.assetId}</span>} />);
  expect(container.querySelector("img[src='x']")).toBeNull();
  expect(screen.getByText(/onerror/)).toBeInTheDocument();
  const link = screen.getByRole("link", { name: "링크" });
  expect(link).toHaveAttribute("href", "https://kyaa.io/a");
  expect(link.getAttribute("rel")).toContain("nofollow");
  expect(link.getAttribute("rel")).toContain("noopener");
  expect(screen.getByTestId("media")).toHaveTextContent(asset);
  expect(container.querySelector("iframe")).toBeNull();
  fireEvent.click(within(container).getByRole("button", { name: "YouTube 영상 재생" }));
  expect(container.querySelector("iframe")?.getAttribute("src")).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0");
});
