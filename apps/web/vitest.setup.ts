import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { clearResources } from "./components/fan-ui/resource-cache";

afterEach(() => clearResources());

vi.mock("next/navigation", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/navigation")>(),
  useRouter: () => ({ push: vi.fn() }),
}));

// Node 24 exposes an incomplete global localStorage when --localstorage-file is
// present without a path. Keep tests deterministic with the Storage contract.
const storage = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    get length() { return storage.size; },
    clear() { storage.clear(); },
    getItem(key: string) { return storage.get(String(key)) ?? null; },
    key(index: number) { return [...storage.keys()][index] ?? null; },
    removeItem(key: string) { storage.delete(String(key)); },
    setItem(key: string, value: string) { storage.set(String(key), String(value)); },
  } satisfies Storage,
});

if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => true,
    }),
  });
}

class TestResizeObserver implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

class TestIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];
  constructor(private readonly callback: IntersectionObserverCallback) {}
  disconnect() {}
  observe(target: Element) {
    this.callback([{
      boundingClientRect: target.getBoundingClientRect(),
      intersectionRatio: 1,
      intersectionRect: target.getBoundingClientRect(),
      isIntersecting: true,
      rootBounds: null,
      target,
      time: 0,
    }], this);
  }
  takeRecords() { return []; }
  unobserve() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: TestResizeObserver,
});
Object.defineProperty(globalThis, "IntersectionObserver", {
  configurable: true,
  value: TestIntersectionObserver,
});

// 261107-2 D5: media uploads send their PUT through XMLHttpRequest to report progress. jsdom's XHR would reach the network,
// so tests get a small XHR that hands the request to the (mocked) global fetch and reports one full progress event.
class FetchBackedXhr {
  status = 0; withCredentials = false;
  upload: { onprogress: ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null; onerror: (() => void) | null = null; onabort: (() => void) | null = null;
  private method = "GET"; private url = ""; private headers: Record<string, string> = {}; private controller = new AbortController();
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  abort() { this.controller.abort(); }
  send(body?: Blob | null) {
    void fetch(this.url, { method: this.method, headers: this.headers, body: body ?? undefined, signal: this.controller.signal, credentials: "omit" }).then(response => {
      const size = body instanceof Blob ? body.size : 0;
      this.upload.onprogress?.({ lengthComputable: size > 0, loaded: size, total: size });
      this.status = response?.status ?? (response?.ok === false ? 500 : 200); this.onload?.();
    }, () => { if (this.controller.signal.aborted) this.onabort?.(); else this.onerror?.(); });
  }
}
Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, writable: true, value: FetchBackedXhr });
