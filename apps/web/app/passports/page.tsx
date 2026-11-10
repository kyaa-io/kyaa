import { FanRouteSkeleton } from "@/components/fan-ui/fan-route-skeleton";
import { Suspense } from "react";
import { PassportCollectionScreen } from "../../features/passport/ui/passport-screens";

export default function PassportsPage() { return <Suspense fallback={<FanRouteSkeleton layout="list" />}><PassportCollectionScreen /></Suspense>; }
