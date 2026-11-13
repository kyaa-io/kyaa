import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createGroupHandler } from "./routes";
const me = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
function setup() {
 const rpc = vi.fn().mockResolvedValue({ items: [] });
 const authorize = vi.fn(async (auth: string | null) => { if (auth !== "Bearer valid") throw new AuthError("AUTHENTICATION_REQUIRED", 401, "Login"); return { appUserId: me }; });
 const authorizeAdmin = vi.fn(async () => ({ appUserId: me, allowlistId: other, role: "viewer" as const, email: "viewer@example.com" }));
 return { rpc, authorize, authorizeAdmin, handler: createGroupHandler({ rpc, authorize, authorizeAdmin }) };
}
function req(path: string, input?: unknown, auth: string | null = "Bearer valid") { return new Request(`https://kyaa.test${path}`, { method: input === undefined ? "GET" : "POST", headers: { ...(auth ? { authorization: auth } : {}), "content-type": "application/json" }, body: input === undefined ? undefined : JSON.stringify(input) }); }
describe("group boundaries", () => {
 it("forwards a valid page language to name-reading operations only",async()=>{const s=setup();for(const operation of ["directory","detail"] as const){expect((await s.handler(operation,req("/api/groups?locale=ru",undefined,null),{id:me})).status).toBe(200);expect(s.rpc).toHaveBeenLastCalledWith("groups_dispatch",expect.objectContaining({p_input:expect.objectContaining({locale:"ru"})}));}expect((await s.handler("directory",req("/api/groups?locale=xx",undefined,null))).status).toBe(400);await s.handler("directory",req("/api/groups",undefined,null));expect(s.rpc.mock.lastCall?.[1].p_input).not.toHaveProperty("locale");});
 it("validates and forwards the artist role filter",async()=>{const s=setup();expect((await s.handler("directory",req("/api/groups?type=fan&artistRole=singer",undefined,null))).status).toBe(200);expect(s.rpc).toHaveBeenLastCalledWith("groups_dispatch",expect.objectContaining({p_input:expect.objectContaining({type:"fan",artistRole:"singer"})}));expect((await s.handler("directory",req("/api/groups?artistRole=unknown",undefined,null))).status).toBe(400);});
 it("accepts the hobby-and-brand directory filter",async()=>{const s=setup();expect((await s.handler("directory",req("/api/groups?type=nonfan&limit=20",undefined,null))).status).toBe(200);expect(s.rpc).toHaveBeenLastCalledWith("groups_dispatch",expect.objectContaining({p_input:expect.objectContaining({type:"nonfan"})}));expect((await s.handler("directory",req("/api/groups?type=other",undefined,null))).status).toBe(400);});
 it("allows public bounded discovery without inventing owner", async () => { const s = setup(); expect((await s.handler("directory", req("/api/groups?limit=8&type=hobby", undefined, null))).status).toBe(200); expect(s.rpc).toHaveBeenCalledWith("groups_dispatch", expect.objectContaining({ p_actor: null, p_input: expect.objectContaining({ limit: 8, type: "hobby" }) })); expect(s.authorize).not.toHaveBeenCalled(); });
 it("rejects invalid supplied credentials on public reads", async () => { const s = setup(); expect((await s.handler("directory", req("/api/groups", undefined, "bad"))).status).toBe(401); expect(s.rpc).not.toHaveBeenCalled(); });
 it("requires ownership for joined directory and all mutations", async () => { const s = setup(); expect((await s.handler("directory", req("/api/groups?mine=joined", undefined, null))).status).toBe(401); expect((await s.handler("join", req("/api/groups", { requestId: other }, null), { id: me })).status).toBe(401); expect(s.rpc).not.toHaveBeenCalled(); });
 it("rejects client actor injection and duplicate queries", async () => { const s = setup(); expect((await s.handler("join", req("/api", { requestId: other, appUserId: other }), { id: me })).status).toBe(400); expect((await s.handler("directory", req("/api?type=fan&type=hobby"))).status).toBe(400); expect(s.rpc).not.toHaveBeenCalled(); });
 it("injects server actor and preserves replay key", async () => { const s = setup(); expect((await s.handler("join", req("/api", { requestId: other, answer: " hello " }), { id: me })).status).toBe(200); expect(s.rpc).toHaveBeenCalledWith("groups_dispatch", { p_operation: "join", p_actor: me, p_page_id: me, p_item_id: null, p_admin_id: null, p_input: { requestId: other, answer: "hello" } }); });
 it("blocks viewer approvals before RPC", async () => { const s = setup(); expect((await s.handler("review", req("/api", { action: "approve", requestId: other }), { itemId: me })).status).toBe(403); expect(s.rpc).not.toHaveBeenCalled(); });
 it("fails closed and does not return private SQL errors", async () => { const s = setup(); s.rpc.mockRejectedValue(new Error("private row contents")); const r = await s.handler("detail", req("/api"), { id: me }); expect(r.status).toBe(503); expect(await r.text()).not.toContain("private row"); });
 it("bounds streamed messages before persistence", async () => { const s = setup(); const r = await s.handler("message", req("/api", { body: "x".repeat(99000), requestId: other }), { id: me, itemId: other }); expect(r.status).toBe(413); expect(s.rpc).not.toHaveBeenCalled(); });
 it("keeps passport-owned discovery separate and authenticated", async()=>{const s=setup();expect((await s.handler("directory",req("/api/groups?owned=1",undefined,null))).status).toBe(401);expect((await s.handler("directory",req("/api/groups?owned=1&mine=joined"))).status).toBe(200);expect(s.rpc).toHaveBeenCalledWith("groups_dispatch",expect.objectContaining({p_input:expect.objectContaining({owned:true,mine:"joined"})}));});
 it("allows admin viewers to list bindings and forbids revocation",async()=>{const s=setup();expect((await s.handler("artist-bindings",req("/api"),{id:me})).status).toBe(200);expect((await s.handler("artist-unbind",req("/api",{appUserId:other,requestId:me}),{id:me})).status).toBe(403);expect(s.rpc).toHaveBeenCalledTimes(1);expect(s.rpc).toHaveBeenCalledWith("groups_content_dispatch",expect.objectContaining({p_operation:"artist-bindings",p_admin_id:other}));});

 it("passes threaded comment assets through strict bounded schema",async()=>{const s=setup();expect((await s.handler("comment",req("/api",{body:"Reply",parentId:other,assetIds:[other],requestId:me}),{id:me,itemId:other})).status).toBe(200);expect(s.rpc).toHaveBeenCalledWith("groups_content_dispatch",expect.objectContaining({p_operation:"comment",p_input:{body:"Reply",parentId:other,assetIds:[other],requestId:me}}));});
 it("allows viewer report evidence reads with server admin identity",async()=>{const s=setup();expect((await s.handler("report-evidence",req("/api"),{id:me,itemId:other})).status).toBe(200);expect(s.rpc).toHaveBeenCalledWith("groups_content_dispatch",expect.objectContaining({p_operation:"report-evidence",p_admin_id:other,p_item_id:other}));});
 it("keeps page notification changes idempotent and does not accept arbitrary settings",async()=>{const s=setup();expect((await s.handler("set-notifications",req("/api",{enabled:false}),{id:me})).status).toBe(200);expect((await s.handler("set-notifications",req("/api",{enabled:true,actorId:other}),{id:me})).status).toBe(400);});

 it("accepts optional uploaded representative images for applications and settings",async()=>{const s=setup();expect((await s.handler("apply",req("/api",{kind:"hobby",name:"Photo page",description:"Description",imageAssetId:other,requestId:me}))).status).toBe(200);expect(s.rpc).toHaveBeenCalledWith("groups_dispatch",expect.objectContaining({p_input:expect.objectContaining({imageAssetId:other})}));expect((await s.handler("settings",req("/api",{name:"Photo page",description:"Description",question:null,anonymous:false,imageAssetId:null,requestId:other}),{id:me})).status).toBe(200);});

 it("re-derives the room link kind on the server and rejects links outside the allowed hosts",async()=>{const s=setup();expect((await s.handler("apply",req("/api",{kind:"hobby",name:"Room",description:"Description",externalLinks:[{url:"https://discord.gg/abc",kind:"band"}],requestId:me}))).status).toBe(200);expect(s.rpc).toHaveBeenLastCalledWith("groups_dispatch",expect.objectContaining({p_input:expect.objectContaining({externalLinks:[{kind:"discord",url:"https://discord.gg/abc"}]})}));s.rpc.mockClear();expect((await s.handler("settings",req("/api",{name:"Room",description:"",question:null,anonymous:false,externalLinks:[{url:"https://open.kakao.com.evil.com/o/a"}],requestId:other}),{id:me})).status).toBe(400);expect((await s.handler("apply",req("/api",{kind:"hobby",name:"Room",description:"Description",externalLinks:[{url:"http://band.us/band/1"}],requestId:me}))).status).toBe(400);expect(s.rpc).not.toHaveBeenCalled();});
});

