import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import styles from "./fan-action.module.css";
import { FanAction, FanActionStatus } from "./fan-action";

describe("FanAction", () => {
  it("renders a locale-preserving link with the shared neutral contract", () => {
    render(<FanAction href="/live?locale=ko">LIVE 둘러보기</FanAction>);
    expect(screen.getByRole("link", { name: "LIVE 둘러보기" })).toHaveAttribute(
      "href",
      "/live?locale=ko",
    );
  });

  it("renders a disabled busy button without firing the action", () => {
    const onClick = vi.fn();
    render(
      <FanAction disabled ariaBusy onClick={onClick} variant="primary">
        처리 중
      </FanAction>,
    );
    const button = screen.getByRole("button", { name: "처리 중" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("data-fan-action-emphasis", "primary");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("centers icon slots and associates complex helper text", () => {
    render(
      <FanAction
        href="/c/katseye/verify"
        variant="primary"
        leadingIcon={<span>ticket</span>}
        trailingIcon={<span>arrow</span>}
        helperText="예약하려면 KATSEYE Fan Passport가 필요해요."
      >
        팬 인증하기
      </FanAction>,
    );

    const action = screen.getByRole("link", { name: "팬 인증하기" });
    const helper = screen.getByText("예약하려면 KATSEYE Fan Passport가 필요해요.");
    expect(action).toHaveAttribute("aria-describedby", helper.id);
    expect(action).toHaveAttribute("data-has-leading", "true");
    expect(action).toHaveAttribute("data-has-trailing", "true");
  });

  it("renders an external action with a safe new-window contract", () => {
    render(
      <FanAction href="https://youtube.com/watch?v=1" external variant="primary">
        LIVE 시청하기
      </FanAction>,
    );

    expect(screen.getByRole("link", { name: "LIVE 시청하기" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.getByRole("link", { name: "LIVE 시청하기" })).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  it("renders the shared Passport context action as a link", () => {
    render(
      <FanAction href="/c/katseye/verify" variant="passport">
        <span>Fan Passport 발급받기</span>
        <span aria-hidden="true">→</span>
      </FanAction>,
    );

    expect(
      screen.getByRole("link", { name: "Fan Passport 발급받기" }),
    ).toHaveAttribute("href", "/c/katseye/verify");
  });
});

it('preserves current navigation and disclosure accessibility state',()=>{
 render(<><FanAction href='/my/wallet' aria-current='page'>Wallet</FanAction><FanAction aria-expanded={true} aria-controls='report-evidence'>Evidence</FanAction></>);
 expect(screen.getByRole('link',{name:'Wallet'})).toHaveAttribute('aria-current','page');
 expect(screen.getByRole('button',{name:'Evidence'})).toHaveAttribute('aria-expanded','true');
 expect(screen.getByRole('button',{name:'Evidence'})).toHaveAttribute('aria-controls','report-evidence');
});

it("loading disables the action, marks it busy and keeps icons as in-flow children", () => {
  const onClick = vi.fn();
  render(<FanAction loading variant="primary" onClick={onClick} trailingIcon={<span>arrow</span>}>저장</FanAction>);
  const button = screen.getByRole("button", { name: /저장/ });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute("aria-busy", "true");
  expect(button).toHaveAttribute("data-loading", "true");
  fireEvent.click(button);
  expect(onClick).not.toHaveBeenCalled();
  expect(button.querySelector(`.${styles.trailing}`)).toBeNull();
  expect(button.querySelector(`.${styles.spinner}`)).not.toBeNull();
});

it("shows the loading spinner after the label and in place of the trailing icon", () => {
  render(<FanAction loading trailingIcon={<svg data-testid="arrow" />}>Send</FanAction>);
  const button = screen.getByRole("button", { name: "Send" });
  expect(button.querySelector('[class*="spinner"]')).not.toBeNull();
  expect(button.lastElementChild?.className).toMatch(/spinner/);
  expect(screen.queryByTestId("arrow")).toBeNull();
});

it("renders an icon-only action without a label span", () => {
  render(<FanAction ariaLabel="Back" leadingIcon={<svg />} />);
  const button = screen.getByRole("button", { name: "Back" });
  expect(button.className).toMatch(/iconOnly/);
  expect(button.querySelector('[class*="label"]')).toBeNull();
});

it("shows a finished action as a status in the button slot, not a dimmed disabled button", () => {
  render(<FanActionStatus leadingIcon={<svg />}>응모 완료</FanActionStatus>);
  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("응모 완료");
  expect(status.tagName).toBe("P");
  expect(screen.queryByRole("button")).toBeNull();
  expect(status.className).toMatch(/neutral/);
  expect(status.className).toMatch(/status/);
});
