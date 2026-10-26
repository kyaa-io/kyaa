import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { gggiCopy } from "@/i18n/catalogs/features__fanpage__gggi";
import { commandPayload } from "@/server/g5/content-cms";
import draft from "../../../../../content/gggi/celebrity.json";
import { GggiParticipationEntry } from "./gggi-participation-entry";

vi.mock("server-only", () => ({}));
vi.mock("./gggi-event-entry", () => ({ GggiEventEntry: () => <div data-testid="gggi-event" /> }));

describe("GGGI first participation", () => {
  it("is a valid unpublished CMS draft with original institution copy in both locales", () => {
    const parsed = commandPayload.parse(draft);
    expect(parsed.action).toBe("save");
    expect(draft.celebrityId).toBeNull();
    expect(draft.payload.primaryRole).toBe("brand");
    expect(draft.payload.fanCount).toBe(0);
    expect(draft.payload.localizations.ko.summary).toBe(draft.payload.localizations.en.summary);
  });

  it.each(APP_LOCALES)("uses the existing public board with the selected %s locale", (locale) => {
    render(<GggiParticipationEntry locale={locale} />);
    expect(screen.getByRole("heading", { name: gggiCopy[locale].title })).toBeVisible();
    expect(screen.getByRole("link", { name: gggiCopy[locale].board })).toHaveAttribute(
      "href", `/gggi?tab=board&source=fans&locale=${locale}#celebrity-content`,
    );
    expect(screen.getByTestId("gggi-event")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
