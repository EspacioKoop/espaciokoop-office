import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

async function portNumber() {
  const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r));
  const port = s.address().port; await new Promise(r => s.close(r)); return port;
}
async function start(directory) {
  const port = await portNumber();
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OFFICE_')));
  const child = spawn(process.execPath, ['src/server.mjs', '--demo'], { env: { ...env, OFFICE_PORT: String(port), ...(directory ? { OFFICE_AGENCY_DIR: directory } : {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stderr.on('data', b => { output += b; });
  const exit = new Promise(r => child.once('exit', r));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 5000);
    child.stdout.on('data', () => { clearTimeout(timer); resolve(); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(`startup: ${output}`)); });
  });
  const origin = `http://127.0.0.1:${port}`;
  async function request(path, data, headers = {}) {
    const response = await fetch(origin + path, { method: data === undefined ? 'GET' : 'POST', headers: { ...(data === undefined ? {} : { origin, 'content-type': 'application/json' }), ...headers }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  return { request, async close() { child.kill('SIGTERM'); await exit; } };
}
test('conectores sintéticos por HTTP: aislamiento, reinicio y revocación', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agency-http-')); let app;
  try {
    app = await start(dir);
    let a = (await app.request('/api/session', { key: 'demo-aurora' })).cookie;
    let b = (await app.request('/api/session', { key: 'demo-marea' })).cookie;
    assert.equal((await app.request('/api/agency/connectors', { operation_id: 'a', runtime: 'hermes' })).status, 401);
    const created = await app.request('/api/agency/connectors', { operation_id: 'a', runtime: 'hermes' }, { cookie: a });
    assert.equal(created.status, 201); const { id, token } = created.body;
    const other = await app.request('/api/agency/connectors', { operation_id: 'b', runtime: 'claude-code' }, { cookie: b });
    assert.equal(other.status, 201);
    assert.equal((await app.request('/api/agency/connectors/heartbeat', {}, { authorization: `Bearer ${other.body.token}` })).status, 200);
    assert.equal((await app.request('/api/agency/connectors', { operation_id: 'a', runtime: 'hermes' }, { cookie: a })).body.token, undefined);
    assert.equal((await app.request('/api/agency/connectors', { operation_id: 'a', runtime: 'claude-code' }, { cookie: a })).status, 409);
    assert.equal((await app.request(`/api/agency/connectors/${id}/revoke`, {}, { cookie: b })).status, 403);
    assert.equal((await app.request('/api/agency/connectors/heartbeat', {}, { authorization: `Bearer ${token}` })).status, 200);
    assert.equal(readFileSync(join(dir, 'agency.sqlite')).includes(token), false);
    await app.close(); app = await start(dir);
    a = (await app.request('/api/session', { key: 'demo-aurora' })).cookie;
    assert.equal((await app.request('/api/agency/connectors/heartbeat', {}, { authorization: `Bearer ${token}` })).status, 200);
    assert.equal((await app.request(`/api/agency/connectors/${id}/revoke`, {}, { cookie: a })).status, 200);
    assert.equal((await app.request('/api/agency/connectors/heartbeat', {}, { authorization: `Bearer ${token}` })).status, 401);
    assert.equal((await app.request('/api/agency/connectors/heartbeat', {}, { authorization: `Bearer ${other.body.token}` })).status, 200);
    assert.equal((await app.request('/api/agency', undefined, { cookie: a })).status, 503);
  } finally { await app?.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('sin almacén configurado, agencia falla cerrado tras autenticación', async () => {
  const app = await start();
  try {
    const a = (await app.request('/api/session', { key: 'demo-aurora' })).cookie;
    assert.equal((await app.request('/api/agency', undefined, { cookie: a })).status, 503);
  } finally { await app.close(); }
});
