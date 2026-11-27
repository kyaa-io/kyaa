import { PD_SHORTS_BANNER_ID } from "../../home/domain/pd-shorts-banner";

/** CMS identifiers are environment-specific. Keep advertiser identity independent of translated copy. */
const advertisers = new Map([
  [PD_SHORTS_BANNER_ID, "kyaa"],
  ["4d095adc-f28d-48d7-96de-14482080363e", "localvibe"],
  ["05cc6f49-d624-4cdb-ad65-475194d4af80", "beepio"],
  ["a002b205-c7ff-4bc9-b067-fb8d69e81be2", "beepio"],
  ["51a0830e-406e-4fb6-9895-0bb84d70b9d1", "chillsa"],
  ["586383c4-bcb2-4910-bd33-d9e558c93a21", "chillsa"],
]);

export function advertiserForBanner(id: string) {
  return advertisers.get(id);
}
