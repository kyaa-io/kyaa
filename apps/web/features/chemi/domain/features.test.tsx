import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "@/app/chemi/star/reading.fixture.json";
import { StarResult } from "@/app/chemi/star/result";
import type { StarReading } from "@/app/chemi/star/reading";
import { DeepResultAsk } from "@/features/chemi/ask/deep-result-ask";
import { ChemiFeaturesProvider } from "./features";

vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/client/cognito-auth", () => ({
  useByUsAuth: () => ({ ready: true, authenticated: true, login: vi.fn(), user: { id: "member" }, getAccessToken: async () => "session" }),
}));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: () => ({ rpc: vi.fn(), authorize: vi.fn() }) }));

const closed = { ask: false, reminders: false };
const reading = { ...fixture, replayed: true } as unknown as StarReading;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("replaces the ask button on a result with '다른 운세 보기' when ask is closed (운영 조합)", () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ grants: [] })));
  const onAsk = vi.fn();
  render(<ChemiFeaturesProvider value={closed}><StarResult locale="ko" reading={reading} character="changha" backHref="/chemi/star" onChart={() => {}} onAsk={onAsk} /></ChemiFeaturesProvider>);
  expect(screen.queryByText("이 결과로 질문하기")).toBeNull();
  expect(screen.getByRole("link", { name: "다른 운세 보기" })).toHaveAttribute("href", "/chemi?locale=ko");
});

it("hides the deeper-result ask button when ask is closed", () => {
  const { container } = render(<ChemiFeaturesProvider value={closed}><DeepResultAsk name="창하" reading={() => "r"} /></ChemiFeaturesProvider>);
  expect(container.querySelector("[data-deep-result-ask]")).toBeNull();
});

it("closes ask and new '내일 알려 줘' requests on production, keeps them on dev", async () => {
  const { chemiFeatures } = await import("./availability");
  const { reminderRoute } = await import("@/server/chemi-mail/reminders");
  vi.stubEnv("CHEMI_TAB", "true");
  vi.stubEnv("APP_ENV", "prod");
  expect(chemiFeatures()).toEqual({ ask: false, reminders: false });
  const request = () => new Request("https://example.test/api/chemi/reminders", { method: "POST", body: "{}" });
  expect((await reminderRoute(request(), true)).status).toBe(404);
  vi.stubEnv("APP_ENV", "dev");
  expect(chemiFeatures()).toEqual({ ask: true, reminders: true });
});
