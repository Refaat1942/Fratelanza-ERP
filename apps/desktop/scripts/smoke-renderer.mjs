/**
 * Headless Electron smoke: load production dist/index.html via file://
 * and assert the login UI renders (HashRouter + relative assets).
 */
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexHtml = path.join(__dirname, '../dist/index.html');

async function run() {
  await app.whenReady();

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await win.loadFile(indexHtml);
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const result = await win.webContents.executeJavaScript(`({
      href: location.href,
      rootLength: document.getElementById('root')?.innerHTML?.length ?? 0,
      hasPasswordInput: !!document.querySelector('input[type="password"]'),
      hasEmailInput: !!document.querySelector('input[type="email"], input[type="text"]'),
    })`);

    console.log(JSON.stringify({ indexHtml, ...result }, null, 2));

    if (String(result.href).match(/^file:\/\/\/[A-Za-z]:\/$/)) {
      throw new Error(`Renderer navigated to drive root: ${result.href}`);
    }

    if (result.rootLength === 0) {
      throw new Error('React root is empty after loadFile');
    }

    if (!result.hasPasswordInput) {
      throw new Error('Login password input not found in packaged renderer');
    }

    console.log('[smoke-renderer] PASS');
  } finally {
    win.destroy();
    app.quit();
  }
}

run().catch((err) => {
  console.error('[smoke-renderer] FAIL', err);
  app.quit();
  process.exit(1);
});
