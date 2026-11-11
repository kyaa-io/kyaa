import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {APP_LOCALES} from "../../../i18n/locales";
const state=vi.hoisted(()=>({query:new URLSearchParams(),auth:{loading:false,session:null as null|{walletLinked:boolean;enrollment:{mode:"blocked"|"recovery"|"new";provider?:"google"|"apple"}},refresh:vi.fn(async()=>null)},privy:{ready:true,authenticated:false,getAccessToken:vi.fn(),logout:vi.fn()},replace:vi.fn(),oauth:vi.fn(),link:vi.fn(),createWallet:vi.fn(),refreshUser:vi.fn()}));
vi.mock("next/navigation",()=>({useSearchParams:()=>state.query,useRouter:()=>({replace:state.replace})}));
vi.mock("@privy-io/react-auth",()=>({usePrivy:()=>state.privy,useLoginWithOAuth:()=>({initOAuth:state.oauth}),useLinkJwtAccount:()=>({linkWithCustomJwt:state.link}),useCreateWallet:()=>({createWallet:state.createWallet}),useUser:()=>({refreshUser:state.refreshUser})}));
vi.mock("./cognito-auth",()=>({useCognitoAuth:()=>state.auth}));
import {CognitoNativeFinish} from "./cognito-native-finish";
beforeEach(()=>{state.query=new URLSearchParams("locale=en");state.auth.loading=false;state.auth.session=null;state.privy.ready=true;state.privy.authenticated=false;sessionStorage.clear();vi.clearAllMocks();state.refreshUser.mockReset().mockResolvedValue({id:"did:privy:new"});state.createWallet.mockResolvedValue({});state.privy.getAccessToken.mockResolvedValue("privy-proof");});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("groups native status under its heading and uses explicit locale on success and error states",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:503})));render(<CognitoNativeFinish/>);expect(screen.getByRole("region",{name:"kyaa"})).toBeInTheDocument();expect(screen.getByRole("status")).toHaveTextContent("Returning to the app");await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("Couldn't return to the app"));
});
