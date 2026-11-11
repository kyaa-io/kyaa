import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { REWARD_ICON_SRC, RewardIcon } from "./reward-icon";

describe("RewardIcon", () => {
  it.each(["point", "heart", "ticket", "stamp"] as const)("uses the shared %s asset and preserves accessibility and dimensions", (kind) => {
    const { container } = render(<RewardIcon kind={kind} size={24} alt="reward" />);
    const image = container.querySelector("img")!;
    expect(image.getAttribute("src")).toBe(REWARD_ICON_SRC[kind]);
    expect(image.getAttribute("width")).toBe("24");
    expect(image.getAttribute("height")).toBe("24");
    expect(image.getAttribute("alt")).toBe("reward");
  });
});
