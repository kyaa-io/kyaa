import type { Metadata } from "next";

import { resolveLegalLocale } from "@/components/legal-content";
import { commerceDocument } from "@/components/legal-commerce-content";
import { LegalPage } from "@/components/legal-page";
import { contentPageMetadata } from "@/seo/metadata";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string | string[] }>;
}): Promise<Metadata> {
  const locale = resolveLegalLocale((await searchParams).locale);
  const document = commerceDocument("pricing", locale);
  return contentPageMetadata({ path: "/pricing", locale, title: document.metadataTitle, description: document.metadataDescription });
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string | string[] }>;
}) {
  const locale = resolveLegalLocale((await searchParams).locale);
  return <LegalPage document={commerceDocument("pricing", locale)} documentId="pricing" locale={locale} />;
}
