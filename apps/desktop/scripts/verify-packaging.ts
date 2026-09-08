/**
 * Build-time guard: packaged Electron must use relative renderer assets and hash routing.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const desktopRoot = join(__dirname, '..');
const distDir = join(desktopRoot, 'dist');
const distElectronDir = join(desktopRoot, 'dist-electron');
const indexHtmlPath = join(distDir, 'index.html');
const mainJsPath = join(distElectronDir, 'main.js');

function fail(message: string): never {
  throw new Error(`[verify-packaging] ${message}`);
}

if (!existsSync(indexHtmlPath)) {
  fail('dist/index.html is missing — run vite build before pack');
}

if (!existsSync(mainJsPath)) {
  fail('dist-electron/main.js is missing — run electron tsc before pack');
}

const indexHtml = readFileSync(indexHtmlPath, 'utf8');

if (/src="\/assets\//.test(indexHtml)) {
  fail('dist/index.html uses absolute /assets paths; base must be "./" for file:// loading');
}

if (!/\.\/assets\//.test(indexHtml)) {
  fail('dist/index.html must reference ./assets/ for packaged Electron');
}

const assetDir = join(distDir, 'assets');
if (!existsSync(assetDir) || readdirSync(assetDir).length === 0) {
  fail('dist/assets is missing or empty');
}

const mainJs = readFileSync(mainJsPath, 'utf8');
if (!mainJs.includes('loadFile') || !mainJs.includes('index.html')) {
  fail('dist-electron/main.js must load dist/index.html via loadFile');
}

const routerSourcePath = join(desktopRoot, 'src/lib/app-router.tsx');
if (!existsSync(routerSourcePath)) {
  fail('src/lib/app-router.tsx is missing');
}

const routerSource = readFileSync(routerSourcePath, 'utf8');
if (!routerSource.includes('HashRouter') || !routerSource.includes('import.meta.env.PROD')) {
  fail('app-router.tsx must select HashRouter when import.meta.env.PROD');
}

const jsBundle = readdirSync(assetDir).find((f) => f.startsWith('index-') && f.endsWith('.js'));
if (!jsBundle) {
  fail('renderer JS bundle not found in dist/assets');
}

const bundleSource = readFileSync(join(assetDir, jsBundle), 'utf8');
if (bundleSource.includes('Admin@123456') || bundleSource.includes('admin@fratelanza.local')) {
  fail('demo credentials must not be bundled in production renderer');
}

console.log('[verify-packaging] PASS — renderer assets and hash routing verified');
