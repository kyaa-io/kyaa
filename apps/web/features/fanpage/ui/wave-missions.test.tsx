import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { waveMissionsCopy } from "@/i18n/catalogs/features__fanpage__wave-missions";
import { WAVE_MISSIONS } from "../domain/wave-missions";
import { WaveMissionsHome } from "./wave-missions";

afterEach(cleanup);
describe("Wave mission progress", () => {
  it.each(APP_LOCALES)("shows START and nine revised missions and localizes service states in %s", locale => {
    render(<WaveMissionsHome locale={locale} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    for (const mission of WAVE_MISSIONS) {
      expect(screen.getByText(mission.name)).toHaveAttribute("lang", "ko");
      expect(screen.getByText(mission.description)).toHaveAttribute("lang", "ko");
    }
    expect(screen.getAllByText(waveMissionsCopy(locale).unverified)).toHaveLength(10);
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "0");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("이름표 인증")).toBeNull();
    expect(screen.getByRole("link", { name: "오늘의 한 컷" })).toHaveAttribute("href", expect.stringContaining("section=media"));
  });
  it("links unfinished missions to their activities and leaves completed missions unlinked", () => {
    render(<WaveMissionsHome locale="ja" websiteUrl="https://kyaawave.com/" progress={[{key:"introduction",status:"completed"}]} />);
    for (const [name, destination] of [
      ["오늘의 한 컷", "section=media"], ["WAVE 팬페이지 좋아요", "#first-reaction"],
      ["서로 친구 추가", "tab=friends"], ["DM으로 인사하기", "tab=friends"],
      ["WAVE LIVE 응원", "section=live"], ["나영석 PD님 감사평", "/programs/live-insight"],
      ["퀴즈 정답 보너스", "/programs/wave-quiz"],
    ]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("href", expect.stringContaining(destination));
      expect(link).toHaveAttribute("href", expect.stringContaining("locale=ja"));
    }
    expect(screen.queryByRole("link", { name: "게시판 자기소개" })).toBeNull();
    expect(screen.queryByRole("link", { name: "체크인 완료" })).toBeNull();
    expect(screen.getByRole("link", { name: "KYAA Wave 홈페이지 응원" })).toHaveAttribute("data-outbound-kind", "website");
    expect(screen.getByRole("link", { name: "KYAA Wave 홈페이지 응원" })).toHaveAttribute("href", "https://kyaawave.com/");
  });
  it("counts only catalog missions explicitly completed, without counting duplicate records twice", () => {
    render(<WaveMissionsHome locale="ko" progress={[
      { key: "checkin", status: "completed" }, { key: "checkin", status: "completed" },
      { key: "fanpage-like", status: "completed" }, { key: "event-photo", status: "pending" },
    ]} />);
    expect(screen.getByRole("status")).toHaveTextContent("2 / 10 · 완료");
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "2");
    expect(screen.getAllByText("완료", { exact: true })).toHaveLength(2);
    expect(within(screen.getByText("오늘의 한 컷").closest("li")!).getByText("미완료")).toBeTruthy();
    expect(screen.getAllByText("확인 전")).toHaveLength(7);
  });
  it("updates the completed count when authoritative progress changes", () => {
    const view = render(<WaveMissionsHome locale="ko" />);
    view.rerender(<WaveMissionsHome locale="ko" progress={WAVE_MISSIONS.map(({ key }) => ({ key, status: "completed" }))} />);
    expect(screen.getByRole("status")).toHaveTextContent("10 / 10 · 완료");
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "10");
  });
});
