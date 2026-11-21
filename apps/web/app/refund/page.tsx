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
  const document = commerceDocument("refund", locale);
  return contentPageMetadata({ path: "/refund", locale, title: document.metadataTitle, description: document.metadataDescription });
}

export default async function RefundPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string | string[] }>;
}) {
  const locale = resolveLegalLocale((await searchParams).locale);
  return <LegalPage document={commerceDocument("refund", locale)} documentId="refund" locale={locale} />;
}
