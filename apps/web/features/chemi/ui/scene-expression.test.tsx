import { existsSync } from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { askArt } from "@/features/chemi/ask/lines";
import { SceneExpression, type ExpressionScene } from "./scene-expression";

const scenes: ExpressionScene[] = ["fortune", "saju", "star", "tarot"];
const characters = ["changha", "elina", "yuna", "dosa"] as const;

it("points every scene and favorite at expression art that exists, with the scene's portrait as the neutral layer", () => {
  for (const scene of scenes)
    for (const character of characters) {
      const portrait = askArt(scene, character).tall;
      const { container, unmount } = render(<SceneExpression scene={scene} character={character} portrait={portrait} expression="smile" />);
      const layers = Array.from(container.querySelectorAll("img"));
      expect(layers.map((layer) => layer.dataset.expression)).toEqual(["neutral", "smile", "surprise"]);
      expect(layers[0].getAttribute("src")).toBe(portrait);
      for (const layer of layers) {
        expect(layer.getAttribute("aria-hidden")).toBe("true");
        expect(existsSync(path.join(process.cwd(), "public", layer.getAttribute("src")!))).toBe(true);
      }
      unmount();
    }
});

it("keeps every layer hidden until the image has been decoded", () => {
  const { container } = render(<SceneExpression scene="saju" character="yuna" portrait="/chemi/saju/saju-yuna-v1.webp" expression="surprise" />);
  expect(container.querySelectorAll("img[data-active]")).toHaveLength(0);
});
