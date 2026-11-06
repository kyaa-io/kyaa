import { notFound } from "next/navigation";
import { GroupEventApprovals } from "@/components/admin/group-event-approvals";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{lang?:string}>}) {if(process.env.KYAA_GROUPS_ENABLED!=="true")notFound();return <GroupEventApprovals locale={(await searchParams).lang==="en"?"en":"ko"}/>;}
