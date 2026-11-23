import type { Metadata } from "next";

import { legalDocument, resolveLegalLocale } from "@/components/legal-content";
import { LegalPage } from "@/components/legal-page";
import { contentPageMetadata } from "@/seo/metadata";

// Operations draft: obtain legal review of both language versions before the production terms are finalized.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string | string[] }>;
}): Promise<Metadata> {
  const locale = resolveLegalLocale((await searchParams).locale);
  const document = legalDocument("terms", locale);
  return contentPageMetadata({ path: "/terms", locale, title: document.metadataTitle, description: document.metadataDescription });
}

export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string | string[] }>;
}) {
  const locale = resolveLegalLocale((await searchParams).locale);
  return <LegalPage document={legalDocument("terms", locale)} documentId="terms" locale={locale} />;
}
