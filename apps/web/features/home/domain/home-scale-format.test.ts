import { expect, it } from "vitest";
import { formatHomeScaleCompact } from "./home-scale-format";

it.each([
  [0, "0", "0", "0"],
  [999, "999", "999", "999"],
  [9999, "9,999", "9,999", "9,999"],
  [10000, "1만", "10K", "1万"],
  [12999, "1.2만", "12.9K", "1.2万"],
  [1000000, "100만", "1M", "100万"],
])("formats %s for ko, en, and ja", (count, ko, en, ja) => {
  expect(["ko", "en", "ja"].map(locale => formatHomeScaleCompact(count, locale))).toEqual([ko, en, ja]);
});
