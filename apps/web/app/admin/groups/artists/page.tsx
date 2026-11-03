import { notFound } from "next/navigation";
import { GroupArtistManager } from "@/components/admin/group-artist-manager";
export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{lang?:string}>}) {if(process.env.KYAA_GROUPS_ENABLED!=="true")notFound();return <GroupArtistManager locale={(await searchParams).lang==="en"?"en":"ko"}/>;}
