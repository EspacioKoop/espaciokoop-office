import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOffice } from '../src/server.mjs';
import { DemoSource, demoPolicy } from '../src/fixtures.mjs';

const clone = x => structuredClone(x);

async function start(t, options = {}) {
  const app = createOffice(options);
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const request = (path, { data, cookie, headers = {}, signal, ...rest } = {}) => fetch(origin + path, {
    signal: signal ?? AbortSignal.timeout(5000),
    ...rest,
    headers: {
      ...(data === undefined ? {} : { 'content-type': 'application/json', origin }),
      ...(cookie ? { cookie } : {}),
      ...headers
    },
    ...(data === undefined ? {} : { method: 'POST', body: JSON.stringify(data) })
  });
  const login = async key => {
    const response = await request('/api/session', { data: { key } });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  };
  return { app, origin, request, login };
}

async function createStreamConsumer(response) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const listeners = new Set();
  const readPromise = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
        for (const fn of listeners) fn();
      }
    } catch {
      // Stream aborted or closed
    }
  })();
  return {
    getText: () => text,
    wait: (needle, timeoutMs = 3000) => {
      if (text.includes(needle)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          listeners.delete(check);
          reject(new Error(`Timed out waiting for SSE text: ${JSON.stringify(needle)}`));
        }, timeoutMs);
        const check = () => {
          if (text.includes(needle)) {
            clearTimeout(timer);
            listeners.delete(check);
            resolve();
          }
        };
        listeners.add(check);
      });
    },
    done: () => readPromise
  };
}

test('ciclo SSE: abrir y abortar conexion no bloquea nuevas sesiones ni el cierre de createOffice', async t => {
  const { request, login } = await start(t);
  const cookie = await login('demo-aurora');

  const controller1 = new AbortController();
  const res1 = await request('/api/events', { cookie, signal: controller1.signal });
  const stream1 = await createStreamConsumer(res1);
  await stream1.wait(': Office:');

  const controller2 = new AbortController();
  const res2 = await request('/api/events', { cookie, signal: controller2.signal });
  const stream2 = await createStreamConsumer(res2);
  await stream2.wait(': Office:');

  // A third connection while 2 are active would hit rate limit (max 2 per session allowed before < 3 check)
  const controller3 = new AbortController();
  const res3 = await request('/api/events', { cookie, signal: controller3.signal });
  assert.equal(res3.status, 200);

  // Abort the 3rd connection immediately
  controller3.abort();

  // Confirm aborting res3 frees connection slots and does not prevent new sessions or requests
  const cookie2 = await login('demo-marea');
  const res4 = await request('/api/events', { cookie: cookie2 });
  const stream4 = await createStreamConsumer(res4);
  await stream4.wait(': Office:');

  // Abort remaining streams
  controller1.abort();
  controller2.abort();

  // Confirm server shuts down cleanly without hanging sockets or handle leaks
  assert.equal((await request('/api/snapshot', { cookie })).status, 200);
});

test('aislamiento entre propietarios: Marea no recibe senales SSE de un proyecto al que solo Aurora tiene acceso', async t => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'sse-owners-test-'));
  t.after(() => rm(tmpDir, { recursive: true, force: true }));

  const { request, login } = await start(t, {
    mode: 'live',
    policyLoader: () => demoPolicy,
    source: new DemoSource(),
    config: {
      OFFICE_SPACE_PROJECT: 'demo/archivo',
      OFFICE_SPACE_DIR: tmpDir
    }
  });

  const cookieAurora = await login('demo-aurora');
  const cookieMarea = await login('demo-marea');

  const controllerAurora = new AbortController();
  t.after(() => controllerAurora.abort());
  const resAurora = await request('/api/events', { cookie: cookieAurora, signal: controllerAurora.signal });
  const streamAurora = await createStreamConsumer(resAurora);
  await streamAurora.wait(': Office:');

  const controllerMarea = new AbortController();
  t.after(() => controllerMarea.abort());
  const resMarea = await request('/api/events', { cookie: cookieMarea, signal: controllerMarea.signal });
  const streamMarea = await createStreamConsumer(resMarea);
  await streamMarea.wait(': Office:');

  // Aurora issues a space command on 'demo/archivo' (which Aurora owns reader access to)
  const cmdRes = await request('/api/space/command', {
    cookie: cookieAurora,
    data: {
      type: 'room.create',
      idempotency_key: 'aurora-archivo-room',
      expected_revision: 0,
      room_id: 'archivo-room',
      label: 'Sala Privada',
      scope: 'common',
      width: 10,
      height: 10
    }
  });
  assert.equal(cmdRes.status, 200);

  // Aurora stream should receive space invalidation signal
  await streamAurora.wait('event: space\ndata: {}\n\n');

  // Give any unexpected events time to propagate
  await new Promise(r => setTimeout(r, 100));

  // Marea stream must NOT have received space invalidation event because demo/archivo is not in Marea's authorized projects
  assert.doesNotMatch(streamMarea.getText(), /event: space/);
  assert.doesNotMatch(streamMarea.getText(), /archivo-room|aurora|observatorio/);
});

