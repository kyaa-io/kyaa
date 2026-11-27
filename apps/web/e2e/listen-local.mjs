import { spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';

export async function listenLocal(server, workerPort = server.config.server.port) {
  const gate = process.env.PUSH_GATE_MINI === '1';
  const count = gate ? 128 : 1;
  const offset = gate ? randomInt(count) : 0;
  for (let attempt = 0; attempt < count; attempt++) {
    const port = gate ? 18000 + (offset + attempt) % count : workerPort;
    if (!gate && port >= 18000 && port < 18128) throw new Error('Port reserved for mini gates');
    try {
      await server.listen(port);
      return server.httpServer.address().port;
    } catch (error) {
      if (error.code !== 'EADDRINUSE' && error.message !== `Port ${port} is already in use`) throw error;
      const owner = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
      console.error(`Port ${port} is already in use\n${owner.stdout || owner.error || 'listener unavailable'}`);
      if (attempt + 1 === count) throw error;
    }
  }
}
