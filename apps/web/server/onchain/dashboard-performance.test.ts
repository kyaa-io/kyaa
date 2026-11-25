import { expect, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createServer, get } from 'node:http';
import { setTimeout as pause } from 'node:timers/promises';
vi.mock('server-only', () => ({}));
import { performanceFixture, productionScale } from './performance-fixture';
import { projectPublicOnchainSnapshot, projectPublicOnchainSnapshotAsync } from './public-aggregate';
import { refreshDashboardSnapshot } from './dashboard-snapshot';
import { validatePublicationAsync } from './verified-snapshot';
import { readFinalizedActionSnapshot } from '../../../worker/src/action-public-snapshot';
import type { PublicOnchainSnapshot } from './public-types';
import { performanceRpcFixture } from './performance-rpc-fixture';
import { onchainConfig } from './public-config';
import { readFinalizedCredentialReplacements, type CredentialReplacementConfig } from './credential-replacements';

async function measureRefresh() {
  const { source, representatives, client } = performanceRpcFixture();
  expect(source.actions.length).toBeGreaterThanOrEqual(productionScale.actions * 2);
  const generatedAt = new Date();
  const expected = projectPublicOnchainSnapshot(source, generatedAt, representatives);
  const server = createServer((_req,res) => res.end('ok'));
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const port = (server.address() as { port: number }).port;
  const latencies: number[] = [];
  const request = () => new Promise<void>((resolve,reject) => {
    const started = performance.now();
    const req = get(`http://127.0.0.1:${port}`, response => {response.resume(); response.on('end',()=>{latencies.push(performance.now()-started);resolve();});});
    req.on('error',reject);
  });
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  let phase = 'start', lastPhase = phase, lastTick = performance.now();
  const stalls: Array<{phase:string;ms:number}> = [];
  const tick = setInterval(() => { const now = performance.now(); if(now-lastTick>100) stalls.push({phase:lastPhase,ms:now-lastTick});lastTick=now;lastPhase=phase; },10);
  let actual: PublicOnchainSnapshot | undefined;
  let active = true, requests: Promise<void> | undefined;
  try {
    await request(); latencies.length=0;
    histogram.enable(); await pause(25);
    const start=performance.now();
    const stages: Record<string, number> = {};
    const result = await refreshDashboardSnapshot({
      verify: async signal => {
        phase="actions";
        const t = performance.now();
        const logScan = { client, chunkBlocks: 10_000n };
        const verified = await readFinalizedActionSnapshot({ ...onchainConfig, client, logScan, signal, deadlineMs: 420_000 });
        stages.actionsMs = performance.now() - t;
        phase="replacements";
        const r = performance.now();
        const replacements = await readFinalizedCredentialReplacements(onchainConfig as CredentialReplacementConfig, verified, client, logScan);
        stages.replacementsMs = performance.now() - r;
        expect(verified.actions.length).toBe(source.actions.length);
        expect(replacements.size).toBe(representatives.size);
        phase="projection";
        const p = performance.now();
        // Start real round trips inside the CPU-bound phase so later I/O cannot mask starvation.
        requests = (async () => {
          for (let index = 0; index < 3 && active; index++) await request();
        })();
        const projected = await projectPublicOnchainSnapshotAsync(verified, generatedAt, replacements, signal);
        active = false;
        expect(latencies.length, 'HTTP round trips completed during projection').toBe(3);
        stages.projectMs = performance.now() - p; stages.verifiedAt = performance.now();
        actual=projected;
        phase="sanitize";return projected;
      },
      write: async (snapshot,dashboard) => {
        stages.sanitizeMs=performance.now()-stages.verifiedAt;const p=performance.now();
        phase="parse";const payload = await validatePublicationAsync(snapshot,dashboard);stages.parseMs=performance.now()-p;const j=performance.now();
        phase="serialize";const serialized = JSON.stringify(payload);stages.serializeMs=performance.now()-j;
        expect(serialized.length).toBeGreaterThan(0);
        return true;
      },
    });
    const elapsedMs=performance.now()-start;
    active=false;await requests;await pause(25);histogram.disable();
    expect(result).toEqual({updated:true});
    const measurements={actions:source.actions.length,representatives:representatives.size,elapsedMs,eventLoopMaxMs:histogram.max/1e6,httpMaxMs:Math.max(...latencies),requests:latencies.length};
    if (process.env.ONCHAIN_PERF_OUTPUT) writeFileSync(process.env.ONCHAIN_PERF_OUTPUT, JSON.stringify({ ...measurements, stages, stalls }, null, 2));
    // Verification adds one fact digest per action; every other published value equals the direct projection.
    expect(actual!.actions.every(action => /^0x[0-9a-f]{64}$/.test(action.facts?.digest ?? ''))).toBe(true);
    expect({ ...actual, actions: actual!.actions.map(({ facts: _facts, ...action }) => action) }).toEqual(expected);
  } finally {
    active=false; await requests; histogram.disable(); clearInterval(tick);
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}

it('G2: a double-production refresh yields to HTTP requests and preserves every verified value', async () => {
  await measureRefresh();
}, 120000);

it('cancels cooperative projection before doing more CPU work', async()=>{
  const {source,representatives}=performanceFixture();
  const controller=new AbortController();controller.abort(new Error('cancelled'));
  await expect(projectPublicOnchainSnapshotAsync(source,new Date(),representatives,controller.signal)).rejects.toThrow('cancelled');
});

it('cancels projection during a yielded batch', async () => {
  const { source, representatives } = performanceFixture();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('cancelled mid-projection')), 0);
  try { await expect(projectPublicOnchainSnapshotAsync(source, new Date(), representatives, controller.signal)).rejects.toMatchObject({ name: 'AbortError' }); }
  finally { clearTimeout(timer); }
});
