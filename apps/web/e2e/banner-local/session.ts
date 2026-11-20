import { usePrivy } from "./privy";

export function useByUsSession() {
  const { user } = usePrivy();
  return { ready: true, ownerId: user.id, generation: 1 };
}
