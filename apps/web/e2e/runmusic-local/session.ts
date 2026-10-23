import {OWNER_ID} from "./privy";
export const useByUsSession = () => ({ready:new URLSearchParams(location.search).get("scenario")!=="restoring",pending:false,ownerId:new URLSearchParams(location.search).get("auth")==="off"?null:OWNER_ID,generation:1,destination:null,error:null,recoveryPath:null,reauthenticationProviders:[],retryTransition:async()=>{},resetTransition:()=>{}});