it('derives message ownership from the authenticated actor',async()=>{
 const s=setup();s.rpc.mockResolvedValue({items:[{id:me,profileId:me,nickname:'나',body:'내 메시지',createdAt:'2026-11-01T10:00:00Z',mine:false},{id:other,profileId:other,nickname:'팬',body:'상대 메시지',createdAt:'2026-11-01T10:01:00Z',mine:true}]});
 const response=await s.handler('messages',req('/api/groups/'+me+'/rooms/'+other+'/messages'),{id:me,itemId:other});expect(response.status).toBe(200);expect((await response.json()).items.map((item:{mine:boolean})=>item.mine)).toEqual([true,false]);
});

it.each([true,false,undefined])('preserves server room send permission %s',async(canSend)=>{
 const s=setup();s.rpc.mockResolvedValue({items:[],canSend});
 const response=await s.handler('messages',req('/api'),{id:me,itemId:other});expect(response.status).toBe(200);expect((await response.json()).canSend).toBe(canSend);
});
it("reactivates the legacy master only for a complete four-category save",async()=>{const s=setup(),categories={notices:true,events:false,recipients:true,activity:false};expect((await s.handler('set-notifications',req('/api',categories),{id:me})).status).toBe(200);expect(s.rpc).toHaveBeenLastCalledWith('groups_content_dispatch',expect.objectContaining({p_actor:me,p_input:{enabled:true,...categories}}));await s.handler('set-notifications',req('/api',{enabled:false}),{id:me});expect(s.rpc).toHaveBeenLastCalledWith('groups_content_dispatch',expect.objectContaining({p_input:{enabled:false}}));for(const body of [{notices:true},{...categories,enabled:false},{...categories,actorId:other},{...categories,events:'true'}])expect((await s.handler('set-notifications',req('/api',body),{id:me})).status).toBe(400);});

