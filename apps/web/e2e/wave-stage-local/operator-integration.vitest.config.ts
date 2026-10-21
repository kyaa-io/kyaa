import { defineConfig, mergeConfig } from 'vitest/config';
import webConfig from '../../vitest.config';

// The desktop and web packages install React separately; this shared-hook harness uses one renderer.
export default mergeConfig(webConfig, defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
  test: { include: ['e2e/wave-stage-local/operator-bridge.integration.spec.tsx'] },
}));
