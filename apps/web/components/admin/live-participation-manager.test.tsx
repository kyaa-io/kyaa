import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LiveParticipationManager } from "./live-participation-manager";
const live="11111111-1111-4111-8111-111111111111";
const cert="22222222-2222-4222-8222-222222222222";
const data={missions:[],surveys:[],certifications:[{id:cert,title:"실제 인증",status:"active"}],threads:[],nextLives:[]};
const token=async()=>"verified-admin";
afterEach(()=>vi.unstubAllGlobals());
function fields(){
 fireEvent.change(screen.getByLabelText("참여 유형"),{target:{value:"story"}});
 fireEvent.change(screen.getByLabelText("공개 제목"),{target:{value:"실제 방송 사연"}});
 fireEvent.change(screen.getByLabelText("참여 안내"),{target:{value:"직접 작성한 사연을 보내 주세요."}});
 fireEvent.change(screen.getByLabelText("연결할 실제 원천"),{target:{value:cert}});
 fireEvent.change(screen.getByLabelText("참여 시작 (KST)"),{target:{value:"2026-10-20T10:00"}});
 fireEvent.change(screen.getByLabelText("참여 마감 (KST)"),{target:{value:"2026-10-20T11:00"}});
}
it("saves an actual linked source with explicit windows and keeps rewards server-derived",async()=>{
 const fetcher=vi.fn(async()=>Response.json(data));vi.stubGlobal("fetch",fetcher);
 render(<LiveParticipationManager liveEventId={live} locale="ko" canWrite getAccessToken={token}/>);
 await screen.findByLabelText("참여 유형");fields();fireEvent.click(screen.getByRole("button",{name:"저장"}));
 await screen.findByText("방송 참여 설정을 저장했습니다.");
 const [,request]=fetcher.mock.calls.find(call=>(call as unknown as [string,RequestInit])[1]?.method==="POST") as unknown as [string,RequestInit];
 const body=JSON.parse(String(request.body));expect(body).toMatchObject({liveEventId:live,key:"story",kind:"text",phase:"before",certificationMissionId:cert,public:false,enabled:false,opensAt:"2026-10-20T01:00:00.000Z",closesAt:"2026-10-20T02:00:00.000Z"});
 expect(body).not.toHaveProperty("points");expect(body).not.toHaveProperty("owner");
});
it("retains an uncertain or stale configuration instead of discarding the editor's source and text",async()=>{
 vi.stubGlobal("fetch",vi.fn(async(_url:string,request?:RequestInit)=>request?.method==="POST"?Response.json({error:{code:"LIVE_PARTICIPATION_STALE_REVISION"}},{status:409}):Response.json(data)));
 render(<LiveParticipationManager liveEventId={live} locale="ko" canWrite getAccessToken={token}/>);
 await screen.findByLabelText("참여 유형");fields();fireEvent.click(screen.getByRole("button",{name:"저장"}));
 await screen.findByText("다른 관리자가 수정했습니다. 새로고침 후 다시 선택해 주세요.");expect(screen.getByLabelText("공개 제목")).toHaveValue("실제 방송 사연");expect(screen.getByLabelText("연결할 실제 원천")).toHaveValue(cert);
});
it("keeps viewer configuration read-only",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json(data)));
 render(<LiveParticipationManager liveEventId={live} locale="en" canWrite={false} getAccessToken={token}/>);
 await waitFor(()=>expect(screen.getByLabelText("Activity")).toBeDisabled());expect(screen.getByRole("button",{name:"Save"})).toBeDisabled();
});
