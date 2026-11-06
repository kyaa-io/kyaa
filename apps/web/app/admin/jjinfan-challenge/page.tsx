import { Suspense } from "react";
import { JjinfanChallengeManager } from "@/components/admin/jjinfan-challenge-manager";

export default function JjinfanChallengePage() {
  return <Suspense fallback={null}><JjinfanChallengeManager /></Suspense>;
}
