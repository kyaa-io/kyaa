import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { APP_LOCALES, LANGUAGE_SELECTOR_ARIA_LABELS } from "@/i18n/locales";
import { accountDeletionCopy } from "./content";
import AccountDeletionPage, { generateMetadata } from "./page";

describe("public account deletion information", () => {
  it.each(APP_LOCALES)("is readable without authentication in %s", async (locale) => {
    const copy = accountDeletionCopy[locale];
    const searchParams = Promise.resolve({ locale });
    const { container } = render(await AccountDeletionPage({ searchParams }));
    const main = screen.getByRole("main");

    expect(within(main).getByRole("heading", { level: 1, name: copy.title })).toBeInTheDocument();
    expect(within(main).getAllByRole("heading", { level: 2 })).toHaveLength(4);
    expect(within(main).getByText(copy.description)).toHaveTextContent("Sallylab Inc.");
    for (const paragraph of [copy.appRequest, copy.emailRequest, copy.deleted, copy.retained, copy.timing]) {
      expect(within(main).getByText(paragraph)).toBeInTheDocument();
    }
    expect(copy.appRequest).toContain("Passport");
    expect(copy.retained).toContain("Stamp");
    expect(copy.timing).toContain("30");
    expect(within(main).getByRole("link", { name: "support@kyaa.io" })).toHaveAttribute("href", "mailto:support@kyaa.io");
    expect(screen.getByRole("combobox", { name: LANGUAGE_SELECTOR_ARIA_LABELS[locale] })).toHaveValue(locale);
    expect(container.querySelector("[data-fan-surface]")).toHaveAttribute("lang", locale);
    expect(container.querySelector('a[href="#account-deletion-main"]')).toBeInTheDocument();
    expect(await generateMetadata({ searchParams })).toEqual({ title: `${copy.title} | kyaa`, description: copy.description });
  });

  it("explains the actual request steps, retained records and indefinite retention", async () => {
    render(await AccountDeletionPage({ searchParams: Promise.resolve({ locale: "en" }) }));
    expect(screen.getByText(/Passport → Settings → Delete account/)).toBeInTheDocument();
    expect(screen.getByText(/account email address.*request to delete/)).toBeInTheDocument();
    expect(screen.getByText(/Do not send your password or verification codes/)).toBeInTheDocument();
    expect(screen.getByText(/no automatic expiry/)).toHaveTextContent(/blockchain remains public and cannot be deleted/);
    expect(screen.getByText(/no automatic expiry/)).toHaveTextContent(/prevent recreation/);
    expect(screen.getByText(/do not specify a fixed completion deadline/)).toHaveTextContent(/pending until external login accounts/);
    expect(screen.getByText(/30 days after delivery or on-site pickup/)).toBeInTheDocument();
  });

  it("uses the established default locale for an unsupported locale", async () => {
    render(await AccountDeletionPage({ searchParams: Promise.resolve({ locale: "invalid" }) }));
    expect(screen.getByRole("heading", { level: 1, name: accountDeletionCopy.ko.title })).toBeInTheDocument();
  });
});