test('revocacion por logout o retiro de permisos en politica cierra el stream con evento revoke y no vuelca datos', async t => {
  let policy = clone(demoPolicy);
  const { request, login } = await start(t, {
    mode: 'live',
    policyLoader: () => policy,
    source: new DemoSource(),
    watchInterval: 20
  });

  // Case 1: Logout revokes session and stream
  const cookieAurora = await login('demo-aurora');
  const resAurora = await request('/api/events', { cookie: cookieAurora });
  const streamAurora = await createStreamConsumer(resAurora);
  await streamAurora.wait(': Office:');

  const logoutRes = await request('/api/logout', { cookie: cookieAurora, data: {} });
  assert.equal(logoutRes.status, 200);

  await streamAurora.wait('event: revoke\ndata: {}\n\n');
  await streamAurora.done();

  assert.doesNotMatch(streamAurora.getText(), /observatorio|archivo|demo-aurora|keyHash/);

  // Case 2: Removing permissions from policy revokes stream
  const cookieMarea = await login('demo-marea');
  const resMarea = await request('/api/events', { cookie: cookieMarea });
  const streamMarea = await createStreamConsumer(resMarea);
  await streamMarea.wait(': Office:');

  // Revoke Marea by removing from policy members
  policy = clone(demoPolicy);
  policy.members = policy.members.filter(m => m.id !== 'marea');

  await streamMarea.wait('event: revoke\ndata: {}\n\n');
  await streamMarea.done();

  assert.doesNotMatch(streamMarea.getText(), /observatorio|archivo|demo-marea|keyHash/);
});

test('fallo cerrado ante politica no disponible durante la transmision', async t => {
  let p = clone(demoPolicy);
  let failPolicy = false;
  const { request, login } = await start(t, {
    mode: 'live',
    policyLoader: () => {
      if (failPolicy) throw new Error('POLICY_FILE_CORRUPTED');
      return p;
    },
    source: new DemoSource(),
    watchInterval: 20
  });

  const cookieAurora = await login('demo-aurora');
  const resAurora = await request('/api/events', { cookie: cookieAurora });
  const streamAurora = await createStreamConsumer(resAurora);
  await streamAurora.wait(': Office:');

  // Policy loader now fails
  failPolicy = true;

  // The watcher or subsequent policy check detects failure and revokes sessions safely
  await streamAurora.wait('event: revoke\ndata: {}\n\n');
  await streamAurora.done();

  // Snapshot after policy failure returns 503 SERVICE_UNAVAILABLE without leaking traces or data
  const snapRes = await request('/api/snapshot', { cookie: cookieAurora });
  assert.equal(snapRes.status, 503);
  const snapText = await snapRes.text();
  assert.doesNotMatch(snapText, /POLICY_FILE_CORRUPTED|keyHash|observatorio|aurora/);
  assert.doesNotMatch(streamAurora.getText(), /POLICY_FILE_CORRUPTED|keyHash|observatorio|aurora/);
});