it('requires authentication and binds own reports only to the session actor',async()=>{
 const s=setup();s.rpc.mockResolvedValue({items:[],nextCursor:null});expect((await s.handler('own-reports',req('/api/groups/my/reports',undefined,null))).status).toBe(401);expect(s.rpc).not.toHaveBeenCalled();
 expect((await s.handler('own-reports',req('/api/groups/my/reports?actorId='+other))).status).toBe(200);
 expect(s.rpc).toHaveBeenCalledWith('groups_content_dispatch',{p_operation:'own-reports',p_actor:me,p_page_id:null,p_item_id:null,p_admin_id:null,p_input:{limit:30}});
});
it('bounds own-report pagination and rejects malformed or duplicate cursors',async()=>{
 const s=setup();s.rpc.mockResolvedValue({items:[],nextCursor:null});for(const query of ['limit=31','limit=0','cursor=no','cursor='+me+'&cursor='+other])expect((await s.handler('own-reports',req('/api/groups/my/reports?'+query))).status).toBe(400);
 expect(s.rpc).not.toHaveBeenCalled();await s.handler('own-reports',req('/api/groups/my/reports?cursor='+me+'&limit=2'));expect(s.rpc).toHaveBeenCalledWith('groups_content_dispatch',expect.objectContaining({p_input:{cursor:me,limit:2}}));
 s.rpc.mockRejectedValue(new Error('GROUPS_NOT_FOUND'));expect((await s.handler('own-reports',req('/api/groups/my/reports?cursor='+other))).status).toBe(404);
});

