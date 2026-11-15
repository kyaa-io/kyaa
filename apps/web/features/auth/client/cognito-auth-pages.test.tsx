import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {APP_LOCALES} from "../../../i18n/locales";
const state=vi.hoisted(()=>({query:new URLSearchParams(),auth:{loading:false,session:null as null|{walletLinked:boolean;enrollment:{mode:"blocked"|"recovery"|"new";provider?:"google"|"apple"}},refresh:vi.fn(async()=>null)},privy:{ready:true,authenticated:false,getAccessToken:vi.fn(),logout:vi.fn()},replace:vi.fn(),oauth:vi.fn(),link:vi.fn(),createWallet:vi.fn(),refreshUser:vi.fn()}));
vi.mock("next/navigation",()=>({useSearchParams:()=>state.query,useRouter:()=>({replace:state.replace})}));
vi.mock("@privy-io/react-auth",()=>({usePrivy:()=>state.privy,useLoginWithOAuth:()=>({initOAuth:state.oauth}),useLinkJwtAccount:()=>({linkWithCustomJwt:state.link}),useCreateWallet:()=>({createWallet:state.createWallet}),useUser:()=>({refreshUser:state.refreshUser})}));
vi.mock("./cognito-auth",()=>({useCognitoAuth:()=>state.auth}));
import {CognitoWalletLink} from "./cognito-wallet-link";
import {CognitoNativeFinish} from "./cognito-native-finish";
beforeEach(()=>{state.query=new URLSearchParams("locale=en");state.auth.loading=false;state.auth.session=null;state.privy.ready=true;state.privy.authenticated=false;sessionStorage.clear();vi.clearAllMocks();state.refreshUser.mockReset().mockResolvedValue({id:"did:privy:new"});state.createWallet.mockResolvedValue({});state.privy.getAccessToken.mockResolvedValue("privy-proof");});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("uses explicit page locale and preserves sanitized login context in the back action",()=>{
 state.query=new URLSearchParams({locale:"en",returnTo:"/bias/example?tab=about#bio",intent:"instagram",entity:"example",authIntent:"11111111-1111-4111-8111-111111111111"});
 render(<CognitoWalletLink appleLoginEnabled/>);
 expect(screen.getByRole("heading",{name:"Connect your existing wallet"})).toBeInTheDocument();
 const href=new URL(screen.getByRole("link",{name:"Back to sign in"}).getAttribute("href")!,"https://app.test");
 expect(href.pathname).toBe("/login");expect(href.searchParams.get("locale")).toBe("en");expect(href.searchParams.get("returnTo")).toBe("/bias/example?tab=about&locale=en#bio");expect(href.searchParams.get("intent")).toBe("instagram");expect(href.searchParams.get("entity")).toBe("example");expect(href.searchParams.get("authIntent")).toBe("11111111-1111-4111-8111-111111111111");
 expect(screen.getByRole("button",{name:"Verify with Google"}).querySelector("span")).not.toBeNull();expect(screen.getByRole("button",{name:"Verify with Apple"}).querySelectorAll("svg")).toHaveLength(2);
});
it("sanitizes external return destinations without losing selected locale",()=>{
 state.query=new URLSearchParams({locale:"ja",returnTo:"//attacker.test",intent:"bad",entity:"bad/path"});render(<CognitoWalletLink appleLoginEnabled/>);
 const href=new URL(screen.getByRole("link").getAttribute("href")!,"https://app.test");expect(href.searchParams.get("returnTo")).toBe("/?locale=ja");expect(href.searchParams.has("intent")).toBe(false);expect(href.searchParams.has("entity")).toBe(false);
});
it("explains missing and blocked sessions instead of displaying an email-only diagnosis",()=>{
 state.privy.ready=false;
 const view=render(<CognitoWalletLink appleLoginEnabled/>);expect(screen.getByRole("alert")).toHaveTextContent("Your sign-in is missing or has expired");expect(screen.queryByText(/If you signed up with email only/)).not.toBeInTheDocument();expect(screen.getAllByRole("button").every(button=>button.hasAttribute("disabled"))).toBe(true);
 state.auth.session={walletLinked:false,enrollment:{mode:"blocked"}};view.rerender(<CognitoWalletLink appleLoginEnabled/>);expect(screen.getByRole("alert")).toHaveTextContent("Account linking is unavailable");expect(screen.queryByText(/If you signed up with email only/)).not.toBeInTheDocument();
});
it("announces loading while verification buttons are disabled",()=>{
 state.auth.loading=true;render(<CognitoWalletLink appleLoginEnabled={false}/>);expect(screen.getByRole("status")).toHaveTextContent("Checking your sign-in");expect(screen.getByRole("button",{name:"Verify with Google"})).toBeDisabled();expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("waits for fresh OAuth instead of linking the session being signed out",async()=>{
 state.auth.session={walletLinked:false,enrollment:{mode:"recovery",provider:"google"}};state.privy.authenticated=true;
 state.privy.logout.mockImplementationOnce(()=>new Promise<void>(()=>{}));
 const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);render(<CognitoWalletLink appleLoginEnabled/>);
 fireEvent.click(screen.getByRole("button",{name:"Verify with Google"}));
 await act(async()=>{});
 expect(state.privy.logout).toHaveBeenCalledOnce();expect(state.privy.getAccessToken).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();expect(state.oauth).not.toHaveBeenCalled();
});
it("does not restart OAuth automatically after a failed enrollment callback",async()=>{
 state.auth.session={walletLinked:false,enrollment:{mode:"new",provider:"google"}};state.privy.authenticated=true;state.privy.getAccessToken.mockResolvedValue("privy-proof");sessionStorage.setItem("kyaa-cognito-wallet-reauth",String(Date.now()));
 vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:503})));render(<CognitoWalletLink appleLoginEnabled={false}/>);
 await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("We couldn't link your account"));expect(state.oauth).not.toHaveBeenCalled();
});
it("keeps a failed callback retry manual when the linking page remounts",async()=>{
 state.auth.session={walletLinked:false,enrollment:{mode:"new",provider:"apple"}};state.privy.authenticated=true;sessionStorage.setItem("kyaa-cognito-wallet-reauth",String(Date.now()));
 const fetcher=vi.fn(async()=>new Response(null,{status:401}));vi.stubGlobal("fetch",fetcher);
 const view=render(<CognitoWalletLink appleLoginEnabled/>);await waitFor(()=>expect(screen.getByRole("alert")).toBeInTheDocument());view.unmount();
 render(<CognitoWalletLink appleLoginEnabled/>);expect(state.oauth).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledOnce();expect(screen.getByRole("button",{name:"Verify with Apple"})).toBeEnabled();
});
it("does not restart enrollment after the wallet mapping is already complete",async()=>{
 state.auth.session={walletLinked:true,enrollment:{mode:"new",provider:"google"}};
 render(<CognitoWalletLink appleLoginEnabled={false}/>);
 await waitFor(()=>expect(state.replace).toHaveBeenCalled());expect(state.oauth).not.toHaveBeenCalled();
});
it("creates a server-authorized initial wallet once and resumes the existing link handshake",async()=>{
 state.auth.session={walletLinked:false,enrollment:{mode:"new",provider:"google"}};state.privy.authenticated=true;sessionStorage.setItem("kyaa-cognito-wallet-reauth",String(Date.now()));
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({walletCreationAllowed:true,privyUserId:"did:privy:new"})).mockResolvedValueOnce(Response.json({walletToken:"id-token",privyUserId:"did:privy:new",alreadyLinked:true})).mockResolvedValueOnce(Response.json({linked:true}));vi.stubGlobal("fetch",fetcher);
 render(<CognitoWalletLink appleLoginEnabled={false}/>);await waitFor(()=>expect(state.auth.refresh).toHaveBeenCalled());expect(state.createWallet).toHaveBeenCalledExactlyOnceWith({createAdditional:false});expect(fetcher).toHaveBeenCalledTimes(3);expect(state.oauth).not.toHaveBeenCalled();
});
it("links a newly created wallet without a duplicate user refresh that can be rate limited",async()=>{
 state.auth.session={walletLinked:false,enrollment:{mode:"new",provider:"apple"}};state.privy.authenticated=true;sessionStorage.setItem("kyaa-cognito-wallet-reauth",String(Date.now()));
 state.refreshUser.mockResolvedValueOnce({id:"did:privy:new"}).mockRejectedValueOnce(new Error("429 rate limited"));
 state.link.mockResolvedValueOnce({user:{id:"did:privy:new"}});
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({walletCreationAllowed:true,privyUserId:"did:privy:new"})).mockResolvedValueOnce(Response.json({walletToken:"id-token",privyUserId:"did:privy:new",alreadyLinked:false})).mockResolvedValueOnce(Response.json({linked:true}));vi.stubGlobal("fetch",fetcher);
 render(<CognitoWalletLink appleLoginEnabled/>);await waitFor(()=>expect(state.auth.refresh).toHaveBeenCalled());expect(state.refreshUser).toHaveBeenCalledOnce();expect(state.createWallet).toHaveBeenCalledOnce();expect(state.link).toHaveBeenCalledWith("id-token");expect(fetcher).toHaveBeenCalledTimes(3);
});
it.each(["recovery","changed-owner"])("refuses wallet creation for %s",async(mode)=>{
 state.auth.session={walletLinked:false,enrollment:{mode:mode==="recovery"?"recovery":"new",provider:"google"}};state.privy.authenticated=true;sessionStorage.setItem("kyaa-cognito-wallet-reauth",String(Date.now()));state.refreshUser.mockResolvedValue({id:"did:privy:other"});
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({walletCreationAllowed:true,privyUserId:"did:privy:new"})));render(<CognitoWalletLink appleLoginEnabled={false}/>);await waitFor(()=>expect(screen.getByRole("alert")).toBeInTheDocument());expect(state.createWallet).not.toHaveBeenCalled();expect(state.oauth).not.toHaveBeenCalled();
});
it("leaves failed wallet creation retryable without automatically restarting OAuth",async()=>{
 state.auth.session={walletLinked:false,enrollment:{mode:"new",provider:"google"}};state.privy.authenticated=true;sessionStorage.setItem("kyaa-cognito-wallet-reauth",String(Date.now()));state.createWallet.mockRejectedValueOnce(new Error("SDK failure"));
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({walletCreationAllowed:true,privyUserId:"did:privy:new"})));render(<CognitoWalletLink appleLoginEnabled={false}/>);await waitFor(()=>expect(screen.getByRole("alert")).toBeInTheDocument());expect(state.createWallet).toHaveBeenCalledOnce();expect(state.oauth).not.toHaveBeenCalled();
});
it.each(APP_LOCALES)("provides the missing-session explanation for %s",locale=>{
 state.query=new URLSearchParams({locale});render(<CognitoWalletLink appleLoginEnabled={false}/>);expect(screen.getByRole("alert").textContent).toBeTruthy();expect(document.querySelector(`[lang="${locale}"]`)).not.toBeNull();
});
it("groups native status under its heading and uses explicit locale on success and error states",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:503})));render(<CognitoNativeFinish/>);expect(screen.getByRole("region",{name:"kyaa"})).toBeInTheDocument();expect(screen.getByRole("status")).toHaveTextContent("Returning to the app");await waitFor(()=>expect(screen.getByRole("alert")).toHaveTextContent("Couldn't return to the app"));
});
