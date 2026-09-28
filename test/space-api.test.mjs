import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

import { request as rawRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { demoPolicy } from '../src/fixtures.mjs';

async function fixture(t, { demo = false, project = 'demo/observatorio' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'office-api-test-'));
  const directory = join(root, 'space'); const policyPath = join(root, 'policy.json');
  const temporaryRoot = join(root, 'temporary'); await mkdir(temporaryRoot);
  const policy = structuredClone(demoPolicy);
  for (const p of policy.projects) p.tasks = [];
  const savePolicy = () => writeFile(policyPath, JSON.stringify(policy), { mode: 0o600 });
  await savePolicy();
  const children = new Set();
  t.after(async () => { for (const close of children) await close(); await rm(root, { recursive: true, force: true }); });
  async function start() {
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('OFFICE_')));
    // Exercise the production composition in a child; let the OS allocate its port
    // atomically. The source is synthetic, while sessions, policy and disk are real.
    const script = `
      import { createOffice } from ${JSON.stringify(new URL('../src/server.mjs', import.meta.url).href)};
      import { DemoSource } from ${JSON.stringify(new URL('../src/fixtures.mjs', import.meta.url).href)};
      const app = createOffice({ mode: ${JSON.stringify(demo ? 'demo' : 'live')}, source: new DemoSource(),
        policyPath: process.env.OFFICE_POLICY, config: process.env });
      app.server.listen(0, '127.0.0.1', () => process.send({ port: app.server.address().port }));
      process.once('SIGTERM', async () => { await app.close(); process.exit(0); });
    `;
    const child = spawn(process.execPath, ['--input-type=module', '--eval', script], {
      env: { ...env, TMPDIR: temporaryRoot, OFFICE_POLICY: policyPath,
        OFFICE_SPACE_PROJECT: project, OFFICE_SPACE_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let output = ''; child.stdout.on('data', c => { output += c; }); child.stderr.on('data', c => { output += c; });
    const exited = new Promise(resolve => child.once('exit', resolve));
    const close = async () => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); await exited; children.delete(close); };
    children.add(close);
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Startup timeout')); }, 5000);
      child.once('error', reject);
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Service failed to start (${code}): ${output}`)); });
      child.once('message', message => { clearTimeout(timer); resolve(message.port); });
    });
    const origin = `http://127.0.0.1:${port}`;
    const request = (path, { data, cookie, raw, headers = {}, ...rest } = {}) => fetch(origin + path, {
      signal: AbortSignal.timeout(5000), ...rest,
      headers: { origin, ...(cookie ? { cookie } : {}), ...(data === undefined && raw === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      ...(data === undefined && raw === undefined ? {} : { method: 'POST', body: raw ?? JSON.stringify(data) }),
    });
    const login = async member => {
      const res = await request('/api/session', { data: { key: `demo-${member}` } });
      assert.equal(res.status, 200); assert.equal((await res.json()).memberId, member);
      return res.headers.get('set-cookie').split(';')[0];
    };
    const command = (cookie, data) => request('/api/space/command', { cookie, data });
    const view = async cookie => { const r = await request('/api/space', { cookie }); assert.equal(r.status, 200); return r.json(); };
    const success = async (cookie, data) => { const r = await command(cookie, data); assert.equal(r.status, 200); return r.json(); };
    async function events(cookie) {
      const controller = new AbortController(); t.after(() => controller.abort());
      const res = await request('/api/events', { cookie, signal: controller.signal }); assert.equal(res.status, 200);
      const reader = res.body.getReader(); let text = ''; const waits = new Set();
      const consume = (async () => {
        try { for (;;) { const { value, done } = await reader.read(); if (done) break; text += new TextDecoder().decode(value); for (const check of waits) check(); } }
        catch (e) { if (!controller.signal.aborted) throw e; }
      })();
      consume.catch(() => {});
      return { text: () => text, close: () => controller.abort(), wait(needle) {
        if (text.includes(needle)) return Promise.resolve();
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => { waits.delete(check); reject(new Error(`Missing SSE ${needle}`)); }, 3000);
          const check = () => { if (text.includes(needle)) { clearTimeout(timer); waits.delete(check); resolve(); } };
          waits.add(check);
        });
      } };
    }
    return { close, request, login, command, success, view, events, origin, output: () => output };
  }
  return { start, policy, savePolicy, directory, temporaryRoot, root,
    filename: join(directory, `${createHash('sha256').update(project).digest('hex')}.json`) };
}
const createRoom = (room_id = 'lobby', scope = 'common') => ({
  type: 'room.create', idempotency_key: `create-${room_id}`, expected_revision: 0,
  room_id, label: 'Sala de ejemplo', scope, width: 12, height: 12,
});
const updateRoom = (room_id, expected_revision, idempotency_key = 'update-room') => ({
  type: 'room.update', idempotency_key, expected_revision, room_id, label: 'Sala actualizada', width: 12, height: 12,
});

