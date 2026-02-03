import 'dotenv/config';
import { spawn } from 'child_process';
import net from 'net';
import { neon } from '@neondatabase/serverless';

const BACKEND_CWD = process.cwd();
const SERVER_URL = 'http://localhost:8000';
const CHECK_TIMEOUT = 12000;

function waitForPort(port: number, ms: number) {
  const start = Date.now();
  return new Promise<void>((resolve, reject) => {
    (function tryConnect() {
      const s = net.connect(port, '127.0.0.1');
      s.on('connect', () => {
        s.destroy();
        resolve();
      });
      s.on('error', () => {
        s.destroy();
        if (Date.now() - start > ms) return reject(new Error('timeout waiting for port'));
        setTimeout(tryConnect, 200);
      });
    })();
  });
}

async function startServerIfNeeded() {
  // If something is listening on 8000, assume server is up
  try {
    await waitForPort(8000, 500);
    console.log('Server appears to already be running on port 8000; will use it for test.');
    return null;
  } catch (e) {
    console.log('Starting backend server for integration test...');
    const proc = spawn('npx', ['tsx', 'watch', 'src/index.ts'], { cwd: BACKEND_CWD, stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout?.on('data', (d) => process.stdout.write(`[server] ${d.toString()}`));
    proc.stderr?.on('data', (d) => process.stderr.write(`[server] ${d.toString()}`));

    try {
      await waitForPort(8000, CHECK_TIMEOUT);
      console.log('Backend server is accepting connections.');
      return proc;
    } catch (err) {
      proc.kill();
      throw err;
    }
  }
}

async function main() {
  const serverProc = await startServerIfNeeded();

  const code = `TEST-${Date.now()}`;
  const description = 'A'.repeat(2000); // long description to ensure >255 char limit
  const payload = { code, name: 'Integration Test Dept', description };

  // Give server a moment if it just started
  await new Promise((r) => setTimeout(r, 250));

  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}/api/departments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('Request failed (is the server running?):', e);
    if (serverProc) serverProc.kill();
    process.exit(2);
    return;
  }

  if (!res.ok) {
    console.error('Server responded with non-OK status:', res.status, await res.text());
    if (serverProc) serverProc.kill();
    process.exit(1);
    return;
  }

  const body = await res.json().catch(() => null);
  // API responses wrap payload in `{ data: ... }` in many handlers — normalize here
  const created = body?.data ?? body;
  if (!created || !created.id || created.description !== description) {
    console.error('Unexpected response body:', body);
    if (serverProc) serverProc.kill();
    process.exit(1);
    return;
  }

  console.log('Integration test succeeded: department created id=', created.id);

  // Cleanup the created row via the API DELETE endpoint to avoid direct DB client dependency in CI
  try {
    const delRes = await fetch(`${SERVER_URL}/api/departments/${created.id}`, { method: 'DELETE' });
    if (!delRes.ok) {
      console.warn('Failed to delete via API, status:', delRes.status, await delRes.text().catch(()=>''));
    } else {
      console.log('Cleanup: deleted created department id=', created.id);
    }
  } catch (e) {
    console.warn('Cleanup failed:', e);
  }

  if (serverProc) {
    serverProc.kill();
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
