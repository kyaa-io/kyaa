import { expect, it } from "vitest";
import { throwIfAborted } from "./throw-if-aborted";

it("does nothing for a live signal and throws the exact abort reason", () => {
  const controller = new AbortController();
  expect(() => throwIfAborted(controller.signal)).not.toThrow();
  const reason = { cancelled: true };
  controller.abort(reason);
  try { throwIfAborted(controller.signal); throw new Error("not aborted"); }
  catch (error) { expect(error).toBe(reason); }
});

it("throws AbortError when an older signal has no reason", () => {
  const signal = { aborted: true } as AbortSignal;
  expect(() => throwIfAborted(signal)).toThrow(expect.objectContaining({ name: "AbortError" }));
});
