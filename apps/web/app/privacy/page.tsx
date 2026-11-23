import type { Metadata } from "next";

import { legalDocument, resolveLegalLocale } from "@/components/legal-content";
import { LegalPage } from "@/components/legal-page";
import { contentPageMetadata } from "@/seo/metadata";

// Operations draft: obtain legal review of both language versions before the production policy is finalized.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string | string[] }>;
}): Promise<Metadata> {
  const locale = resolveLegalLocale((await searchParams).locale);
  const document = legalDocument("privacy", locale);
  return contentPageMetadata({ path: "/privacy", locale, title: document.metadataTitle, description: document.metadataDescription });
}

export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string | string[] }>;
}) {
  const locale = resolveLegalLocale((await searchParams).locale);
  return <LegalPage document={legalDocument("privacy", locale)} documentId="privacy" locale={locale} />;
}
