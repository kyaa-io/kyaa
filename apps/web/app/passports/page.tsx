import { readIssuedPassports } from "@/server/signup-event/issued-passports";
import { FanRouteSkeleton } from "@/components/fan-ui/fan-route-skeleton";
import { Suspense } from "react";
import { PassportCollectionScreen } from "../../features/passport/ui/passport-screens";

export const dynamic = "force-dynamic";

async function Collection() {
  return <PassportCollectionScreen issuedCount={await readIssuedPassports()} />;
}

export default function PassportsPage() { return <Suspense fallback={<FanRouteSkeleton layout="list" />}><Collection /></Suspense>; }
