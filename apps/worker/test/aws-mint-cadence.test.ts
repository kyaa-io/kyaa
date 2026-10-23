import { expect,it,vi } from "vitest";
import { createMintCadenceHandler } from "../src/aws-mint-cadence.js";
const source={WORKER_ENVIRONMENT:"staging",WORKER_ENABLED:"true"},event={source:"byus.aws-mint-cadence",environment:"staging",scheduledAt:new Date(0).toISOString()};
it("starts twenty-five synchronous invokes five seconds apart without waiting for a busy target",async()=>{
 let now=0,finish!:()=>void;
 const times:number[]=[];
 const invoke=vi.fn(()=>{times.push(now);return times.length===1?new Promise<void>(resolve=>{finish=resolve;}):Promise.reject({name:"TooManyRequestsException"});});
 const handler=createMintCadenceHandler({invoke,now:()=>now,sleep:async milliseconds=>{now+=milliseconds;}},source);
 const running=handler(event);
 await vi.waitFor(()=>expect(invoke).toHaveBeenCalledTimes(25));
 expect(times).toEqual(Array.from({length:25},(_,index)=>index*5000));
 now=240000;finish();await expect(running).resolves.toEqual({enabled:true,attempted:25,completed:1,throttled:24});
});
it("skips stale minute ticks and remains inert when disabled",async()=>{
 const invoke=vi.fn(async()=>{});
 await expect(createMintCadenceHandler({invoke,now:()=>120001,sleep:async()=>{}},source)(event)).resolves.toMatchObject({attempted:0});
 await expect(createMintCadenceHandler({invoke},{...source,WORKER_ENABLED:"false"})(event)).resolves.toEqual({enabled:false,attempted:0});
 expect(invoke).not.toHaveBeenCalled();
 await expect(createMintCadenceHandler({invoke},source)({...event,environment:"prod"})).rejects.toThrow();
});
it("preserves non-throttle target failure instead of treating it as a successful tick",async()=>{
 let now=0;const invoke=vi.fn(async()=>{throw new Error("target failed");});
 await expect(createMintCadenceHandler({invoke,now:()=>now,sleep:async milliseconds=>{now+=milliseconds;}},source)(event)).rejects.toThrow("Mint worker invocation failed");
 expect(invoke).toHaveBeenCalledTimes(25);
});

it("covers alternating 0/59-second scheduler jitter on the same global five-second tick grid",async()=>{
 const times:number[]=[];
 for(const[scheduled,arrival]of [[0,0],[60000,119000],[120000,120000],[180000,239000]]){
  let clock=arrival!;
  await createMintCadenceHandler({invoke:async()=>{times.push(clock);},now:()=>clock,sleep:async ms=>{clock+=ms;}},source)({...event,scheduledAt:new Date(scheduled!).toISOString()});
 }
 const ticks=[...new Set(times)].sort((a,b)=>a-b);
 expect(ticks.every(time=>time%5000===0)).toBe(true);
 expect(Math.max(...ticks.slice(1).map((time,index)=>time-ticks[index]!))).toBe(5000);
});
it("skips missed ticks after event-loop delay instead of a catch-up invocation burst",async()=>{
 let clock=0,first=true;const times:number[]=[];
 await createMintCadenceHandler({invoke:async()=>{times.push(clock);},now:()=>clock,sleep:async ms=>{clock+=ms;if(first){clock+=21000;first=false;}}},source)(event);
 expect(times[0]).toBe(25000);expect(times.every(time=>time%5000===0)).toBe(true);expect(times.filter(time=>time===25000)).toHaveLength(1);
});
