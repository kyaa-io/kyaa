import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_EVENT_NAMES } from "../../features/analytics/domain/product-event";

const root = resolve(process.cwd(), "../..");
const migration = readFileSync(resolve(root, "supabase/migrations/20260903041200_phase6_product_event_projections.sql"), "utf8");
const validationFix = readFileSync(resolve(root, "supabase/migrations/20260903041400_phase6_product_event_json_validation_fix.sql"), "utf8");
const signupMigration = readFileSync(resolve(root, "supabase/migrations/20260911140102_signup_funnel_measurement.sql"), "utf8");
const signupClient = readFileSync(resolve(process.cwd(), "features/analytics/client/signup-funnel-tracker.ts"), "utf8");
const client = readFileSync(resolve(process.cwd(), "features/analytics/client/product-event-client.ts"), "utf8");
const outbound = readFileSync(resolve(process.cwd(), "features/analytics/client/outbound-link-tracker.tsx"), "utf8");
const live = readFileSync(resolve(process.cwd(), "features/live/ui/live-event-screen.tsx"), "utf8");
const creator = readFileSync(resolve(process.cwd(), "components/celebrity-fan-page.tsx"), "utf8");
const benefit = readFileSync(resolve(process.cwd(), "features/benefit/ui/benefit-screen.tsx"), "utf8");
const funnelMigration = readFileSync(resolve(root, "supabase/migrations/20261219010000_funnel_events.sql"), "utf8");
const pageView = readFileSync(resolve(process.cwd(), "features/analytics/client/page-view-tracker.tsx"), "utf8");
const share = readFileSync(resolve(process.cwd(), "features/analytics/client/share-event.ts"), "utf8");

describe("Phase 6 instrumentation coverage", () => {
  it("covers every v1 name through a client surface or committed server projection", () => {
    const inventory = [client, outbound, live, creator, benefit, migration, signupMigration, signupClient, funnelMigration, pageView, share].join("\n");
    for (const name of PRODUCT_EVENT_NAMES) expect(inventory).toContain(name);
  });
  it("projects ticket events only after a ledger insert with the ledger row as stable source", () => {
    expect(migration).toContain("fan_ticket_ledger_product_event after insert");
    expect(migration).toContain("'ledgerRowId',new.id");
    expect(migration).toContain("'server:'||v_event||':'||v_id::text");
  });
  it("keeps measurement failure from rolling back business success (the client side is covered by product-event-client.test.ts)", () => {
    expect(migration).toMatch(/exception when others then[\s\S]*return new/);
  });
  it("dedupes page views per route/session window and includes LIVE provider context", () => {
    expect(client).toContain("PAGE_VIEW_WINDOW_MS");
    expect(client).toContain("anonymousSessionId()");
    expect(live).toContain("provider: data.live.watch.provider");
    expect(live).toContain("live_cta_click");
  });
  it("uses an executable PostgreSQL object-key count for bounded properties", () => {
    expect(validationFix).toContain("pg_catalog.jsonb_object_keys(p_properties)");
    expect(validationFix).not.toContain("jsonb_object_length(");
  });
});
