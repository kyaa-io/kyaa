import { Suspense } from "react";
import { ImageAssetManager } from "../../../components/admin/image-asset-manager";

export default function Page() {
  return <Suspense fallback={null}><ImageAssetManager /></Suspense>;
}
