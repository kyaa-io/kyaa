export function createMintCadenceHandler(deps: {
  invoke(): Promise<void>;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}, source: Record<string,string|undefined> = process.env) {
  const now=deps.now??Date.now,sleep=deps.sleep??(milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds)));
  return async(event:unknown)=>{
    const input=event as {source?:string;environment?:string;scheduledAt?:string};
    if(input?.source!=="byus.aws-mint-cadence"||input.environment!==source.WORKER_ENVIRONMENT||!["dev","staging","prod"].includes(input.environment??""))throw new Error("Invalid mint cadence invocation");
    if(source.WORKER_ENABLED!=="true")return{enabled:false,attempted:0};
    const scheduled=Date.parse(input.scheduledAt??""),start=now();
    if(!Number.isFinite(scheduled)||scheduled-start>5000)throw new Error("Invalid mint schedule time");
    if(start-scheduled>120000)return{enabled:true,attempted:0};
    // Scheduler delivery has minute precision; overlapping windows cover its 0–59s jitter.
    const end=start+125000,pending:Promise<"completed"|"busy"|"failed">[]=[];
    let due=Math.ceil(start/5000)*5000;
    while(due<end){
      await sleep(Math.max(0,due-now()));
      if(now()>=end)break;
      if(now()-due>=5000){due=Math.ceil(now()/5000)*5000;continue;}
      let invocation:Promise<void>;
      try{invocation=deps.invoke();}catch(error){invocation=Promise.reject(error);}
      pending.push(invocation.then(()=>"completed" as const,error=>error?.name==="TooManyRequestsException"?"busy" as const:"failed" as const));
      due=Math.max(due+5000,Math.ceil(now()/5000)*5000);
    }
    const results=await Promise.all(pending);
    if(results.includes("failed"))throw new Error("Mint worker invocation failed");
    return{enabled:true,attempted:results.length,completed:results.filter(value=>value==="completed").length,throttled:results.filter(value=>value==="busy").length};
  };
}
