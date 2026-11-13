// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CertificationGrid } from "./certification-grid";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const item = (n: number, reward: { scorePoints: number; ticketAmount: number } | null) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, kind: "manual", category: "증빙", title: `인증 ${n}`, description: "", status: "available", reward, actionHref: `/c/a/proofs/${n}` });

it("사용자 11/13 13:2x: a page's certification rows show its server reward as the +NP badge; 0 or no value shows the policy default (+100P)", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ certifications: [item(1, { scorePoints: 30, ticketAmount: 0 }), item(2, { scorePoints: 0, ticketAmount: 0 }), item(3, null)] })));
  render(<CertificationGrid variant="rows" locale="ko" slug="a" guest={false} fallbackHref="/benefits" />);
  await waitFor(() => expect(screen.getByText("인증 1")).toBeTruthy());
  const rows = [...document.querySelectorAll('[data-certification-grid="items"] a')].map(a => a.textContent);
  expect(rows[0]).toContain("+30P");
  expect(rows.slice(1).map(text => /\+(\d+)P/.exec(text ?? "")?.[1])).toEqual(["100", "100"]);
});
