import { notFound } from "next/navigation";
import { FandomEditor } from "./fandom-editor";

export const dynamic = "force-dynamic";
export default function Page() {
  if (process.env.DONATION_VOTE_ENABLED !== "true") notFound();
  return <FandomEditor />;
}
