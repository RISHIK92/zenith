const { execFile } = require('node:child_process');

const BROWSER_URL_SCRIPTS = {
  'Google Chrome': 'tell application "Google Chrome" to get URL of active tab of front window',
  Safari: 'tell application "Safari" to get URL of front document',
  Arc: 'tell application "Arc" to get URL of active tab of front window',
  'Brave Browser': 'tell application "Brave Browser" to get URL of active tab of front window',
  'Microsoft Edge': 'tell application "Microsoft Edge" to get URL of active tab of front window',
};

function runAppleScript(script) {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 1500 }, (err, stdout) => {
      if (err) return resolve('');
      resolve(String(stdout || '').trim());
    });
  });
}

async function getFrontmostContext() {
  if (process.platform !== 'darwin') {
    return { appName: '', url: '' };
  }
  const appName = await runAppleScript(
    'tell application "System Events" to get name of first application process whose frontmost is true',
  );
  if (!appName) return { appName: '', url: '' };

  let url = '';
  const urlScript = BROWSER_URL_SCRIPTS[appName];
  if (urlScript) {
    url = await runAppleScript(urlScript);
  }
  return { appName, url };
}

class DistractionMonitor {
  constructor({ onStatus, onBlocked }) {
    this.onStatus = onStatus;
    this.onBlocked = onBlocked;
    this.timer = null;
    this.running = false;
    this.cooldowns = new Map(); // resourceId -> timestamp
    this.lastStatus = {
      running: false,
      activeApp: '',
      activeUrl: '',
      lastCheckedAt: null,
      supported: process.platform === 'darwin',
    };
  }

  getStatus() {
    return { ...this.lastStatus };
  }

  start(checkFn) {
    if (this.running) return;
    this.running = true;
    this.lastStatus = { ...this.lastStatus, running: true };
    this.onStatus?.(this.getStatus());

    const poll = async () => {
      if (!this.running) return;
      const { appName, url } = await getFrontmostContext();
      this.lastStatus = {
        running: true,
        activeApp: appName,
        activeUrl: url,
        lastCheckedAt: new Date().toISOString(),
        supported: process.platform === 'darwin',
      };
      this.onStatus?.(this.getStatus());

      // Never trigger on Zenith/Electron itself
      if (!appName || appName === 'Electron' || appName === 'Zenith') return;

      const candidates = [url, appName].filter(Boolean);
      for (const candidate of candidates) {
        const res = checkFn(candidate);
        if (res?.blocked && res.resource) {
          const now = Date.now();
          const prev = this.cooldowns.get(res.resource.id) || 0;
          if (now - prev >= 15000) {
            this.cooldowns.set(res.resource.id, now);
            this.onBlocked?.(res, { appName, url });
          }
          break;
        }
      }
    };

    poll().catch(() => {});
    this.timer = setInterval(() => {
      poll().catch(() => {});
    }, 3000);
  }

  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.lastStatus = { ...this.lastStatus, running: false };
    this.onStatus?.(this.getStatus());
  }
}

module.exports = { DistractionMonitor };
