import {cleanup,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";

const mock=vi.hoisted(()=>({
  token:vi.fn(),link:vi.fn(),refresh:vi.fn(),replace:vi.fn(),
  privy:{ready:true,authenticated:true},
}));
vi.mock("@privy-io/react-auth",()=>({
  usePrivy:()=>({...mock.privy,getAccessToken:mock.token,logout:vi.fn()}),
  useLinkJwtAccount:()=>({linkWithCustomJwt:mock.link}),
  useLoginWithOAuth:()=>({initOAuth:vi.fn()}),
  useCreateWallet:()=>({createWallet:vi.fn()}),
  useUser:()=>({refreshUser:vi.fn()}),
}));
vi.mock("next/navigation",()=>({useSearchParams:()=>new URLSearchParams(),useRouter:()=>({replace:mock.replace})}));
vi.mock("../../../components/locale-provider",()=>({usePageLocale:()=>"ko"}));
vi.mock("./cognito-auth",()=>({useCognitoAuth:()=>({loading:false,session:{authenticated:true,walletLinked:false,enrollment:{mode:"recovery"}},refresh:mock.refresh})}));
import {CognitoWalletLink} from "./cognito-wallet-link";

beforeEach(()=>{
  sessionStorage.setItem("kyaa-cognito-wallet-reauth",String(Date.now()));
  mock.token.mockResolvedValue("verified-original-token");
  mock.link.mockResolvedValue({user:{id:"did:privy:existing"}});
});
afterEach(()=>{cleanup();sessionStorage.clear();vi.resetAllMocks();vi.unstubAllGlobals();});

function respond(completeStatus=200){
  const fetcher=vi.fn(async(url:RequestInfo|URL)=>String(url).endsWith("/start")
    ?Response.json({walletToken:"cognito-id-token",privyUserId:"did:privy:existing",alreadyLinked:false})
    :Response.json({linked:completeStatus===200},{status:completeStatus}));
  vi.stubGlobal("fetch",fetcher);return fetcher;
}

it("completes with the already verified bearer when the SDK rotates its session",async()=>{
  const fetcher=respond();mock.token.mockResolvedValueOnce("verified-original-token").mockResolvedValue(null);
  render(<CognitoWalletLink appleLoginEnabled/>);
  await waitFor(()=>expect(mock.replace).toHaveBeenCalled());
  expect(mock.token).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenLastCalledWith("/api/auth/cognito/wallet-link/complete",{method:"POST",headers:{authorization:"Bearer verified-original-token"}});
  expect(sessionStorage.getItem("kyaa-cognito-wallet-reauth")).toBeNull();
});

it("recovers an SDK failure only after the server confirms the persisted link",async()=>{
  respond();mock.link.mockRejectedValue(new Error("SDK session refresh failed after link"));
  render(<CognitoWalletLink appleLoginEnabled/>);
  await waitFor(()=>expect(mock.replace).toHaveBeenCalled());
  expect(mock.refresh).toHaveBeenCalledTimes(1);
});

it.each([401,403,409,503])("does not accept an SDK failure when final verification returns %s",async(status)=>{
  respond(status);mock.link.mockRejectedValue(new Error("Link failed"));
  render(<CognitoWalletLink appleLoginEnabled/>);
  await screen.findByRole("alert");
  expect(mock.refresh).not.toHaveBeenCalled();expect(mock.replace).not.toHaveBeenCalled();
  expect(sessionStorage.getItem("kyaa-cognito-wallet-reauth")).toBe("failed");
});

it.each([{user:{id:"did:privy:other"}},{}])("requires server verification regardless of the SDK result %j",async(result)=>{
  const fetcher=respond();mock.link.mockResolvedValue(result);
  render(<CognitoWalletLink appleLoginEnabled/>);
  await waitFor(()=>expect(mock.replace).toHaveBeenCalled());
  expect(fetcher).toHaveBeenLastCalledWith("/api/auth/cognito/wallet-link/complete",{method:"POST",headers:{authorization:"Bearer verified-original-token"}});
});

it("rejects a mismatched SDK result when the server cannot confirm ownership",async()=>{
  const fetcher=respond(401);mock.link.mockResolvedValue({user:{id:"did:privy:other"}});
  render(<CognitoWalletLink appleLoginEnabled/>);
  await screen.findByRole("alert");
  expect(fetcher).toHaveBeenCalledTimes(2);expect(mock.replace).not.toHaveBeenCalled();
});
