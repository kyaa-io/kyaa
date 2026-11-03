import { expect, it, vi } from "vitest";
import { runGroupRafflesDueOnce } from "../src/group-raffles-due.js";
import type { NotificationWorkerEnv } from "../src/notification-env.js";
it("runs the server-owned deadline draw and rejects failed or malformed results",async()=>{
 const rpc=vi.fn().mockResolvedValueOnce({data:2,error:null}).mockResolvedValueOnce({data:null,error:{message:"db"}}).mockResolvedValueOnce({data:-1,error:null});
 expect(await runGroupRafflesDueOnce({} as NotificationWorkerEnv,{rpc} as never)).toBe(2);
 expect(rpc).toHaveBeenCalledWith("process_due_group_raffles");
 await expect(runGroupRafflesDueOnce({} as NotificationWorkerEnv,{rpc} as never)).rejects.toThrow("GROUP_RAFFLES_MAINTENANCE_UNAVAILABLE");
 await expect(runGroupRafflesDueOnce({} as NotificationWorkerEnv,{rpc} as never)).rejects.toThrow("GROUP_RAFFLES_MAINTENANCE_UNAVAILABLE");
});
