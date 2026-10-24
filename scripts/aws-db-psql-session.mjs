import {Worker,isMainThread,workerData,MessageChannel,receiveMessageOnPort} from 'node:worker_threads';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';

// Keep psql's quoting and variable semantics; each call still starts with an empty session.
export class PsqlSession{
 constructor(env,args){
  const {port1,port2}=new MessageChannel();this.port=port1;this.signal=new Int32Array(new SharedArrayBuffer(8));
  this.worker=new Worker(new URL(import.meta.url),{execArgv:[],workerData:{env,args,port:port2,signal:this.signal},transferList:[port2]});
  this.worker.on('error',()=>{});this.worker.unref();this.port.unref();this.closed=false;
 }
 run(sql,timeout){
  if(this.closed)throw new Error('Persistent PostgreSQL session is closed');
  const end=Date.now()+timeout;Atomics.store(this.signal,0,0);this.port.postMessage({sql,timeout});
  while(Atomics.load(this.signal,0)===0){const left=end-Date.now();if(left<=0){this.close();throw new Error('Persistent PostgreSQL operation failed (timeout)');}Atomics.wait(this.signal,0,0,left);}
  let response;while(!(response=receiveMessageOnPort(this.port))){if(Date.now()>=end){this.close();throw new Error('Persistent PostgreSQL response missing');}Atomics.wait(this.signal,0,1,1);}
  const result=response.message;if(result.error)throw new Error(`Persistent PostgreSQL operation failed${result.code?` (SQLSTATE ${result.code})`:''}${result.timeout?' (timeout)':''}`);
  return result.output.trim();
 }
 close(){
  if(this.closed)return;this.closed=true;const pid=Atomics.load(this.signal,1);if(pid>0)try{process.kill(pid,'SIGKILL');}catch{}
  this.port.close();void this.worker.terminate();
 }
}

if(!isMainThread){
 const {env,args,port,signal}=workerData;let child=null,pending=null,buffer='',errors='';
 const finish=result=>{if(!pending)return;clearTimeout(pending.timer);pending=null;port.postMessage(result);Atomics.store(signal,0,1);Atomics.notify(signal,0);};
 const stop=()=>{const old=child;child=null;if(old)old.kill('SIGKILL');Atomics.store(signal,1,0);};
 const start=()=>{
  child=spawn('psql',args,{env,stdio:['pipe','pipe','pipe']});const current=child;Atomics.store(signal,1,child.pid??0);
  child.on('error',()=>{if(child===current){stop();finish({error:true});}});
  child.on('close',()=>{if(child===current){child=null;Atomics.store(signal,1,0);finish({error:true,code:errors.match(/(?:ERROR|FATAL):\s+([A-Z0-9]{5})/i)?.[1]});}});
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',data=>{
   if(child!==current||!pending)return;buffer+=data.toString();
   if(Buffer.byteLength(buffer)>32*1024*1024){stop();finish({error:true});return;}
   const marker=pending.marker+'\n',at=buffer.indexOf(marker);
   if(at>=0&&(at===0||buffer[at-1]==='\n')){const output=buffer.slice(0,at);buffer=buffer.slice(at+marker.length);finish({output});}
  });
  child.stderr.on('data',data=>{if(child===current)errors=(errors+data.toString()).slice(-8192);});
  child.stdin.on('error',()=>{if(child===current){stop();finish({error:true});}});
 };
 port.on('message',({sql,timeout})=>{
  if(pending){stop();finish({error:true});return;}
  buffer='';errors='';const marker='byus_psql_'+randomUUID().replaceAll('-','');
  pending={marker,timer:setTimeout(()=>{stop();finish({error:true,timeout:true});},Math.max(1,timeout-100))};
  if(!child)start();
  child?.stdin.write(`rollback;discard all;set row_security=off;set statement_timeout=${Math.max(1,timeout-500)};set lock_timeout=${Math.max(1,timeout-1000)};\n${sql}\nrollback;discard all;\n\\echo ${marker}\n`);
 });
 port.on('close',stop);
}
