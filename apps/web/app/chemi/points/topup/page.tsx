import { notFound } from "next/navigation";
import { chemiEnabled } from "@/features/chemi/domain/availability";
import { Checkout } from "./checkout";

export default function PointTopup() {
  if (!chemiEnabled() || process.env.APP_ENV !== "dev") notFound();
  return <Checkout />;
}
