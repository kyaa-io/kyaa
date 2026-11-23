import type { ReactNode } from "react";
import { chemiFeatures } from "@/features/chemi/domain/availability";
import { ChemiFeaturesProvider } from "@/features/chemi/domain/features";

export const dynamic = "force-dynamic";

export default function ChemiLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <ChemiFeaturesProvider value={chemiFeatures()}>{children}</ChemiFeaturesProvider>;
}
