import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { applyReaction, nextReaction, PostReactions } from "./post-reactions";

vi.mock("@/features/dukjil/ui/earn-badge", () => ({ EarnBadgeCorner: ({ children }: { children: React.ReactNode }) => <span data-earn="">{children}</span> }));

describe("post reaction choice", () => {
  it("cancels the same thumb and switches to the other one", () => {
    expect(nextReaction(null, "like")).toBe("like");
    expect(nextReaction("like", "like")).toBe("none");
    expect(nextReaction("like", "dislike")).toBe("dislike");
    expect(nextReaction("dislike", "dislike")).toBe("none");
  });
  it("moves counts optimistically and never reveals a hidden dislike count", () => {
    expect(applyReaction({ reaction: "like", likeCount: 3, dislikeCount: null }, "dislike")).toEqual({ reaction: "dislike", likeCount: 2, dislikeCount: null });
    expect(applyReaction({ reaction: "dislike", likeCount: 0, dislikeCount: 1 }, "like")).toEqual({ reaction: "like", likeCount: 1, dislikeCount: 0 });
    expect(applyReaction({ reaction: null, likeCount: 0, dislikeCount: 0 }, "none")).toEqual({ reaction: null, likeCount: 0, dislikeCount: 0 });
  });
});

describe("PostReactions", () => {
  it("shows the public like count and only the reader's own dislike choice", () => {
    const onChange = vi.fn();
    render(<PostReactions reaction="dislike" likeCount={10} dislikeCount={null} locale="ko" onChange={onChange} />);
    const like = screen.getByRole("button", { name: /좋아요 10/ }), dislike = screen.getByRole("button", { name: "싫어요" });
    expect(dislike).toHaveAttribute("aria-pressed", "true");
    expect(dislike.textContent).toBe("");
    fireEvent.click(like);
    expect(onChange).toHaveBeenLastCalledWith("like");
    fireEvent.click(dislike);
    expect(onChange).toHaveBeenLastCalledWith("none");
  });
  it("shows the dislike number to the author or an operator", () => {
    render(<PostReactions reaction={null} likeCount={2} dislikeCount={4} locale="ko" onChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "싫어요 4" })).toHaveTextContent("4");
  });
  it("keeps both thumbs for a signed-out reader and sends both to sign-in", () => {
    render(<PostReactions reaction={null} likeCount={1} dislikeCount={null} locale="en" loginHref="/login?next=x" onChange={() => undefined} />);
    expect(screen.getByRole("link", { name: /Like 1/ })).toHaveAttribute("href", "/login?next=x");
    expect(screen.getByRole("link", { name: "Dislike" })).toHaveAttribute("href", "/login?next=x");
  });
  it("lets a signed-in non-member start joining from either thumb", () => {
    const onJoin = vi.fn();
    render(<PostReactions reaction={null} likeCount={0} dislikeCount={null} locale="ko" join={{ onJoin }} onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "싫어요" }));
    expect(onJoin).toHaveBeenCalledOnce();
  });
  it("puts the same point badge on both thumbs", () => {
    const { container } = render(<PostReactions reaction={null} likeCount={0} dislikeCount={null} locale="ko" reward onChange={() => undefined} />);
    const hosts = [...container.querySelectorAll("[data-earn]")];
    expect(hosts).toHaveLength(2);
    expect(hosts[0]).toHaveTextContent("좋아요 0");
    expect(hosts[1].querySelector("button")).toHaveAccessibleName("싫어요");
  });
  it("draws no point badge without a reward", () => {
    const { container } = render(<PostReactions reaction={null} likeCount={0} dislikeCount={null} locale="ko" onChange={() => undefined} />);
    expect(container.querySelector("[data-earn]")).toBeNull();
  });
});
