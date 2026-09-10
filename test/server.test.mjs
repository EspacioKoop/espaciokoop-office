import test from 'node:test';
import assert from 'node:assert/strict';
import { createOffice } from '../src/server.mjs';
import { DemoSource, demoPolicy } from '../src/fixtures.mjs';
const clone = x => structuredClone(x);
async function start(t, options = {}) {
  const app = createOffice(options);
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const request = (path, { data, cookie, headers = {}, ...rest } = {}) => fetch(origin + path, { ...rest, headers: { ...(data === undefined ? {} : { 'content-type': 'application/json', origin }), ...(cookie ? { cookie } : {}), ...headers }, ...(data === undefined ? {} : { method: 'POST', body: JSON.stringify(data) }) });
  const login = async key => { const response = await request('/api/session', { data: { key } }); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; };
  return { app, origin, request, login };
}
test('servidor local: controles de origen, sesión y contenido', async t => {
  const { request, login } = await start(t);
  assert.equal((await request('/api/snapshot')).status, 401);
  assert.equal((await request('/', { headers: { host: 'evil.invalid' } })).status, 403);
  assert.equal((await request('/api/session', { data: { key: 'demo-aurora' }, headers: { origin: 'https://evil.invalid' } })).status, 403);
  assert.equal((await request('/', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await request('/api/session', { data: { key: 'demo-aurora', actor: 'marea' } })).status, 400);
  const cookie = await login('demo-aurora');
  const res = await request('/api/snapshot', { cookie }); assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /no-store/); assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  const body = await res.json(); assert.equal(body.mode, 'demo'); assert.equal(body.projects.length, 2);
  assert.ok(!JSON.stringify(body).includes('keyHash')); assert.ok(!JSON.stringify(body).includes('demo-aurora'));
  assert.equal((await request('/api/snapshot?repo=other/private', { cookie })).status, 400);
  assert.equal((await request('/.env', { cookie })).status, 404);
  assert.equal((await request('/api/logout', { cookie, data: {} })).status, 200);
  assert.equal((await request('/api/snapshot', { cookie })).status, 401);
});
test('el recorrido HTTP sintético mantiene roles, conflictos y la cadena completa', async t => {
  const { request, login } = await start(t);
  const a = await login('demo-aurora'); const b = await login('demo-marea');
  const snapshot = async cookie => (await request('/api/snapshot', { cookie })).json();
  assert.equal((await snapshot(b)).projects.length, 1);
  assert.equal((await snapshot(a)).projects[0].tasks[0].stage, 'requested');
  assert.equal((await request('/api/demo/advance', { cookie: a, data: { version: 0 } })).status, 403);
  const results = await Promise.all([request('/api/demo/advance', { cookie: b, data: { version: 0 } }), request('/api/demo/advance', { cookie: b, data: { version: 0 } })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await snapshot(a)).projects[0].tasks[0].stage, 'accepted');
  assert.equal((await request('/api/demo/advance', { cookie: b, data: { version: 1 } })).status, 200);
  assert.equal((await snapshot(a)).projects[0].tasks[0].stage, 'delivered');
  assert.equal((await request('/api/demo/advance', { cookie: b, data: { version: 2 } })).status, 403);
  assert.equal((await request('/api/demo/advance', { cookie: a, data: { version: 2 } })).status, 200);
  assert.equal((await snapshot(a)).projects[0].tasks[0].stage, 'reviewed');
});
test('modo conectado filtra proyectos ANTES de consultar el origen', async t => {
  const queried = []; const demo = new DemoSource();
  const { request, login } = await start(t, { mode: 'live', policyLoader: () => demoPolicy, source: { read: async p => { queried.push(p.repo); return demo.read(p); } } });
  const cookie = await login('demo-marea'); const result = await request('/api/snapshot', { cookie });
  assert.equal(result.status, 200); assert.deepEqual(queried, ['demo/observatorio']);
  const text = await result.text(); assert.ok(!text.includes('demo/archivo'));
  assert.equal((await request('/api/demo/advance', { cookie, data: { version: 0 } })).status, 404);
});
test('revocar durante la consulta impide entregar el resultado anterior', async t => {
  let p = clone(demoPolicy); let entered; let release;
  const waiting = new Promise(resolve => { entered = resolve; }); const gate = new Promise(resolve => { release = resolve; });
  const demo = new DemoSource();
  const { request, login } = await start(t, { mode: 'live', policyLoader: () => p, source: { read: async project => { entered(); await gate; return demo.read(project); } } });
  const cookie = await login('demo-marea'); const pending = request('/api/snapshot', { cookie });
  await waiting; p.projects = []; release();
  const response = await pending; assert.equal(response.status, 401); assert.ok(!(await response.text()).includes('observatorio'));
});
test('la sesión SSE se revoca sin exportar tareas ni credenciales', async t => {
  let p = clone(demoPolicy);
  const { request, login } = await start(t, { mode: 'live', policyLoader: () => p, source: new DemoSource(), watchInterval: 20 });
  const cookie = await login('demo-aurora'); const response = await request('/api/events', { cookie, signal: AbortSignal.timeout(2000) });
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  await reader.read(); p.projects = [];
  let text = '';
  while (true) { const { done, value } = await reader.read(); if (done) break; text += decoder.decode(value); }
  assert.match(text, /event: revoke/); assert.doesNotMatch(text, /observatorio|keyHash|demo-aurora/);
  assert.equal((await request('/api/snapshot', { cookie })).status, 401);
});
test('una política rota nunca cae al modo de ejemplo', async t => {
  let p = clone(demoPolicy);
  const { request, login } = await start(t, { mode: 'live', policyLoader: () => p, source: new DemoSource() });
  const cookie = await login('demo-aurora'); p = null;
  const result = await request('/api/snapshot', { cookie }); assert.equal(result.status, 503); assert.doesNotMatch(await result.text(), /demo\/|keyHash/);
  assert.throws(() => createOffice({ mode: 'live', policyLoader: () => null, source: new DemoSource() }));
});
test('el servidor no reenvía excepciones con contenido del origen', async t => {
  const { request, login } = await start(t, { mode: 'live', policyLoader: () => demoPolicy, source: { read: async () => { throw new Error('PRIVATE_SENTINEL'); } } });
  const cookie = await login('demo-aurora'); const response = await request('/api/snapshot', { cookie });
  assert.equal(response.status, 500); assert.ok(!(await response.text()).includes('PRIVATE_SENTINEL'));
});
test('rutas estáticas explícitas, sin lectura arbitraria de ficheros', async t => {
  const { request } = await start(t);
  for (const path of ['/', '/app.mjs', '/style.css', '/office.svg']) {
    const res = await request(path); assert.equal(res.status, 200); assert.match(res.headers.get('cache-control'), /no-store/); await res.arrayBuffer();
  }
  assert.notEqual((await request('/src/server.mjs')).status, 200);
});
test('sesiones expiradas y límite de intentos', async t => {
  let time = Date.now(); const { request, login } = await start(t, { now: () => time });
  const cookie = await login('demo-aurora'); time += 3600001;
  assert.equal((await request('/api/snapshot', { cookie })).status, 401);
  for (let i = 0; i < 20; i++) await request('/api/session', { data: { key: 'wrong' } });
  assert.equal((await request('/api/session', { data: { key: 'wrong' } })).status, 429);
});
