import { APP_LOCALES } from "@/i18n/locales";
import { HQ_COUNTRY, HQ_LOCALITY, HQ_NAME, HQ_REGION } from "./global-headquarters";
import { SITE_URL } from "./metadata";

const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

export type PublicFaq = {
  question: string;
  answer: string;
};

/**
 * Keep the site identity identical on every localized home URL. The
 * Organization is the Korean operator, Sallylab Inc., which the legal pages
 * name as the provider of kyaa; its parentOrganization is the global
 * headquarters KYAA Inc., shown with the same name and region as the site
 * footer. The social URLs are the official channels published in the footer.
 */
export function homeStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: "Sallylab Inc.",
        url: `${SITE_URL}/`,
        email: "support@kyaa.io",
        logo: `${SITE_URL}/kyaa-app-icon-512.png`,
        parentOrganization: {
          "@type": "Organization",
          name: HQ_NAME,
          address: {
            "@type": "PostalAddress",
            addressLocality: HQ_LOCALITY,
            addressRegion: HQ_REGION,
            addressCountry: HQ_COUNTRY,
          },
        },
        brand: {
          "@type": "Brand",
          name: "kyaa",
          alternateName: ["꺄", "꺄(Kyaa)"],
          url: `${SITE_URL}/`,
        },
        sameAs: [
          "https://www.instagram.com/kyaa_app/",
          "https://x.com/kyaa_app",
          "https://www.threads.com/@kyaa_app",
          "https://t.me/Kyaa_Official",
        ],
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        url: `${SITE_URL}/`,
        name: "kyaa",
        alternateName: ["KYAA", "Kyaa", "꺄", "꺄(Kyaa)"],
        inLanguage: [...APP_LOCALES],
        publisher: { "@id": ORGANIZATION_ID },
      },
    ],
  } as const;
}

export function faqStructuredData(faqs: readonly PublicFaq[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: {
        "@type": "Answer",
        text: answer,
      },
    })),
  } as const;
}

/** Escape script-breaking characters while preserving valid JSON. */
export function serializeStructuredData(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
