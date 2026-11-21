import type { Metadata } from "next";

import { aboutDocument } from "@/components/about-content";
import { resolveLegalLocale } from "@/components/legal-content";
import { LegalPage } from "@/components/legal-page";
import { contentPageMetadata } from "@/seo/metadata";

type Props = { searchParams: Promise<{ locale?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const locale = resolveLegalLocale((await searchParams).locale);
  const document = aboutDocument(locale);
  return contentPageMetadata({ path: "/about", locale, title: document.metadataTitle, description: document.metadataDescription });
}

export default async function AboutPage({ searchParams }: Props) {
  const locale = resolveLegalLocale((await searchParams).locale);
  return <LegalPage document={aboutDocument(locale)} documentId="about" locale={locale} />;
}
