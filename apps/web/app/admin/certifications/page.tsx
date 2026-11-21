import { Suspense } from "react";
import { AuthorizedCertificationManager } from "@/components/admin/certification-manager";
import { AuthorizedProofReview } from "@/components/admin/proof-review-screen";

export default async function AdminCertificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  return (
    <Suspense fallback={null}>
      {view === "stamps" ? <AuthorizedProofReview /> : <AuthorizedCertificationManager />}
    </Suspense>
  );
}
