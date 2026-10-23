import { nativeBridge } from "../../../../../../server/auth/cognito/native-bridge";
export const dynamic="force-dynamic";
export const POST=(request:Request)=>nativeBridge(request,"logout");
