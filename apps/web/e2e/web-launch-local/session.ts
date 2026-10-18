import { usePrivy } from "./privy";
export function useByUsSession(){const auth=usePrivy();return {ready:auth.ready,pending:!auth.ready,ownerId:auth.user?.id??null,generation:0,error:null};}
