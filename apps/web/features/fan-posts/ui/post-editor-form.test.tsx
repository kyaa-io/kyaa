import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GroupPostComposer } from "@/features/groups/ui/group-post-composer";
import { boardCopy } from "@/features/groups/ui/board-copy";
import { managementCopy } from "@/features/groups/ui/management-copy";
import { PostComposer } from "./post-composer";

const state = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: true, user: { id: "me" }, getAccessToken: async () => "t" }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: "me", generation: 1 }) }));
vi.mock("@/features/content-safety/ui/use-content-mutation", () => ({ useContentMutation: () => ({ busy: false, error: "", request: state.request }) }));
vi.mock("@/features/content-safety/ui/content-asset", () => ({ ContentAssetImage: () => null }));
vi.mock("@/features/content-safety/ui/authenticated-media", () => ({ AuthenticatedMedia: () => null }));
vi.mock("@/features/content-safety/ui/use-wave-media-upload", () => ({ useWaveMediaUpload: () => ({ items: [], invalid: false, add: vi.fn(), remove: vi.fn(), retry: vi.fn(), markUsed: vi.fn(), busy: false }) }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({ useGroupRequest: () => ({ ownerKey: "me", ready: true, request: vi.fn() }), useGroupResource: () => ({ data: { photoLimit: 10, videoAllowed: true }, failure: null, error: false, loading: false, retry: vi.fn() }) }));
vi.mock("@/features/groups/ui/group-post-asset", () => ({ GroupPostAsset: () => null }));
vi.mock("@/components/editor/lazy-rich-editor", () => ({ LazyRichEditor: ({ onChange, label }: { label: string; onChange: (value: unknown) => void }) => <button type="button" data-testid="editor" aria-label={label} onClick={() => onChange({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "본문" }] }] })} /> }));

const m = managementCopy("ko"), b = boardCopy("ko");
const fan = (extra = {}) => render(<PostComposer board slug="artist" locale="ko" heading={m.write} onSaved={vi.fn()} onCancel={vi.fn()} {...extra} />);
const group = (extra = {}) => render(<GroupPostComposer locale="ko" heading={m.write} canWriteNotice={false} busy={false} onSubmit={vi.fn(async () => true)} onCancel={vi.fn()} {...extra} />);
const outline = () => [...screen.getByRole("form").querySelectorAll("[data-editor-part]")].map(node => node.getAttribute("data-editor-part"));
const buttons = () => within(screen.getByRole("form").querySelector("[data-editor-part='actions']") as HTMLElement).getAllByRole("button").map(node => node.textContent);

beforeEach(() => { state.request.mockReset().mockResolvedValue({ id: "1", revision: 1 }); });
afterEach(cleanup);

it("gives the fan board and group boards the same form, in the same order", () => {
  fan();
  const fanOutline = outline(), fanButtons = buttons();
  cleanup();
  group();
  expect(outline()).toEqual(fanOutline);
  expect(buttons()).toEqual(fanButtons);
  expect(fanOutline).toEqual(["back", "heading", "title", "body", "options", "actions"]);
  expect(fanButtons).toEqual(["취소", m.write]);

});

it("names the same fields on both", () => {
  for (const show of [fan, group]) {
    show();
    expect(screen.getByRole("heading", { name: m.write })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: m.title })).toBeInTheDocument();
    expect(screen.getByTestId("editor")).toHaveAccessibleName(m.body);
    expect(screen.getByRole("combobox", { name: "공개 범위" })).toBeInTheDocument();
    cleanup();
  }
});

it("keeps each board's own save path: the fan board posts its route, with visibility from the same select", async () => {
  fan();
  fireEvent.change(screen.getByRole("textbox", { name: m.title }), { target: { value: "제목" } });
  fireEvent.click(screen.getByTestId("editor"));
  fireEvent.change(screen.getByRole("combobox", { name: "공개 범위" }), { target: { value: "members" } });
  await waitFor(() => expect(screen.getByRole("button", { name: m.write })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: m.write }));
  await waitFor(() => expect(state.request).toHaveBeenCalledWith("/api/celebrities/artist/posts", "POST", expect.objectContaining({ body: "제목", visibility: "members", bodyDoc: expect.anything() })));
});

it("keeps each board's own save path: the group board hands its fields up, and only operators choose a notice", async () => {
  const onSubmit = vi.fn(async () => true);
  group({ onSubmit });
  expect(within(screen.getByRole("combobox", { name: /게시판/ })).queryByRole("option", { name: b.notice })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: m.title }), { target: { value: "제목" } });
  fireEvent.click(screen.getByTestId("editor"));
  await waitFor(() => expect(screen.getByRole("button", { name: m.write })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: m.write }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: "제목", visibility: "public", category: "free", bodyDoc: expect.anything() })));
  cleanup();
  group({ canWriteNotice: true });
  expect(within(screen.getByRole("combobox", { name: /게시판/ })).getByRole("option", { name: b.notice })).toBeInTheDocument();
});

it("asks before leaving a changed form from the back action on both", () => {
  const onCancel = vi.fn();
  group({ onCancel });
  fireEvent.click(screen.getByRole("button", { name: b.back }));
  expect(onCancel).toHaveBeenLastCalledWith(false);
  fireEvent.change(screen.getByRole("textbox", { name: m.title }), { target: { value: "제목" } });
  fireEvent.click(screen.getByRole("button", { name: b.back }));
  expect(onCancel).toHaveBeenLastCalledWith(true);
  cleanup();
  const close = vi.fn();
  fan({ onCancel: close });
  fireEvent.click(screen.getByRole("button", { name: b.back }));
  expect(close).toHaveBeenCalledTimes(1);
});
