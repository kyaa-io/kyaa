const q=new URLSearchParams(location.search),owner=q.get('state')==='owner';
const token=async()=>'synthetic-local-owner';
export const useByUsAuth=()=>({ready:true,authenticated:owner,user:owner?{id:'synthetic-local-owner'}:null,getAccessToken:token});
export const usePrivy=useByUsAuth;
export const useByUsSession=()=>({ready:true,ownerId:owner?'synthetic-local-owner':null,generation:1,pending:false,error:null});
export const useAdminSession=()=>({status:'unauthorized',admin:null});
export const useUser=()=>({user:null,refreshUser:async()=>null});
export const useLinkWithOAuth=()=>({initOAuth:async()=>{throw Error('No OAuth in local verification');},loading:false,state:{status:'initial'}});
