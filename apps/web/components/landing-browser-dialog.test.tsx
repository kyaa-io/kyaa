import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LandingBrowserDialog } from "./landing-browser-dialog";

const xApp = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Twitter for iPhone";

function open(path: string) {
  const showModal = vi.fn();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModal });
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(xApp);
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: false }) });
  window.history.replaceState(null, "", path);
  window.sessionStorage.clear();
  render(<LandingBrowserDialog locale="en" />);
  return showModal;
}

describe("landing browser dialog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("covers the first page inside another app's browser", () => {
    expect(open("/")).toHaveBeenCalledOnce();
  });

  it("stays off the sign-in page, which shows its own in-app guide with email first", () => {
    expect(open("/login?returnTo=%2Fs%2Fraffle&locale=en")).not.toHaveBeenCalled();
  });
});