it('strips unapproved own-report response fields and rejects unsafe links',async()=>{const s=setup(),row={id:me,reason:'My reason',status:'resolved',resolution:'Reason',createdAt:'2026-11-03T00:00:00Z',targetPath:null,reviewedBy:other,body:'private'};s.rpc.mockResolvedValue({items:[row],nextCursor:null});const response=await s.handler('own-reports',req('/api/groups/my/reports'));expect((await response.json()).items[0]).toEqual({id:me,reason:'My reason',status:'resolved',resolution:'Reason',createdAt:'2026-11-03T00:00:00Z',targetPath:null});s.rpc.mockResolvedValue({items:[{...row,targetPath:'https://unsafe.test'}],nextCursor:null});expect((await s.handler('own-reports',req('/api/groups/my/reports'))).status).toBe(400);});

it('allows today featured first page and rejects its cursor without changing existing sorts',async()=>{
 const s=setup();
 expect((await s.handler('directory',req('/api/groups?sort=today&limit=3',undefined,null))).status).toBe(200);
 expect(s.rpc).toHaveBeenLastCalledWith('groups_dispatch',expect.objectContaining({p_input:expect.objectContaining({sort:'today',limit:3})}));
 const count=s.rpc.mock.calls.length;
 expect((await s.handler('directory',req(`/api/groups?sort=today&cursor=${me}`,undefined,null))).status).toBe(400);
 expect(s.rpc).toHaveBeenCalledTimes(count);
 expect((await s.handler('directory',req(`/api/groups?sort=recent&cursor=${me}`,undefined,null))).status).toBe(200);
});

it('binds visited pagination to the authenticated owner and joined scope',async()=>{
 const s=setup(),cursor={v:1,sort:'visited',owner:me,id:other,lastSeenAt:'2026-11-03T09:00:00+00:00'};
 s.rpc.mockResolvedValue({items:[],totalCount:1,nextCursor:cursor});
 const first=await s.handler('directory',req('/api/groups?mine=joined&sort=visited&limit=3'));
 expect(first.status).toBe(200);const token=(await first.json()).nextCursor;
 expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
 await s.handler('directory',req(`/api/groups?mine=joined&sort=visited&cursor=${token}`));
 expect(s.rpc).toHaveBeenLastCalledWith('groups_dispatch',expect.objectContaining({p_actor:me,p_input:expect.objectContaining({sort:'visited',cursor})}));
 const wrong=Buffer.from(JSON.stringify({...cursor,owner:other})).toString('base64url'),calls=s.rpc.mock.calls.length;
 expect((await s.handler('directory',req(`/api/groups?mine=joined&sort=visited&cursor=${wrong}`))).status).toBe(400);
 expect((await s.handler('directory',req('/api/groups?mine=joined&sort=visited&cursor=bad'))).status).toBe(400);
 expect((await s.handler('directory',req('/api/groups?mine=joined&sort=visited&type=fan'))).status).toBe(400);
 expect((await s.handler('directory',req('/api/groups?mine=joined&sort=visited',undefined,null))).status).toBe(401);
 expect(s.rpc).toHaveBeenCalledTimes(calls);
});

