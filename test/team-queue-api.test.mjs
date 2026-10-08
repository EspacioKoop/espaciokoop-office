import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOffice } from '../src/server.mjs';
import { DemoSource, demoPolicy } from '../src/fixtures.mjs';

const routes = [
  { project_id: 'demo/observatorio', issue: 11, team_id: 'marea' },
  { project_id: 'demo/observatorio', issue: 12, team_id: 'aurora' },
  { project_id: 'demo/archivo', issue: 31, team_id: 'aurora' }
];
async function start(t, options = {}) {
  const app = createOffice({ mode: 'live', policyLoader: () => demoPolicy,
    source: new DemoSource(), taskRoutesLoader: () => routes, ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const request = (path, cookie, data) => fetch(origin + path, {
    headers: { ...(cookie ? { cookie } : {}), ...(data === undefined ? {} : { origin, 'content-type': 'application/json' }) },
    ...(data === undefined ? {} : { method: 'POST', body: JSON.stringify(data) })
  });
  const login = async team => {
    const response = await request('/api/session', null, { key: `demo-${team}` });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  };
  return { request, login };
}
function deferredSource() {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const demo = new DemoSource();
  return { entered, release, source: { read: async project => { enter(); await gate; return demo.read(project); } } };
}

test('cola HTTP: identidad autenticada, rutas aisladas y metadatos de GitHub', async t => {
  const calls = []; const demo = new DemoSource();
  const { request, login } = await start(t, { source: { read: async project => { calls.push(project.repo); return demo.read(project); } } });
  assert.equal((await request('/api/queue')).status, 401);
  const marea = await login('marea');
  assert.equal((await request('/api/queue?team_id=aurora', marea)).status, 400);
  assert.equal((await request('/api/queue', marea, { team_id: 'aurora' })).status, 404);
  const response = await request('/api/queue', marea);
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  const data = await response.json();
  assert.equal(data.memberId, 'marea'); assert.deepEqual(data.queue.map(task => task.issue), [11]);
  assert.equal(data.queue[0].stage, 'requested'); assert.equal(data.queue[0].pull_request, null);
  assert.deepEqual(calls, ['demo/observatorio']);
  assert.doesNotMatch(JSON.stringify(data), /demo\/archivo|keyHash|demo-marea/);
  calls.length = 0;
  const other = await (await request('/api/queue', await login('aurora'))).json();
  assert.deepEqual(other.queue.map(task => task.issue), [12, 31]);
  assert.equal(other.queue[1].stage, 'reviewed'); assert.equal(other.queue[1].pull_request.number, 41);
  assert.ok(other.queue[1].evidence.length > 0);
  assert.deepEqual(calls, ['demo/observatorio', 'demo/archivo']);
});

test('sin rutas configuradas no se consulta ningún proyecto', async t => {
  let reads = 0;
  const { request, login } = await start(t, { taskRoutesLoader: undefined, source: { read: async () => { reads++; throw new Error(); } } });
  const response = await request('/api/queue', await login('aurora'));
  assert.equal(response.status, 200); assert.deepEqual((await response.json()).queue, []); assert.equal(reads, 0);
});

test('configuración local explícita y arranque cerrado ante rutas no autorizadas', async t => {
  assert.throws(() => createOffice({ policyLoader: () => demoPolicy, taskRoutesLoader: () => [{ ...routes[2], team_id: 'marea' }] }), { code: 'QUEUE_UNAVAILABLE' });
  assert.throws(() => createOffice({ config: { OFFICE_TASK_ROUTES: '/missing-synthetic-routes.json' } }), { code: 'QUEUE_UNAVAILABLE' });
  const directory = mkdtempSync(join(tmpdir(), 'office-routes-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'routes.json'); writeFileSync(path, JSON.stringify(routes));
  const { request, login } = await start(t, { taskRoutesLoader: undefined, config: { OFFICE_TASK_ROUTES: path } });
  assert.equal((await request('/api/queue', await login('marea'))).status, 200);
  writeFileSync(path, 'PRIVATE_SENTINEL');
  const result = await request('/api/queue', await login('aurora'));
  assert.equal(result.status, 503); assert.doesNotMatch(await result.text(), /PRIVATE_SENTINEL|office-routes-/);
});

for (const change of ['policy', 'routing', 'invalid-routing']) {
  test(`cambio de ${change} durante lectura descarta el resultado`, async t => {
    let policy = structuredClone(demoPolicy); let selected = structuredClone(routes);
    const pending = deferredSource();
    const { request, login } = await start(t, { policyLoader: () => policy, taskRoutesLoader: () => selected, source: pending.source });
    t.after(pending.release);
    const responsePromise = request('/api/queue', await login('marea'));
    await pending.entered;
    if (change === 'policy') policy.projects = [];
    else if (change === 'routing') selected[0].team_id = 'aurora';
    else selected = null;
    pending.release();
    const response = await responsePromise;
    assert.equal(response.status, change === 'policy' ? 401 : change === 'routing' ? 409 : 503);
    assert.doesNotMatch(await response.text(), /observatorio|Compartir|keyHash/);
  });
}

for (const first of ['/api/queue', '/api/snapshot']) {
  test(`cola y snapshot comparten exclusión por sesión desde ${first}`, async t => {
    const pending = deferredSource(); const { request, login } = await start(t, { source: pending.source });
    t.after(pending.release);
    const cookie = await login('marea'); const reading = request(first, cookie);
    await pending.entered;
    assert.equal((await request(first === '/api/queue' ? '/api/snapshot' : '/api/queue', cookie)).status, 429);
    pending.release(); assert.equal((await reading).status, 200);
    assert.equal((await request('/api/queue', cookie)).status, 200);
  });
}

test('cola y snapshot comparten el límite global de cuatro lecturas', async t => {
  let release, enter; let reads = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { enter = resolve; });
  const demo = new DemoSource();
  const { request, login } = await start(t, { source: { read: async project => {
    if (++reads === 4) enter(); await gate; return demo.read(project);
  } } });
  t.after(release);
  const cookies = await Promise.all(Array.from({ length: 5 }, () => login('marea')));
  const pending = cookies.slice(0, 4).map((cookie, i) => request(i % 2 ? '/api/snapshot' : '/api/queue', cookie));
  await entered;
  assert.equal((await request('/api/queue', cookies[4])).status, 429);
  release(); assert.deepEqual((await Promise.all(pending)).map(response => response.status), [200, 200, 200, 200]);
});

test('errores del origen no exponen datos y liberan la reserva', async t => {
  let fail = true; const demo = new DemoSource();
  const { request, login } = await start(t, { source: { read: async project => {
    if (fail) throw new Error('PRIVATE_SENTINEL'); return demo.read(project);
  } } });
  const cookie = await login('marea'); const result = await request('/api/queue', cookie);
  assert.equal(result.status, 500); assert.doesNotMatch(await result.text(), /PRIVATE_SENTINEL/);
  fail = false; assert.equal((await request('/api/queue', cookie)).status, 200);
});
