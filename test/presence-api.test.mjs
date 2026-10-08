import test from 'node:test';
import assert from 'node:assert/strict';
import { request as rawRequest } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOffice } from '../src/server.mjs';
import { digest } from '../src/domain.mjs';
import { demoPolicy, DemoSource } from '../src/fixtures.mjs';
const projectId = 'demo/observatorio';
const config = () => ({ agents: [
  { id: 'aurora/worker', label: 'Worker Aurora', ownerId: 'aurora', projects: [projectId] },
  { id: 'marea/worker', label: 'Worker Marea', ownerId: 'marea', projects: [projectId] }
], credentials: [
  { agentId: 'aurora/worker', keyHash: digest('synthetic-aurora-agent') },
  { agentId: 'marea/worker', keyHash: digest('synthetic-marea-agent') }
] });
async function start(t, options = {}) {
  const app = createOffice({ mode: 'live', policyLoader: () => demoPolicy, source: new DemoSource(),
    presenceLoader: config, config: { OFFICE_PRESENCE_PROJECT: projectId }, ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const request = (path, { cookie, key, data, headers = {} } = {}) => fetch(origin + path, {
    headers: { ...(cookie ? { cookie } : {}), ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(data === undefined ? {} : { origin, 'content-type': 'application/json' }), ...headers },
    ...(data === undefined ? {} : { method: 'POST', body: JSON.stringify(data) })
  });
  const login = async team => {
    const result = await request('/api/session', { data: { key: `demo-${team}` } });
    assert.equal(result.status, 200); return result.headers.get('set-cookie').split(';')[0];
  };
  const beat = (sequence, extra = {}) => request('/api/presence/heartbeat', {
    key: 'synthetic-marea-agent', data: { projectId, sequence }, ...extra });
  return { request, login, beat, origin };
}

test('presencia HTTP: agente autenticado, lectura por sesión y estados caducables', async t => {
  let time = 1000; const { request, login, beat } = await start(t, { now: () => time });
  assert.equal((await request('/api/presence')).status, 401);
  const cookie = await login('aurora');
  const read = async () => (await request('/api/presence', { cookie })).json();
  assert.ok((await read()).agents.every(agent => agent.status === 'offline'));
  const response = await beat(0); assert.equal(response.status, 200);
  assert.equal((await response.json()).agentId, 'marea/worker');
  assert.equal((await read()).agents[1].status, 'online');
  time = 6001; assert.equal((await read()).agents[1].status, 'stale');
  time = 16001; assert.equal((await read()).agents[1].status, 'offline');
  const data = await read(); assert.doesNotMatch(JSON.stringify(data), /keyHash|synthetic-|demo-aurora|sequence/);
  assert.equal(data.expiresAt - data.generatedAt, 1000);
});

test('cookie de equipo, agente declarado y clave de otro propietario no suplantan al emisor', async t => {
  const { request, login, beat } = await start(t); const cookie = await login('aurora');
  assert.equal((await beat(0, { key: undefined, cookie })).status, 401);
  assert.equal((await beat(0, { key: 'demo-aurora' })).status, 401);
  assert.equal((await beat(0, { data: { projectId, sequence: 0, agentId: 'aurora/worker' } })).status, 400);
  assert.equal((await beat(0, { data: { projectId: 'demo/archivo', sequence: 0 } })).status, 403);
  assert.equal((await beat(0, { key: 'synthetic-aurora-agent' })).status, 200);
  const data = await (await request('/api/presence', { cookie })).json();
  assert.equal(data.agents[0].status, 'online'); assert.equal(data.agents[1].status, 'offline');
  assert.equal((await request('/api/presence?projectId=demo/archivo', { cookie })).status, 400);
});

test('duplicados y secuencias atrasadas no renuevan el heartbeat; reconexión necesita secuencia mayor', async t => {
  let time = 1000; const { beat, request, login } = await start(t, { now: () => time });
  assert.equal((await beat(2)).status, 200); time = 17000;
  assert.equal((await beat(2)).status, 409); assert.equal((await beat(1)).status, 409);
  assert.equal((await beat(-1)).status, 400);
  const cookie = await login('marea');
  assert.equal((await (await request('/api/presence', { cookie })).json()).agents[1].seenAt, 1000);
  assert.equal((await beat(3)).status, 200);
});

test('lectura de presencia deniega proyecto no autorizado al equipo', async t => {
  const selected = config(); selected.agents = selected.agents.slice(0, 1); selected.credentials = selected.credentials.slice(0, 1);
  selected.agents[0].projects = ['demo/archivo'];
  const { request, login } = await start(t, { presenceLoader: () => selected, config: { OFFICE_PRESENCE_PROJECT: 'demo/archivo' } });
  assert.equal((await request('/api/presence', { cookie: await login('marea') })).status, 403);
});

async function partial(origin, key = 'synthetic-marea-agent') {
  let resolveResponse, rejectResponse;
  const response = new Promise((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject; });
  const req = rawRequest(origin + '/api/presence/heartbeat', { method: 'POST', headers: {
    origin, authorization: `Bearer ${key}`, 'content-type': 'application/json', 'transfer-encoding': 'chunked'
  } }, res => { let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => resolveResponse({ status: res.statusCode, text })); });
  req.on('error', rejectResponse); req.write('{');
  return { req, response };
}
async function waitBusy(beat) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = await beat(99);
    if (result.status === 429) { await result.arrayBuffer(); return; }
    await result.arrayBuffer(); await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('El servidor no entró en lectura parcial.');
}
for (const kind of ['policy', 'credential', 'agent-removal', 'broken-config']) {
  test(`revocación ${kind} durante cuerpo parcial impide publicar y retira datos previos`, async t => {
    let policy = structuredClone(demoPolicy); let selected = config();
    const { origin, beat, request, login } = await start(t, { policyLoader: () => policy, presenceLoader: () => selected });
    const cookie = await login('marea'); assert.equal((await beat(0)).status, 200);
    const pending = await partial(origin); t.after(() => pending.req.destroy());
    await waitBusy(beat);
    if (kind === 'policy') policy.projects[0].readers = ['aurora'];
    else if (kind === 'credential') selected.credentials[1].keyHash = digest('replacement-synthetic-key');
    else if (kind === 'agent-removal') {
      selected.agents = selected.agents.slice(0, 1); selected.credentials = selected.credentials.slice(0, 1);
    } else selected = null;
    pending.req.end(`"projectId":"${projectId}","sequence":100}`);
    const result = await pending.response;
    assert.equal(result.status, ['credential', 'agent-removal'].includes(kind) ? 403 : 503);
    assert.doesNotMatch(result.text, /worker|keyHash|synthetic-|observatorio/);
    policy = structuredClone(demoPolicy); selected = config();
    const read = await request('/api/presence', { cookie });
    if (read.status === 401) {
      const fresh = await request('/api/presence', { cookie: await login('marea') });
      assert.ok((await fresh.json()).agents.every(agent => agent.status === 'offline'));
    } else { assert.equal(read.status, 200); assert.ok((await read.json()).agents.every(agent => agent.status === 'offline')); }
    assert.equal((await beat(101)).status, 200);
  });
}

