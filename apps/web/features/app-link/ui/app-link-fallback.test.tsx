import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppLinkFallback } from "./app-link-fallback";

const destination={returnTo:"/s/0123456789abcdef0123456789abcdef?locale=ko",appUrl:"kyaa-app:///open?returnTo=%2Fs%2F0123456789abcdef0123456789abcdef%3Flocale%3Dko",valid:true,kind:"passport" as const};
const presentation={state:"generic" as const};
afterEach(()=>vi.useRealTimers());
describe("app link fallback",()=>{
 it("discloses configured installation choices and keeps their URLs unchanged",()=>{
  const apple="https://apps.apple.com/app/id123?campaign=test#install";
  const {container}=render(<AppLinkFallback locale="ko" destination={destination} presentation={presentation} stores={{apple,google:null}} sharePath="/open-app?returnTo=%2Fs%2Ffixture"/>);
  const install=container.querySelector("details")!;
  expect(install).not.toHaveAttribute("open");
  fireEvent.click(container.querySelector("summary")!);
  expect(install).toHaveAttribute("open");
  expect(screen.getByRole("link",{name:"App Store"})).toHaveAttribute("href",apple);
  expect(screen.getByRole("link",{name:"App Store"})).toHaveAttribute("data-outbound-tracking","off");
  expect(screen.queryByRole("link",{name:"Google Play"})).not.toBeInTheDocument();
 });
 it("contains keyboard focus in the failure sheet and restores it on Escape",()=>{
  vi.useFakeTimers();
  const {container}=render(<AppLinkFallback locale="ko" destination={destination} presentation={presentation} stores={{apple:null,google:null}} sharePath="/open-app?returnTo=fixture"/>);
  const open=screen.getByRole("link",{name:"앱에서 이어보기"});
  open.addEventListener("click",event=>event.preventDefault());
  fireEvent.click(open);act(()=>vi.advanceTimersByTime(1400));
  const dialog=screen.getByRole("dialog");
  expect(container.querySelector("section[inert]")).toBeInTheDocument();
  const close=within(dialog).getByRole("button",{name:"닫기"});
  expect(close).toHaveFocus();
  fireEvent.keyDown(document,{key:"Tab",shiftKey:true});
  expect(within(dialog).getByRole("link",{name:"앱 다시 열기"})).toHaveFocus();
  fireEvent.keyDown(document,{key:"Escape"});act(()=>vi.runAllTicks());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(open).toHaveFocus();
 });
 it("keeps native event links actionable without a nonexistent web detail",()=>{render(<AppLinkFallback locale="ko" destination={{returnTo:"/participation/events/10000000-0000-4000-8000-000000000001",appUrl:"kyaa-app:///open?returnTo=event",valid:true,kind:"content",webReturnTo:"/"}} presentation={presentation} stores={{apple:null,google:null}} sharePath="/open-app?returnTo=event"/>);expect(screen.getByRole("link",{name:"앱에서 이어보기"})).toHaveAttribute("href","kyaa-app:///open?returnTo=event");expect(screen.getByRole("link",{name:"상위 페이지로 이동"})).toHaveAttribute("href","/");expect(screen.queryByRole("link",{name:"웹에서 계속"})).not.toBeInTheDocument();});
 it("keeps app, unavailable install, and exact web continuation as separate choices",()=>{render(<AppLinkFallback locale="ko" destination={destination} presentation={presentation} stores={{apple:null,google:null}} sharePath="/open-app?returnTo=%2Fs%2Ffixture"/>);expect(screen.getByRole("link",{name:"앱에서 이어보기"})).toHaveAttribute("href",destination.appUrl);expect(screen.getByRole("link",{name:"웹에서 계속"})).toHaveAttribute("href",destination.returnTo);expect(screen.getByText(/스토어 링크를 준비 중이에요/)).toBeInTheDocument();expect(screen.queryByRole("link",{name:/App Store|Google Play/})).not.toBeInTheDocument();});
 it("offers retry without claiming that a timeout proves the app is absent",()=>{vi.useFakeTimers();render(<AppLinkFallback locale="ko" destination={destination} presentation={presentation} stores={{apple:null,google:null}} sharePath="/open-app?returnTo=%2Fs%2Ffixture"/>);const open=screen.getByRole("link",{name:"앱에서 이어보기"});open.addEventListener("click",event=>event.preventDefault());fireEvent.click(open);act(()=>vi.advanceTimersByTime(1400));expect(screen.getByRole("dialog",{name:"앱이 열리지 않았나요?"})).toBeInTheDocument();expect(screen.getByText(/설치 후 이 링크를 다시 열면 이어갈 수 있어요/)).toBeInTheDocument();expect(screen.getByRole("link",{name:"앱 다시 열기"})).toHaveAttribute("href",destination.appUrl);});
 it("never sends an invalid target to the app",()=>{render(<AppLinkFallback locale="en" destination={{returnTo:"/",appUrl:"kyaa-app:///open?returnTo=%2F",valid:false,kind:"content"}} presentation={presentation} stores={{apple:null,google:null}} sharePath="/open-app?returnTo=%2F"/>);expect(screen.getByRole("heading",{name:"This link can’t be opened"})).toBeInTheDocument();expect(screen.queryByRole("link",{name:"Continue in app"})).not.toBeInTheDocument();expect(screen.getByRole("link",{name:"Continue on the web"})).toHaveAttribute("href","/");});
 it("removes unavailable target details and links only to its safe parent",()=>{render(<AppLinkFallback locale="ko" destination={{...destination,returnTo:"/c/private-artist"}} presentation={{state:"unavailable",reason:"unavailable",parentHref:"/celebrities"}} stores={{apple:null,google:null}} sharePath="/open-app?returnTo=%2Fc%2Fprivate-artist"/>);expect(screen.getByRole("heading",{name:"지금은 이 활동을 볼 수 없어요"})).toBeInTheDocument();expect(screen.queryByText("private-artist")).not.toBeInTheDocument();expect(screen.queryByRole("link",{name:"앱에서 이어보기"})).not.toBeInTheDocument();expect(screen.getByRole("link",{name:"상위 페이지로 이동"})).toHaveAttribute("href","/celebrities");});
});
