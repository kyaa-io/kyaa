import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageNoticeModal } from "./page-notice-modal";

const props = { locale: "ko" as const, storageKey: "raffle-results:elina:1", title: "래플 결과가 발표됐어요", description: "응모한 선물의 당첨 여부를 확인해 보세요.", actionLabel: "내 결과 확인", actionHref: "/my/raffles?locale=ko" };
const session=vi.hoisted(()=>({ready:true,authenticated:false,ownerKey:'guest:1',request:vi.fn(async()=>({seen:false}))}));
vi.mock('./use-group-resource',()=>({useGroupRequest:()=>session}));
beforeEach(()=>{window.localStorage.clear();session.authenticated=false;session.ownerKey='guest:1';session.request.mockReset().mockResolvedValue({seen:false});});
afterEach(()=>cleanup());
describe('page notice modal',()=>{
 it.each(['button','escape','backdrop','action'])('remembers the round after %s close and allows another round',async(mode)=>{
  const first=render(<PageNoticeModal {...props}/>);
  const dialog=await screen.findByRole('dialog');
  if(mode==='button')fireEvent.click(screen.getByRole('button',{name:'닫기'}));
  if(mode==='escape')fireEvent.keyDown(document,{key:'Escape'});
  if(mode==='backdrop')fireEvent.pointerDown(dialog.parentElement!,{button:0});
  if(mode==='action')fireEvent.click(screen.getByRole('link',{name:'내 결과 확인'}));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(localStorage.getItem('kyaa:page-notice:guest:'+props.storageKey)).toBe('seen');
  first.unmount();const second=render(<PageNoticeModal {...props}/>);
  await act(async()=>{await Promise.resolve();});expect(screen.queryByRole('dialog')).toBeNull();
  second.rerender(<PageNoticeModal {...props} storageKey='raffle-results:elina:2'/>);
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  expect(session.request).not.toHaveBeenCalled();
 });
 it('reads server history and syncs local history for the signed-in owner',async()=>{
  session.authenticated=true;session.ownerKey='owner-a:1';session.request.mockResolvedValue({seen:true});
  const view=render(<PageNoticeModal {...props}/>);
  await act(async()=>{await Promise.resolve();});expect(screen.queryByRole('dialog')).toBeNull();
  expect(localStorage.getItem('kyaa:page-notice:owner-a:'+props.storageKey)).toBe('seen');
  view.unmount();render(<PageNoticeModal {...props}/>);
  await act(async()=>{await Promise.resolve();});expect(session.request).toHaveBeenLastCalledWith(expect.any(String),{method:'POST'});
 });
 it('keeps account history separate and remembers locally if the server write fails',async()=>{
  session.authenticated=true;session.ownerKey='owner-b:1';session.request.mockRejectedValue(new Error('offline'));
  render(<PageNoticeModal {...props}/>);await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button',{name:'닫기'}));
  expect(localStorage.getItem('kyaa:page-notice:owner-b:'+props.storageKey)).toBe('seen');
  expect(session.request).toHaveBeenLastCalledWith(expect.any(String),{method:'POST'});
 });
  it("does not open while disabled or while another dialog is open", async () => {
    const view = render(<PageNoticeModal {...props} enabled={false} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole("dialog")).toBeNull();
    view.unmount();
    document.body.insertAdjacentHTML("beforeend", '<div role="dialog" aria-label="다른 대화상자"></div>');
    render(<PageNoticeModal {...props} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.queryByText("래플 결과가 발표됐어요")).toBeNull();
  });
});