// 합성 mock: RPC 응답을 흉내 낸 전달 시험이며 실제 DB 판정이 아니다.
it('passes room list canEnter and reason through unchanged',async()=>{
 const s=setup();const items=[{id:me,name:'골드 방',minimumTier:'Gold',status:'open',canEnter:false,reason:'jjinfan_required'},{id:other,name:'자유 방',minimumTier:'Member',status:'open',canEnter:true,reason:'ok'}];s.rpc.mockResolvedValue({items});
 const response=await s.handler('rooms',req('/api/groups/'+me+'/rooms'),{id:me});expect(response.status).toBe(200);expect((await response.json()).items.map((i:{canEnter:boolean;reason:string})=>[i.canEnter,i.reason])).toEqual([[false,'jjinfan_required'],[true,'ok']]);
});
it.each(['jjinfan_required','stage_low','not_member'])('blocks room entry with the server reason %s',async(reason)=>{
 const s=setup();s.rpc.mockRejectedValue(new Error('GROUPS_FORBIDDEN:'+reason));
 const response=await s.handler('messages',req('/api/groups/'+me+'/rooms/'+other+'/messages'),{id:me,itemId:other});expect(response.status).toBe(403);expect(await response.json()).toEqual({error:{code:'GROUPS_FORBIDDEN',reason}});
});
it('keeps a plain room denial and ignores unknown reasons',async()=>{
 const s=setup();s.rpc.mockRejectedValue(new Error('GROUPS_FORBIDDEN'));expect(await (await s.handler('messages',req('/api'),{id:me,itemId:other})).json()).toEqual({error:{code:'GROUPS_FORBIDDEN'}});
 s.rpc.mockRejectedValue(new Error('GROUPS_FORBIDDEN:private row'));expect(await (await s.handler('messages',req('/api'),{id:me,itemId:other})).json()).toEqual({error:{code:'GROUPS_FORBIDDEN'}});
});
describe("group post input", () => {
 describe("rich post body", () => {
  const page = "20000000-0000-4000-8000-000000000001", asset = "30000000-0000-4000-8000-000000000001", requestId = "40000000-0000-4000-8000-000000000001";
  const input = { title: "제목", body: "클라이언트가 보낸 글", visibility: "public", assetIds: [asset], requestId };
  const bodyDoc = { type: "doc", content: [{ type: "paragraph", attrs: { onclick: "alert(1)" }, content: [{ type: "text", text: "본문" }] }, { type: "attachment", attrs: { assetId: asset, kind: "image", src: "https://evil.example/a.png" } }] };
  it.each(["post", "post-edit"] as const)("%s sends the sanitized document and a body derived on the server", async operation => {
   const s = setup();
   expect((await s.handler(operation, req("/api", { ...input, bodyDoc }), { id: page, itemId: other })).status).toBe(200);
   const payload = s.rpc.mock.calls[0]?.[1]?.p_input;
   expect(payload.body).toBe("본문");
   expect(payload.bodyDoc).toEqual({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "본문" }] }, { type: "attachment", attrs: { assetId: asset, kind: "image" } }] });
   expect(s.rpc.mock.calls[0]?.[1]?.p_actor).toBe(me);
  });
  it("keeps a body for a post that holds only media", async () => {
   const s = setup();
   await s.handler("post", req("/api", { ...input, bodyDoc: { type: "doc", content: [{ type: "attachment", attrs: { assetId: asset, kind: "image" } }] } }), { id: page });
   expect(s.rpc.mock.calls[0]?.[1]?.p_input.body).toBe("제목");
  });
  it.each([
   ["script node", { type: "doc", content: [{ type: "script" }] }],
   ["javascript link", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] }],
   ["media of another post", { type: "doc", content: [{ type: "attachment", attrs: { assetId: other, kind: "image" } }] }],
  ])("refuses %s without calling the database", async (_name, value) => {
   const s = setup();
   expect((await s.handler("post", req("/api", { ...input, bodyDoc: value }), { id: page })).status).toBe(400);
   expect(s.rpc).not.toHaveBeenCalled();
  });
  it("leaves a plain request unchanged", async () => {
   const s = setup();
   await s.handler("post", req("/api", input), { id: page });
   expect(s.rpc.mock.calls[0]?.[1]?.p_input.body).toBe("클라이언트가 보낸 글");
   expect(s.rpc.mock.calls[0]?.[1]?.p_input.bodyDoc).toBeUndefined();
  });
  it("asks for the document only when the reader requests format=rich", async () => {
   const s = setup();
   s.rpc.mockResolvedValue({ id: other, title: "제목", body: "본문", assets: [] });
   const plain = await (await s.handler("post-detail", req(`/api/groups/${page}/posts/${other}`), { id: page, itemId: other })).json();
   expect(s.rpc.mock.calls[0]?.[1]?.p_input.format).toBeUndefined();
   expect(plain.bodyDoc).toBeUndefined();
   s.rpc.mockClear();
   s.rpc.mockResolvedValue({ id: other, title: "제목", body: "그대로\n고친 줄", assets: [{ id: asset, kind: "image" }], bodyDoc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "그대로", marks: [{ type: "bold" }] }] }, { type: "paragraph", content: [{ type: "text", text: "고칠 줄" }] }, { type: "attachment", attrs: { assetId: other, kind: "image" } }] } });
   const rich = await (await s.handler("post-detail", req(`/api/groups/${page}/posts/${other}?format=rich`), { id: page, itemId: other })).json();
   expect(s.rpc.mock.calls[0]?.[1]?.p_input.format).toBe("rich");
   expect(rich.bodyDoc.content.map((node: { type: string }) => node.type)).toEqual(["paragraph", "paragraph"]);
   expect(rich.bodyDoc.content[0].content[0].marks).toEqual([{ type: "bold" }]);
   expect(rich.bodyDoc.content[1].content[0].text).toBe("고친 줄");
  });
  it("keeps a post that holds only media when its body is the title", async () => {
   const s = setup();
   s.rpc.mockResolvedValue({ id: other, title: "제목", body: "제목", assets: [{ id: asset, kind: "image" }], bodyDoc: { type: "doc", content: [{ type: "attachment", attrs: { assetId: asset, kind: "image" } }] } });
   const rich = await (await s.handler("post-detail", req(`/api/groups/${page}/posts/${other}?format=rich`), { id: page, itemId: other })).json();
   expect(rich.bodyDoc.content).toEqual([{ type: "attachment", attrs: { assetId: asset, kind: "image" } }]);
  });
  it("refuses an unknown format", async () => {
   const s = setup();
   expect((await s.handler("post-detail", req(`/api/groups/${page}/posts/${other}?format=html`), { id: page, itemId: other })).status).toBe(400);
   expect(s.rpc).not.toHaveBeenCalled();
  });
  it("M1: marks an unreadable stored document and does not pass it on", async () => {
   const s = setup();
   s.rpc.mockResolvedValue({ id: other, title: "제목", body: "본문", assets: [], bodyDoc: { type: "doc", content: [{ type: "script" }] } });
   const rich = await (await s.handler("post-detail", req(`/api/groups/${page}/posts/${other}?format=rich`), { id: page, itemId: other })).json();
   expect(rich.bodyDoc).toBeUndefined();
   expect(rich.bodyDocUnavailable).toBe(true);
   expect(rich.body).toBe("본문");
  });
  it("M1: a post without a document stays unmarked", async () => {
   const s = setup();
   s.rpc.mockResolvedValue({ id: other, title: "제목", body: "본문", assets: [] });
   expect((await (await s.handler("post-detail", req(`/api/groups/${page}/posts/${other}?format=rich`), { id: page, itemId: other })).json()).bodyDocUnavailable).toBeUndefined();
  });
  it.each(["post", "post-edit"] as const)("M2: %s accepts a document with no body and derives it", async operation => {
   const s = setup(), { body: _body, ...withoutBody } = input;
   expect((await s.handler(operation, req("/api", { ...withoutBody, assetIds: [], bodyDoc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "본문" }] }] } }), { id: page, itemId: other })).status).toBe(200);
   expect(s.rpc.mock.calls[0]?.[1]?.p_input.body).toBe("본문");
  });
  it("M2: still requires a body when there is no document", async () => {
   const s = setup(), { body: _body, ...withoutBody } = input;
   expect((await s.handler("post", req("/api", withoutBody), { id: page })).status).toBe(400);
   expect(s.rpc).not.toHaveBeenCalled();
  });
  it("M2: an old plain post at the 20,000 character limit saves through the editor", async () => {
   const s = setup(), { body: _body, ...withoutBody } = input;
   const line = "가".repeat(39), long = { type: "doc", content: Array.from({ length: 500 }, () => ({ type: "paragraph", content: [{ type: "text", text: line }] })) };
   const response = await s.handler("post-edit", req("/api", { ...withoutBody, assetIds: [], bodyDoc: long }), { id: page, itemId: other });
   expect(response.status).toBe(200);
   expect(s.rpc.mock.calls[0]?.[1]?.p_input.body.length).toBe(19999);
  });
  it("M2: keeps the old limit on other operations and a limit on posts", async () => {
   const s = setup();
   expect((await s.handler("comment", req("/api", { body: "가", requestId, pad: "a".repeat(100_000) }), { id: page, itemId: other })).status).toBe(413);
   expect((await s.handler("post", req("/api", { ...input, pad: "a".repeat(400_000) }), { id: page })).status).toBe(413);
  });
  it("requires a login to write", async () => {
   const s = setup();
   expect((await s.handler("post", req("/api", { ...input, bodyDoc }, null), { id: page })).status).toBe(401);
   expect(s.rpc).not.toHaveBeenCalled();
  });
 });
});
describe("group post dislikes", () => {
 const page = "30000000-0000-4000-8000-000000000003", requestId = "40000000-0000-4000-8000-000000000004";
 it("writes a dislike only for a signed-in reader with a boolean choice", async () => {
  const s = setup();
  s.rpc.mockResolvedValue({ liked: false, count: 2, disliked: true, dislikeCount: null });
  const response = await s.handler("dislike", req(`/api/groups/${page}/posts/${other}/dislike`, { disliked: true, requestId }), { id: page, itemId: other });
  expect(await response.json()).toEqual({ liked: false, count: 2, disliked: true, dislikeCount: null });
  expect(s.rpc).toHaveBeenCalledWith("groups_content_dispatch", expect.objectContaining({ p_operation: "dislike", p_actor: me, p_page_id: page, p_item_id: other, p_input: { disliked: true, requestId }, p_admin_id: null }));
  s.rpc.mockClear();
  expect((await s.handler("dislike", req(`/api/groups/${page}/posts/${other}/dislike`, { disliked: true, requestId }, null), { id: page, itemId: other })).status).toBe(401);
  for (const input of [{ disliked: "yes", requestId }, { disliked: true }, { disliked: true, requestId, dislikeCount: 9 }])
   expect((await s.handler("dislike", req(`/api/groups/${page}/posts/${other}/dislike`, input), { id: page, itemId: other })).status).toBe(400);
  expect(s.rpc).not.toHaveBeenCalled();
 });
 it("leaves the database's dislike answer untouched on the post detail", async () => {
  const s = setup();
  s.rpc.mockResolvedValue({ id: other, title: "제목", body: "본문", assets: [], disliked: false, dislikeCount: null });
  const guest = await (await s.handler("post-detail", req(`/api/groups/${page}/posts/${other}`, undefined, null), { id: page, itemId: other })).json();
  expect(guest.dislikeCount).toBeNull();
  expect(s.rpc).toHaveBeenLastCalledWith("groups_content_dispatch", expect.objectContaining({ p_actor: null, p_admin_id: null }));
 });
});

