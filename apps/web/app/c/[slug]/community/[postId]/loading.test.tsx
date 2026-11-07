import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import Loading from "./loading";

it("answers a press at once with the shape of a post and no loading text", () => {
  const { container } = render(<Loading />);
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(container.textContent).not.toMatch(/불러오|Loading/);
});
