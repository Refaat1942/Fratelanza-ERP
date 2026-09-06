import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { randomUUID } from 'crypto';

const DEVICE_ID_FILE = 'device-id.json';

function getMetaPath(): string {
  const dataDir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return path.join(dataDir, DEVICE_ID_FILE);
}

export function getOrCreateDeviceId(): string {
  const metaPath = getMetaPath();
  if (fs.existsSync(metaPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as { deviceId?: string };
      if (parsed.deviceId) return parsed.deviceId;
    } catch {
      // fall through to create new id
    }
  }
  const deviceId = randomUUID();
  fs.writeFileSync(metaPath, JSON.stringify({ deviceId }), 'utf8');
  return deviceId;
}
