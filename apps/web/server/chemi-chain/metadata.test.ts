import { expect, it } from "vitest";
import { serializeMetadata } from "./metadata";

const record = {
  kind: "daily_reading",
  date: "2026-11-19",
  payload: {
    character: "elina",
    date: "2026-11-19",
    content: "fortune",
    band: 50,
  },
};
it("publishes only approved attributes and shared artwork", () => {
  const result = serializeMetadata(record);
  expect(Object.keys(result).sort()).toEqual(["attributes", "image", "name"]);
  expect(result.attributes).toHaveLength(4);
});
it.each([
  { birth: "1990-10-10" },
  { date: "1990-10-10" },
  { character: "010-2222-3333" },
  { band: 51 },
  { email: "user@example.test" },
  { content: "payment" },
  { band: { phone: "010-2222-3333" } },
])("rejects invalid metadata %j", (bad) => {
  expect(() =>
    serializeMetadata({ ...record, payload: { ...record.payload, ...bad } }),
  ).toThrow();
});
