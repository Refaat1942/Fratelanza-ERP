import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      preload: path.join(__dirname, '../dist-electron/preload.js'),
    },
  });

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    console.log(`[console:${level}] ${message} (${sourceId}:${line})`);
  });
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.log(`[fail-load] ${code} ${desc} ${url}`);
  });

  await win.loadFile(path.join(__dirname, '../dist/index.html'));
  await new Promise((r) => setTimeout(r, 3000));

  const info = await win.webContents.executeJavaScript(`({
    href: location.href,
    rootLen: document.getElementById('root')?.innerHTML?.length ?? 0,
    scripts: [...document.scripts].map(s => s.src),
  })`);
  console.log(JSON.stringify(info, null, 2));
  app.quit();
});