test('espacios: contexto del backend, sala personal protegida y común editable por ambos', async t => {
  const f = await fixture(t); const app = await f.start();
  const a = await app.login('aurora'); const b = await app.login('marea');
  assert.equal((await app.request('/api/space')).status, 403);
  await app.success(a, createRoom('aurora', 'personal'));
  const denied = await app.command(b, updateRoom('aurora', 1));
  assert.equal(denied.status, 403); assert.deepEqual(await denied.json(), { error: 'FORBIDDEN' });
  await app.success(a, createRoom());
  await app.success(b, updateRoom('lobby', 1));
  await app.success(a, updateRoom('lobby', 2));
  const view = await app.view(b);
  assert.equal(view.project_id, 'demo/observatorio'); assert.equal(view.revision, 4);
  assert.equal(view.rooms.find(r => r.id === 'aurora').owner_id, 'aurora');
  assert.equal(view.rooms.find(r => r.id === 'lobby').revision, 3);
  assert.ok(!('receipts' in view)); assert.ok(!('retired_rooms' in view));
});

test('espacios: revisión conflictiva y reintento idéntico conservan recibo sin duplicar', async t => {
  const f = await fixture(t); const app = await f.start();
  const a = await app.login('aurora'); const b = await app.login('marea');
  await app.success(a, createRoom());
  const command = updateRoom('lobby', 1); const first = await app.success(a, command);
  const conflict = await app.command(b, updateRoom('lobby', 1));
  assert.equal(conflict.status, 409); assert.deepEqual(await conflict.json(), { error: 'REVISION_CONFLICT' });
  const retry = await app.success(a, command);
  assert.equal(first.duplicate, false); assert.equal(retry.duplicate, true); assert.deepEqual(retry.receipt, first.receipt);
  const changed = await app.command(a, { ...command, label: 'Otra intención' });
  assert.equal(changed.status, 409); assert.deepEqual(await changed.json(), { error: 'IDEMPOTENCY_CONFLICT' });
  assert.equal((await app.view(b)).revision, 2);
});

test('espacios: esquema exacto rechaza extras, suplantación, tipos y cuerpos excesivos', async t => {
  const f = await fixture(t); const app = await f.start(); const a = await app.login('aurora');
  for (const field of ['owner_id', 'actor_id', 'project_id', 'capabilities', 'assertAuthorized', 'context', 'directory', 'extra', '__proto__']) {
    const res = await app.command(a, { ...createRoom(), [field]: 'example' });
    assert.equal(res.status, 400, field); assert.deepEqual(await res.json(), { error: 'INVALID_INPUT' });
  }
  for (const data of [{ ...createRoom(), type: 'unknown' }, { ...createRoom(), width: '12' }, { type: 'room.create' }, null, []]) {
    assert.equal((await app.command(a, data)).status, 400);
  }
  assert.equal((await app.request('/api/space/command', { cookie: a, raw: '{' })).status, 400);
  assert.equal((await app.request('/api/space/command', { cookie: a, data: createRoom(), headers: { 'content-type': 'text/plain' } })).status, 415);
  const exact = JSON.stringify(createRoom()).padEnd(2048, ' ');
  assert.equal((await app.request('/api/space/command', { cookie: a, raw: exact })).status, 200);
  const limit = await app.request('/api/space/command', { cookie: a, raw: exact + ' ' });
  assert.equal(limit.status, 413); assert.deepEqual(await limit.json(), { error: 'BODY_LIMIT' });
  assert.equal((await app.view(a)).revision, 1);
});

