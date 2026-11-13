import "@testing-library/jest-dom/vitest";
import { useEffect } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useRoomLinkFields } from "./room-link-fields";

afterEach(cleanup);
type Fields = ReturnType<typeof useRoomLinkFields>;
const seen: { current: Fields | null } = { current: null };
function Harness({ initial }: { initial?: string[] }) {
  const fields = useRoomLinkFields({ locale: "ko", initial });
  useEffect(() => { seen.current = fields; });
  return <form>{fields.node}</form>;
}
const inputs = () => screen.getAllByRole("textbox", { name: "방 링크" });
const readNow = () => { let value: ReturnType<Fields["read"]> = null; act(() => { value = seen.current!.read(); }); return value; };
const type = (index: number, value: string) => fireEvent.change(inputs()[index]!, { target: { value } });

it("starts with one empty row and shows the service icon as soon as the address is recognised", () => {
  const { container } = render(<Harness />);
  expect(inputs()).toHaveLength(1);
  expect(container.querySelector("[data-room-kind]")).toBeNull();
  type(0, "https://open.kakao.com/o/abc");
  expect(container.querySelector("[data-room-kind]")).toHaveAttribute("data-room-kind", "kakao-openchat");
  expect(seen.current!.links).toEqual([{ kind: "kakao-openchat", url: "https://open.kakao.com/o/abc" }]);
});

it("adds rows up to three, then hides the add action; extra rows can be removed", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "링크 추가" }));
  fireEvent.click(screen.getByRole("button", { name: "링크 추가" }));
  expect(inputs()).toHaveLength(3);
  expect(screen.queryByRole("button", { name: "링크 추가" })).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: /삭제|Remove/ })[0]!);
  expect(inputs()).toHaveLength(2);
  expect(screen.getByRole("button", { name: "링크 추가" })).toBeInTheDocument();
});

it("reads only the filled addresses; the kind is never sent", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "링크 추가" }));
  type(0, "https://discord.gg/abc");
  expect(readNow()).toEqual([{ url: "https://discord.gg/abc" }]);
});

it("an unsupported or duplicate address blocks reading and shows one error under the row", () => {
  render(<Harness />);
  type(0, "https://open.kakao.com.evil.com/o/abc");
  expect(readNow()).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("지원하지 않는 주소예요");
  expect(inputs()[0]).toHaveAttribute("aria-invalid", "true");
  type(0, "https://band.us/band/1");
  fireEvent.click(screen.getByRole("button", { name: "링크 추가" }));
  type(1, "https://band.us/band/1");
  expect(readNow()).toBeNull();
  expect(screen.getByRole("alert")).toBeInTheDocument();
});

it("starts from the saved links", () => {
  render(<Harness initial={["https://x.com/kyaa", "https://band.us/band/1"]} />);
  expect(inputs().map((input) => (input as HTMLInputElement).value)).toEqual(["https://x.com/kyaa", "https://band.us/band/1"]);
  expect(readNow()).toEqual([{ url: "https://x.com/kyaa" }, { url: "https://band.us/band/1" }]);
});
