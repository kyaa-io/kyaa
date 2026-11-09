import { Suspense } from "react";
import { AuthorizedHomeNoticeManager } from "../../../components/admin/home-notice-admin";

export default function AdminHomeNoticesPage() {
  return <Suspense fallback={null}><AuthorizedHomeNoticeManager /></Suspense>;
}