test('espacios: revocar durante una sesión rechaza el comando y envía revoke por SSE', async t => {
  const f = await fixture(t); const app = await f.start();
  const b = await app.login('marea'); const stream = await app.events(b);
  // Demonstrate this is a live space session before changing its policy.
  assert.equal((await app.view(b)).revision, 0);
  f.policy.members = f.policy.members.filter(m => m.id !== 'marea');
  for (const p of f.policy.projects) p.readers = p.readers.filter(id => id !== 'marea');
  await f.savePolicy();
  const rejected = await app.command(b, createRoom()); assert.equal(rejected.status, 403);
  assert.deepEqual(await rejected.json(), { error: 'ACCESS_REVOKED' });
  await stream.wait('event: revoke'); assert.doesNotMatch(stream.text(), /event: space|keyHash|lobby/);
  const a = await app.login('aurora'); assert.equal((await app.view(a)).revision, 0);
});

test('espacios: guardia síncrona revalida tras esperar un body parcial', async t => {
  const f = await fixture(t); const app = await f.start(); const b = await app.login('marea');
  assert.equal((await app.view(b)).revision, 0);
  const stream = await app.events(b);
  const payload = JSON.stringify(createRoom());
  let req;
  const response = new Promise((resolve, reject) => {
    req = rawRequest(app.origin + '/api/space/command', { method: 'POST', headers: {
      origin: app.origin, cookie: b, 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload),
    } }, res => { let text = ''; res.on('data', c => { text += c; }); res.on('end', () => resolve({ status: res.statusCode, text })); });
    req.setTimeout(3000, () => req.destroy(new Error('Partial body timeout'))); req.on('error', reject);
  });
  req.flushHeaders(); await new Promise(resolve => req.write(payload.slice(0, 10), resolve));
  f.policy.projects[0].readers = ['aurora']; await f.savePolicy();
  req.end(payload.slice(10));
  assert.equal((await response).status, 403); await stream.wait('event: revoke');
  const a = await app.login('aurora'); assert.equal((await app.view(a)).revision, 0);
});

test('espacios: la otra sesión recibe solo invalidación tras commit, no tras duplicado', async t => {
  const f = await fixture(t); const app = await f.start();
  const a = await app.login('aurora'); const b = await app.login('marea');
  const stream = await app.events(b); await stream.wait(': Office:');
  const first = await app.success(a, createRoom()); await stream.wait('event: space\ndata: {}');
  assert.equal((await app.view(b)).revision, first.receipt.revision);
  assert.deepEqual(JSON.parse(await readFile(f.filename, 'utf8')).revision, first.receipt.revision);
  await app.success(a, createRoom());
  await app.success(a, updateRoom('lobby', 1));
  // A later confirmed update is the barrier; duplicate must not add a signal.
  await stream.wait('event: space\ndata: {}\n\nevent: space\ndata: {}');
  assert.equal((stream.text().match(/event: space/g) ?? []).length, 2);
  assert.doesNotMatch(stream.text(), /lobby|aurora|owner_id|receipt|project_id/);
});

test('espacios: reiniciar conserva estado y reconoce recibo con sesión nueva', async t => {
  const f = await fixture(t); const first = await f.start(); const a = await first.login('aurora');
  const command = createRoom(); const receipt = (await first.success(a, command)).receipt;
  await first.close();
  const next = await f.start();
  assert.equal((await next.command(a, command)).status, 403);
  const renewed = await next.login('aurora'); const b = await next.login('marea');
  assert.equal((await next.view(b)).revision, 1);
  const retry = await next.success(renewed, command);
  assert.equal(retry.duplicate, true); assert.deepEqual(retry.receipt, receipt); assert.equal(retry.view.rooms.length, 1);
});

