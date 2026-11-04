import { Suspense } from "react";
import { ChannelOperatorManager } from "../../../components/admin/channel-operator-manager";

export default function ChannelOperatorsPage() {
  return <Suspense fallback={null}><ChannelOperatorManager /></Suspense>;
}
