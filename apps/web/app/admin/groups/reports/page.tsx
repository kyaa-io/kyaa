import { notFound } from "next/navigation";
import { GroupOperationsManager } from "@/components/admin/group-operations-manager";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{lang?:string}>}) {if(process.env.KYAA_GROUPS_ENABLED!=="true")notFound();return <GroupOperationsManager locale={(await searchParams).lang==="en"?"en":"ko"} view="reports"/>;}
