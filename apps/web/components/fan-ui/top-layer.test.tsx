import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useOpenNativeModal } from "./top-layer";

// jsdom has no :modal; showModal sets `open`, and the hook asks for :modal. Stub matches for the dialogs this test opens.
it("follows a native modal opening, closing and leaving the page, so the toast layer can be drawn inside it", async () => {
  const dialog = document.createElement("dialog");
  const matches = dialog.matches.bind(dialog);
  dialog.matches = (selector: string) => selector === ":modal" ? dialog.open : matches(selector);
  document.body.append(dialog);
  const { result } = renderHook(() => useOpenNativeModal());
  expect(result.current).toBeNull();
  await act(async () => { dialog.setAttribute("open", ""); await Promise.resolve(); });
  expect(result.current).toBe(dialog);
  await act(async () => { dialog.remove(); await Promise.resolve(); });
  expect(result.current).toBeNull();
});
