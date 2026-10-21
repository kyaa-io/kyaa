import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({ resolve: { dedupe: ['react', 'react-dom'], alias: { '@': fileURLToPath(new URL('../web', import.meta.url)) } }, server: { host: '127.0.0.1', fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } }, build: { outDir: 'dist', assetsDir: 'ui-assets', emptyOutDir: true } });
