import { CHEMI_CHAIN_SCHEMA, type ChainValueRule } from "./chain-schema";
import { z } from "zod";

function allowed(rule: ChainValueRule, value: unknown, date: string) {
  switch (rule.t) {
    case "enum":
      return typeof value === "string" && rule.v.includes(value);
    case "int":
      return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= rule.min &&
        value <= rule.max &&
        value % (rule.step ?? 1) === 0
      );
    case "intset":
      return typeof value === "number" && rule.v.includes(value);
    case "hex64":
      return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
    case "date":
      return value === date;
    case "week": {
      const day = new Date(date);
      day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
      return value === day.toISOString().slice(0, 10);
    }
    case "intarray":
      return (
        Array.isArray(value) &&
        value.length === rule.len &&
        (!rule.distinct || new Set(value).size === value.length) &&
        value.every(
          (n) => Number.isInteger(n) && n >= rule.min && n <= rule.max,
        )
      );
  }
}
export function serializeMetadata(input: unknown) {
  const { kind, date, payload } = z
    .strictObject({
      kind: z.string(),
      date: z.iso.date(),
      payload: z.record(z.string(), z.unknown()),
    })
    .parse(input);
  const schema = CHEMI_CHAIN_SCHEMA[kind];
  if (!Object.hasOwn(CHEMI_CHAIN_SCHEMA, kind) || !schema)
    throw new Error("CHEMI_INVALID");
  const rules = { ...schema.required, ...schema.optional };
  if (
    !Object.keys(schema.required).every((k) => Object.hasOwn(payload, k)) ||
    !Object.entries(payload).every(
      ([key, value]) =>
        Object.hasOwn(rules, key) && allowed(rules[key]!, value, date),
    )
  )
    throw new Error("CHEMI_INVALID");
  const artwork: Record<string, string> = {
    saju_first: "saju",
    saju_topic: "saju",
    tarot3: "tarot",
    game_best: "run",
    rank: "run",
  };
  const image =
    kind === "daily_reading" && payload.content === "star"
      ? "zodiac"
      : kind === "daily_reading" && payload.content === "tarot"
        ? "tarot"
        : (artwork[kind] ?? "fortune");
  return {
    name: kind,
    image: "/chemi/thumb-" + image + "-128.webp",
    attributes: Object.entries(payload).map(([trait_type, value]) => ({
      trait_type,
      value,
    })),
  };
}
