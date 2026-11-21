import { redirect } from "next/navigation";

export default async function AdminProofReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach((item) => query.append(name, item));
    else if (value !== undefined) query.set(name, value);
  }
  query.set("view", "stamps");
  redirect(`/admin/certifications?${query}`);
}