test('configuración ausente desactiva presencia; inválida o clave reutilizada falla al arrancar', async t => {
  const { request, login, beat } = await start(t, { presenceLoader: undefined, config: {} });
  assert.equal((await beat(0)).status, 404);
  assert.equal((await request('/api/presence', { cookie: await login('marea') })).status, 404);
  for (const selected of [null, { ...config(), credentials: [] }, { ...config(), credentials: config().credentials.map(c => ({ ...c, keyHash: demoPolicy.members[0].keyHash })) }]) {
    assert.throws(() => createOffice({ presenceLoader: () => selected, config: { OFFICE_PRESENCE_PROJECT: projectId } }), { code: 'PRESENCE_UNAVAILABLE' });
  }
});

test('fichero local explícito no exporta rutas ni errores de parseo', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'synthetic-presence-')); t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'agents.json'); writeFileSync(path, JSON.stringify(config()));
  const { beat, request, login } = await start(t, { presenceLoader: undefined,
    config: { OFFICE_AGENT_DIRECTORY: path, OFFICE_PRESENCE_PROJECT: projectId } });
  assert.equal((await beat(0)).status, 200); writeFileSync(path, 'PRIVATE_SENTINEL');
  const result = await request('/api/presence', { cookie: await login('marea') });
  assert.equal(result.status, 503); assert.doesNotMatch(await result.text(), /PRIVATE_SENTINEL|synthetic-presence-/);
});

test('cuerpo excesivo y errores liberan la publicación y conservan controles de origen', async t => {
  const { beat } = await start(t);
  assert.equal((await beat(0, { data: { projectId, sequence: 'x'.repeat(3000) } })).status, 413);
  assert.equal((await beat(0, { headers: { origin: 'https://other.invalid' } })).status, 403);
  assert.equal((await beat(0)).status, 200);
});

test('límite por agente y límite global de intentos son acotados', async t => {
  let time = 1000; const { beat } = await start(t, { now: () => time });
  for (let i = 0; i < 60; i++) assert.equal((await beat(i)).status, 200);
  assert.equal((await beat(60)).status, 429);
  for (let i = 0; i < 59; i++) assert.equal((await beat(61, { key: 'invalid-synthetic' })).status, 401);
  assert.equal((await beat(62, { key: 'invalid-synthetic' })).status, 429);
  time += 60000; assert.equal((await beat(63)).status, 200);
});

test('cuatro cuerpos parciales agotan el límite global y se libera tras completarlos', async t => {
  const selected = { agents: [], credentials: [] };
  for (let i = 0; i < 5; i++) {
    selected.agents.push({ id: `marea/worker-${i}`, label: `Worker ${i}`, ownerId: 'marea', projects: [projectId] });
    selected.credentials.push({ agentId: `marea/worker-${i}`, keyHash: digest(`synthetic-worker-${i}`) });
  }
  const { origin, beat } = await start(t, { presenceLoader: () => selected });
  const pending = [];
  for (let i = 0; i < 4; i++) {
    const item = await partial(origin, `synthetic-worker-${i}`); pending.push(item);
    t.after(() => item.req.destroy());
    await waitBusy(sequence => beat(sequence, { key: `synthetic-worker-${i}` }));
  }
  assert.equal((await beat(0, { key: 'synthetic-worker-4' })).status, 429);
  for (const item of pending) item.req.end(`"projectId":"${projectId}","sequence":100}`);
  assert.ok((await Promise.all(pending.map(item => item.response))).every(result => result.status === 200));
  assert.equal((await beat(0, { key: 'synthetic-worker-4' })).status, 200);
});

test('política rota observada por API retira presencia; recuperarla no resucita datos', async t => {
  let policy = structuredClone(demoPolicy);
  const { beat, request, login } = await start(t, { policyLoader: () => policy });
  const cookie = await login('marea'); assert.equal((await beat(0)).status, 200);
  policy = null;
  assert.equal((await request('/api/snapshot', { cookie })).status, 503);
  policy = structuredClone(demoPolicy);
  const result = await request('/api/presence', { cookie }); assert.equal(result.status, 200);
  assert.ok((await result.json()).agents.every(agent => agent.status === 'offline'));
});
