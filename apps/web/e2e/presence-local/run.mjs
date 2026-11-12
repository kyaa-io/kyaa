import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
const require = createRequire(import.meta.url);
const { createServer } = await import(createRequire(require.resolve('vitest/package.json')).resolve('vite'));
const here = import.meta.dirname, web = path.resolve(here, '../..'), root = path.resolve(web, '../..');
const server = await createServer({ configFile: false, root: here, publicDir: path.join(web, 'public'), resolve: { alias: [{ find: './use-group-presence', replacement: path.join(here, 'mock.ts') }, ...['link', 'image', 'navigation'].map(name => ({ find: `next/${name}`, replacement: path.join(here, `../mission-local/next-${name}.${name === 'navigation' ? 'ts' : 'tsx'}`) })), { find: '@', replacement: web }] }, server: { host: '127.0.0.1', port: 4297, strictPort: true, fs: { allow: [root] } } });
await server.listen();
const browser = await chromium.launch({ headless: true });
try { for (const width of [390, 1440]) { const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 }); page.on('pageerror', error => console.error(error)); await page.goto('http://127.0.0.1:4297'); await page.locator('[data-presence="today"] [role="img"]').waitFor({timeout:5000}); await page.waitForTimeout(800); await page.screenshot({ path: path.join(root, `release-notes/images/2026-11-12-fan-numbers-${width}.png`) }); console.log(width, await page.locator('main').innerText(), await page.locator('[data-presence="online"] .onlineDot').count()); await page.close(); } } finally { await browser.close(); await server.close(); }