test('espacios: demo usa temporal propio, ignora disco persistente y lo retira al cerrar', async t => {
  const f = await fixture(t, { demo: true }); const app = await f.start(); const a = await app.login('aurora');
  await app.success(a, createRoom());
  assert.equal((await readdir(f.temporaryRoot)).length, 1);
  await assert.rejects(readdir(f.directory), { code: 'ENOENT' });
  await app.close(); assert.deepEqual(await readdir(f.temporaryRoot), []);
  const next = await f.start(); assert.equal((await next.view(await next.login('aurora'))).revision, 0);
});

test('espacios: proyecto del administrador y política impiden leer otra oficina', async t => {
  const f = await fixture(t, { project: 'demo/archivo' }); const app = await f.start();
  const a = await app.login('aurora'); const b = await app.login('marea');
  await app.success(a, createRoom());
  const res = await app.request('/api/space', { cookie: b }); assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'FORBIDDEN' });
  assert.equal((await app.request('/api/space?project_id=demo/archivo', { cookie: a })).status, 400);
  assert.equal((await app.view(a)).project_id, 'demo/archivo');
});

test('espacios: tipos del contrato recorren muebles, avatar propio y borrado', async t => {
  const f = await fixture(t); const app = await f.start(); const a = await app.login('aurora'); const b = await app.login('marea');
  await app.success(a, createRoom());
  const send = (cookie, type, expected_revision, fields) => app.success(cookie, { type, expected_revision, idempotency_key: type, ...fields });
  await send(a, 'furniture.place', 1, { room_id: 'lobby', item_id: 'desk', kind: 'desk', x: 2, y: 2, rotation: 0 });
  await send(b, 'furniture.move', 2, { room_id: 'lobby', item_id: 'desk', x: 3, y: 3, rotation: 90 });
  const av = await send(b, 'avatar.move', 0, { room_id: 'lobby', x: 1, y: 1 });
  assert.deepEqual(av.view.avatars.map(v => [v.actor_id, v.owner_id]), [['marea', 'marea']]);
  const occupied = await app.command(a, { type: 'room.delete', idempotency_key: 'occupied', expected_revision: 3, room_id: 'lobby' });
  assert.equal(occupied.status, 409); assert.deepEqual(await occupied.json(), { error: 'ROOM_NOT_EMPTY' });
  await send(b, 'avatar.leave', 1, {});
  await send(a, 'furniture.remove', 3, { room_id: 'lobby', item_id: 'desk' });
  await send(a, 'room.delete', 4, { room_id: 'lobby' });
  assert.deepEqual((await app.view(b)).rooms, []);
  const missing = await app.command(b, updateRoom('absent', 1));
  assert.equal(missing.status, 404); assert.deepEqual(await missing.json(), { error: 'NOT_FOUND' });
});

test('espacios: bloqueo y corrupción se rechazan sin mensajes ni rutas del disco', async t => {
  const f = await fixture(t); const app = await f.start(); const a = await app.login('aurora');
  await app.success(a, createRoom());
  const lock = f.filename.replace(/\.json$/, '.lock'); await writeFile(lock, '', { mode: 0o600 });
  const busy = await app.command(a, updateRoom('lobby', 1));
  assert.equal(busy.status, 503); assert.deepEqual(await busy.json(), { error: 'STORE_BUSY' });
  await rm(lock);
  await writeFile(f.filename, 'PRIVATE_SENTINEL invalid state', { mode: 0o600 });
  for (const res of [await app.request('/api/space', { cookie: a }), await app.command(a, updateRoom('lobby', 1))]) {
    assert.equal(res.status, 503); assert.deepEqual(await res.json(), { error: 'SPACE_UNAVAILABLE' });
  }
  assert.ok(!app.output().includes(f.root)); assert.doesNotMatch(app.output(), /PRIVATE_SENTINEL/);
});
