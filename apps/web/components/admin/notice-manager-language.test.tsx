import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { afterEach, expect, it, vi } from "vitest";
import { NoticeManager } from "./notice-manager";

let activeEditor: Editor | null = null;
const getAccessToken = vi.fn(async () => "token");
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ getAccessToken }) }));
vi.mock("@tiptap/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tiptap/react")>();
  return {
    ...actual,
    useEditor: (...args: Parameters<typeof actual.useEditor>) => {
      const editor = actual.useEditor(...args);
      activeEditor = editor;
      return editor;
    },
  };
});
vi.mock("../notice/notice-body", () => ({ NoticeBody: () => null }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(["ko", "en"] as const)("retains both draft bodies when switching from edited %s without an update loop", async (firstLanguage) => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ notices: [] }));
  vi.stubGlobal("fetch", fetchMock);
  render(<NoticeManager celebrityId="creator-1" celebrityName="Creator" role="operator" locale="ko" />);
  await screen.findByText("공지가 없습니다.");
  await waitFor(() => expect(activeEditor).not.toBeNull());
  if (firstLanguage === "en") fireEvent.click(screen.getByRole("button", { name: "EN" }));
  const secondLanguage = firstLanguage === "ko" ? "en" : "ko";
  act(() => { activeEditor!.commands.insertContent(`${firstLanguage} original body`); });
  fireEvent.click(screen.getByRole("button", { name: secondLanguage.toUpperCase() }));
  expect(activeEditor!.getText()).toBe("");
  act(() => { activeEditor!.commands.insertContent(`${secondLanguage} original body`); });
  fireEvent.click(screen.getByRole("button", { name: firstLanguage.toUpperCase() }));
  expect(activeEditor!.getText()).toBe(`${firstLanguage} original body`);
  fireEvent.click(screen.getByRole("button", { name: secondLanguage.toUpperCase() }));
  expect(activeEditor!.getText()).toBe(`${secondLanguage} original body`);
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true));
  const [, init] = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
  const payload = JSON.parse(init!.body as string);
  for (const language of ["ko", "en"]) {
    expect(payload.localizations[language].body.content[0].content[0].text).toBe(`${language} original body`);
  }
});
