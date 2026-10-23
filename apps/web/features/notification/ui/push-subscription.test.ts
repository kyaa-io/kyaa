import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enablePushNotifications } from "./push-subscription";

describe("enablePushNotifications", () => {
  beforeEach(() => {
    vi.stubGlobal("PushManager", class PushManager {});
    vi.stubGlobal("Notification", {
      requestPermission: vi.fn(async () => "granted"),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends only the canonical fields accepted by the strict subscription API", async () => {
    const subscription = {
      toJSON: () => ({
        endpoint: "https://push.example/device",
        expirationTime: null,
        keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) },
      }),
    };
    const register = vi.fn(async () => ({
      pushManager: {
        getSubscription: vi.fn(async () => subscription),
        subscribe: vi.fn(),
      },
    }));
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register },
    });
    const fetchMock = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (input) => input === "/api/public/runtime-config"
      ? Response.json({ webPushVapidPublicKey: "AQIDBA" })
      : new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      enablePushNotifications(async () => "access-token"),
    ).resolves.toBe("subscribed");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[1];
    expect(JSON.parse(String(init?.body))).toEqual({
      endpoint: "https://push.example/device",
      keys: { p256dh: "p".repeat(40), auth: "a".repeat(16) },
    });
  });

  it("does not call the API when the browser subscription omits key material", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        register: vi.fn(async () => ({
          pushManager: {
            getSubscription: vi.fn(async () => ({
              toJSON: () => ({ endpoint: "https://push.example/device" }),
            })),
            subscribe: vi.fn(),
          },
        })),
      },
    });
    const fetchMock = vi.fn(async () => Response.json({ webPushVapidPublicKey: "AQIDBA" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      enablePushNotifications(async () => "access-token"),
    ).resolves.toBe("failed");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
