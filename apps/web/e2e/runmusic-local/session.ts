// A direct page load has no in-memory login transition owner.
export const useByUsSession = () => ({ready:new URLSearchParams(location.search).get("scenario")!=="restoring",pending:false,ownerId:null,generation:1,destination:null,error:null,recoveryPath:null,reauthenticationProviders:[],retryTransition:async()=>{},resetTransition:()=>{}});
