import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

// The wallet's raffle tickets are one balance for every creator and group (get_fan_ticket_balance returns the wallet pool),
// so no screen may name them after a creator or call them creator-only. Fixed here after 이퓨 응모권 / 모임 응모권 drifted apart.
const FILES = [
  "features/benefit/ui/benefit-screen.tsx", "features/benefit/ui/raffle-entry-panel.tsx", "features/fanpage/ui/home-panels.tsx",
  "features/my/ui/my-screen.tsx", "features/live/ui/live-event-screen.tsx", "components/ifew-fan-guide/content.ts",
  "features/group-wallet/ui/wallet-card.tsx", "features/group-wallet/ui/wallet-screen.tsx", "features/group-wallet/ui/copy.ts",
];
const NAMED = /이퓨 응모권|\$\{name\} 응모권|내 \$\{name\}|이 크리에이터의 응모권|다른 최애의 응모권|모임 응모권|ifew raffle tickets|this creator’s raffle tickets|Another creator’s raffle/i;

it.each(FILES)("%s does not name the shared raffle ticket after a creator or a group", (file) => {
  expect(readFileSync(join(process.cwd(), file), "utf8").match(NAMED)).toBeNull();
});
