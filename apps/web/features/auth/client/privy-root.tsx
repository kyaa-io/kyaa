// Direct root (plan-b §0-7): today's ByUsPrivyProvider, where PrivyProvider wraps the page. The island build swaps
// this path, together with @/features/auth/client/privy-backend, for privy-root.island.tsx.
export { ByUsPrivyProvider as PrivyRoot } from "@/components/privy-provider";
