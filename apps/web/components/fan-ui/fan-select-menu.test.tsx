import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { FanSelectMenu } from "./fan-select-menu";

function Harness({ active = false }: { active?: boolean }) {
  const [value, setValue] = useState("likes");
  return <FanSelectMenu label="Sort posts" value={value} onValueChange={setValue} active={active} options={[{ value: "likes", label: "Most liked" }, { value: "comments", label: "Most commented" }]} />;
}

describe("FanSelectMenu", () => {
  it("shows the selected label, lists every option with the current one checked, and closes after a pick", async () => {
    render(<Harness />);
    const pill = screen.getByRole("button", { name: "Sort posts: Most liked" });
    expect(pill).toHaveTextContent("Most liked");
    expect(pill).toHaveAttribute("data-fan-select-pill");
    fireEvent.click(pill);
    const current = await screen.findByRole("menuitemradio", { name: "Most liked" });
    expect(current).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Most commented" }));
    await waitFor(() => expect(screen.queryByRole("menuitemradio", { name: "Most commented" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Sort posts: Most commented" })).toBeInTheDocument();
  });

  it("marks a non-default pick active", () => {
    render(<Harness active />);
    expect(screen.getByRole("button", { name: /Sort posts/ })).toHaveAttribute("data-active");
  });
});