describe("K6: a group board post pays the 글쓰기 mission", () => {
 const post = "10000000-0000-4000-8000-0000000000aa", celebrity = "10000000-0000-4000-8000-0000000000cc";
 function board(celebrityId: string | null, award: () => Promise<unknown> = async () => ({ points: 20, stampId: null, replayed: false, capped: false, reason: null })) {
  const s = setup();
  s.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => name === "groups_content_dispatch" ? { id: post, title: "T" }
   : name === "groups_dispatch" && args.p_operation === "detail" ? { page: { id: me, celebrityId }, membership: null, bookmarked: false }
   : name === "record_dukjil_action" ? award() : null);
  return s;
 }
 const write = (s: ReturnType<typeof setup>) => s.handler("post", req("/api", { title: "오늘 무대 후기", body: "앵콜 곡까지 다 들었어요 정말 좋았어요", visibility: "public", requestId: other }), { id: me });
 it("awards once per post with the post id, the creator and the text length", async () => {
  const s = board(celebrity);
  const response = await write(s);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: post, title: "T", reward: { points: 20, stamps: 0 } });
  const calls = s.rpc.mock.calls.filter(([name]) => name === "record_dukjil_action");
  expect(calls).toHaveLength(1);
  expect(calls[0]![1]).toMatchObject({ p_user: me, p_celebrity: celebrity, p_action_key: "post", p_source_key: post, p_params: { chars: [..."오늘 무대 후기 앵콜 곡까지 다 들었어요 정말 좋았어요"].length } });
 });
 it("pays nothing on a page without a creator and never fails a saved post", async () => {
  const none = board(null);
  expect((await write(none)).status).toBe(200);
  expect(none.rpc.mock.calls.some(([name]) => name === "record_dukjil_action")).toBe(false);
  const failing = board(celebrity, async () => { throw new Error("DUKJIL_CONTENT_TOO_SHORT"); });
  expect((await write(failing)).status).toBe(200);
 });
 it("sends a short post to the award like any other: the length is not judged here", async () => {
  const s = board(celebrity);
  await s.handler("post", req("/api", { title: "응", body: "네", visibility: "public", requestId: other }), { id: me });
  const calls = s.rpc.mock.calls.filter(([name]) => name === "record_dukjil_action");
  expect(calls).toHaveLength(1);
  expect(calls[0]![1]).toMatchObject({ p_params: { chars: 3 } });
 });
 it("counts the title once for a post holding only media", async () => {
  const s = board(celebrity), asset = "30000000-0000-4000-8000-000000000009";
  await s.handler("post", req("/api", { title: "사진 올려요", visibility: "public", assetIds: [asset], bodyDoc: { type: "doc", content: [{ type: "attachment", attrs: { assetId: asset, kind: "image" } }] }, requestId: other }), { id: me });
  const call = s.rpc.mock.calls.find(([name]) => name === "record_dukjil_action")!;
  expect(call[1].p_params.chars).toBe([..."사진 올려요"].length);
  const plain = board(celebrity);
  await plain.handler("post", req("/api", { title: "사진 올려요", body: "사진 올려요", visibility: "public", requestId: other }), { id: me });
  expect(plain.rpc.mock.calls.find(([name]) => name === "record_dukjil_action")![1].p_params.chars).toBe([..."사진 올려요 사진 올려요"].length);
 });
 it("answers why nothing was paid, and nothing for a replayed write", async () => {
  expect(await (await write(board(celebrity, async () => { throw new Error("PASSPORT_REQUIRED"); }))).json()).toEqual({ id: post, title: "T", reward: { points: 0, stamps: 0, skippedReason: "passport_required" } });
  expect(await (await write(board(celebrity, async () => ({ points: 0, stampId: null, replayed: false, capped: true, reason: "POINT_CAP" })))).json()).toEqual({ id: post, title: "T", reward: { points: 0, stamps: 0, skippedReason: "daily_limit" } });
  expect(await (await write(board(celebrity, async () => ({ points: 20, stampId: null, replayed: true, capped: false, reason: null })))).json()).toEqual({ id: post, title: "T" });
 });
 it("keeps a failure row when the page could not be read, and still answers the saved post", async () => {
  const s = setup();
  s.rpc.mockImplementation(async (name: string) => { if (name === "groups_content_dispatch") return { id: post, title: "T" }; if (name === "groups_dispatch") throw new Error("boom"); return null; });
  const response = await write(s);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ id: post, title: "T" });
  expect(s.rpc.mock.calls.some(([name]) => name === "record_dukjil_action")).toBe(false);
  expect(s.rpc).toHaveBeenCalledWith("record_dukjil_award_failure", expect.objectContaining({ p_user: me, p_celebrity: null, p_action: "post", p_source: post, p_message: expect.stringContaining("GROUP_POST_PAGE_UNREAD") }));
 });
 it("does not award an edit", async () => {
  const s = board(celebrity);
  await s.handler("post-edit", req("/api", { title: "고친 제목", body: "고친 본문입니다 스무 자가 넘도록 길게", visibility: "public", requestId: other, expectedRevision: 1 }), { id: me, itemId: post });
  expect(s.rpc.mock.calls.some(([name]) => name === "record_dukjil_action")).toBe(false);
 });
});

it("accepts an authenticated photo-only room message and rejects empty or injected messages", async()=>{const s=setup();const input={body:"",assetId:other,requestId:me};expect((await s.handler("message",req("/api",input),{id:me,itemId:other})).status).toBe(200);expect(s.rpc).toHaveBeenLastCalledWith("groups_content_dispatch",expect.objectContaining({p_actor:me,p_input:input}));s.rpc.mockClear();for(const invalid of [{body:"",requestId:me},{...input,assetId:"bad"},{...input,actorId:other}])expect((await s.handler("message",req("/api",invalid),{id:me,itemId:other})).status).toBe(400);expect((await s.handler("message",req("/api",input,null),{id:me,itemId:other})).status).toBe(401);expect(s.rpc).not.toHaveBeenCalled();});
