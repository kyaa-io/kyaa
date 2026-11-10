import { FanRouteSkeleton } from "@/components/fan-ui/fan-route-skeleton";
import { Suspense } from "react";
import { NotificationCenter } from "../../features/notification/ui/notification-center";
export default function NotificationsPage() {
  return (
    <Suspense fallback={<FanRouteSkeleton layout="list" />}>
      <NotificationCenter />
    </Suspense>
  );
}
