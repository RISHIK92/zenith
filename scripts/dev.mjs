import { spawn } from 'node:child_process';

const DEV_URL = 'http://localhost:5173';

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for Vite dev server at ${url}`);
}

const vite = spawn('npx', ['vite', '--port', '5173'], { stdio: 'inherit', shell: true });

try {
  await waitForServer(DEV_URL);
  const electron = spawn('npx', ['electron', '.'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ZENITH_DEV_URL: DEV_URL },
  });
  electron.on('exit', (code) => {
    vite.kill();
    process.exit(code ?? 0);
  });
} catch (err) {
  console.error(err);
  vite.kill();
  process.exit(1);
}
