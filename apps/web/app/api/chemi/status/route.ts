import { chemiStatusRoute } from "@/server/chemi/dependencies";
export const dynamic = "force-dynamic";
export async function GET() { return chemiStatusRoute(); }
