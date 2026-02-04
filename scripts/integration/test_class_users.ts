import 'dotenv/config';
import { spawn } from 'child_process';
import net from 'net';

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

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function main() {
  const serverProc = await startServerIfNeeded();

  // Give server a moment if it just started
  await new Promise((r) => setTimeout(r, 250));

  // Create department
  const deptPayload = { code: `TST-DEPT-${Date.now()}`, name: 'Integration Test Dept' };
  const deptRes = await fetch(`${SERVER_URL}/api/departments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deptPayload) });
  if (!deptRes.ok) {
    console.error('Failed to create department', deptRes.status, await deptRes.text());
    if (serverProc) serverProc.kill();
    process.exit(1);
  }
  const deptBody = (await safeJson(deptRes)) ?? {};
  const department = deptBody.data ?? deptBody;

  // Create subject (needs departmentId)
  const subjectPayload = { name: `TST-SUB-${Date.now()}`, code: `TST-${Date.now()}`, departmentId: department.id };
  const subRes = await fetch(`${SERVER_URL}/api/subjects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(subjectPayload) });
  if (!subRes.ok) {
    console.error('Failed to create subject', subRes.status, await subRes.text());
    if (serverProc) serverProc.kill();
    process.exit(1);
  }
  const subBody = (await safeJson(subRes)) ?? {};
  const subject = subBody.data ?? subBody;

  // Create a teacher user
  const userPayload = { email: `t${Date.now()}@example.com`, name: 'Test Teacher', role: 'teacher' };
  const userRes = await fetch(`${SERVER_URL}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userPayload) });
  if (!userRes.ok) {
    console.error('Failed to create user', userRes.status, await userRes.text());
    if (serverProc) serverProc.kill();
    process.exit(1);
  }
  const userBody = (await safeJson(userRes)) ?? {};
  const teacher = userBody.data ?? userBody;

  // Create class (with no enrollments)
  const classPayload = { name: `TST-CLASS-${Date.now()}`, subjectId: subject.id, teacherId: teacher.id };
  const classRes = await fetch(`${SERVER_URL}/api/classes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(classPayload) });
  if (!classRes.ok) {
    console.error('Failed to create class', classRes.status, await classRes.text());
    if (serverProc) serverProc.kill();
    process.exit(1);
  }
  const classBody = (await safeJson(classRes)) ?? {};
  const createdClass = classBody.data ?? classBody;

  // Test 1: GET /api/classes/:id/users returns 200 and empty data array
  const usersRes = await fetch(`${SERVER_URL}/api/classes/${createdClass.id}/users`);
  if (!usersRes.ok) {
    console.error('GET users returned non-OK for existing class:', usersRes.status, await usersRes.text());
    if (serverProc) serverProc.kill();
    process.exit(1);
  }
  const usersBody = (await safeJson(usersRes)) ?? {};
  const users = usersBody.data ?? usersBody;
  if (!Array.isArray(users) || users.length !== 0) {
    console.error('Expected empty users array for new class, got:', usersBody);
    if (serverProc) serverProc.kill();
    process.exit(1);
  }
  console.log('PASS: GET /api/classes/:id/users returns empty array for new class');

  // Test 2: GET for non-existent class id returns 404
  const missingRes = await fetch(`${SERVER_URL}/api/classes/99999999/users`);
  if (missingRes.status !== 404) {
    console.error('Expected 404 for missing class users, got:', missingRes.status, await missingRes.text());
    if (serverProc) serverProc.kill();
    process.exit(1);
  }
  console.log('PASS: GET /api/classes/:id/users returns 404 for missing class');

  // Cleanup: delete created class, subject, user, department
  try {
    await fetch(`${SERVER_URL}/api/classes/${createdClass.id}`, { method: 'DELETE' });
    await fetch(`${SERVER_URL}/api/subjects/${subject.id}`, { method: 'DELETE' });
    await fetch(`${SERVER_URL}/api/users/${teacher.id}`, { method: 'DELETE' });
    await fetch(`${SERVER_URL}/api/departments/${department.id}`, { method: 'DELETE' });
    console.log('Cleanup done');
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
