import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOffice } from '../src/server.mjs';
import { DemoSource, demoPolicy } from '../src/fixtures.mjs';

const clone = x => structuredClone(x);

async function start(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'sse-rotation-space-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const app = createOffice({
    mode: 'live',
    policyLoader: () => demoPolicy,
    source: new DemoSource(),
    watchInterval: 20,
    config: { OFFICE_SPACE_PROJECT: 'demo/observatorio', OFFICE_SPACE_DIR: directory },
    ...options
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const request = (path, { data, cookie, headers = {}, ...rest } = {}) => fetch(origin + path, {
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

test('rotación de sesión SSE tras logout: revoca stream antiguo y otorga cupos limpios en sesión nueva', async t => {
  const { request, login } = await start(t);

  // 1. Iniciar sesión de Aurora y obtener cookie1
  const cookie1 = await login('demo-aurora');

  // Abrir stream SSE en vuelo
  const controller1 = new AbortController();
  t.after(() => controller1.abort());
  const response1 = await request('/api/events', { cookie: cookie1, signal: controller1.signal });
  assert.equal(response1.status, 200);

  const reader1 = response1.body.getReader();
  const decoder = new TextDecoder();

  // Leer comentario inicial SSE
  const initialChunk = await reader1.read();
  assert.match(decoder.decode(initialChunk.value), /Office: invalidación y revocación/);

  // 2. Hacer logout con cookie1
  const logoutRes = await request('/api/logout', { cookie: cookie1, data: {} });
  assert.equal(logoutRes.status, 200);

  // Comprobar evento revoke y cierre del stream antiguo
  let stream1Text = '';
  while (true) {
    const { done, value } = await reader1.read();
    if (done) break;
    stream1Text += decoder.decode(value);
  }
  assert.match(stream1Text, /event: revoke/);

  // Comprobar respuesta 401 para cookie1 antigua
  const snapshotOld = await request('/api/snapshot', { cookie: cookie1 });
  assert.equal(snapshotOld.status, 401);

  // 3. Volver a iniciar sesión del mismo miembro y abrir stream nuevo funcional con cookie2
  const cookie2 = await login('demo-aurora');
  assert.notEqual(cookie1, cookie2);

  const controller2 = new AbortController();
  t.after(() => controller2.abort());
  const response2 = await request('/api/events', { cookie: cookie2, signal: controller2.signal });
  assert.equal(response2.status, 200);

  const reader2 = response2.body.getReader();
  const chunk2 = await reader2.read();
  assert.match(decoder.decode(chunk2.value), /Office: invalidación y revocación/);

  // Verificar que la nueva sesión no hereda cupos ocupados de la sesión anterior
  const extraCtrls = [new AbortController(), new AbortController()];
  for (const ctrl of extraCtrls) t.after(() => ctrl.abort());

  const streamB = await request('/api/events', { cookie: cookie2, signal: extraCtrls[0].signal });
  const streamC = await request('/api/events', { cookie: cookie2, signal: extraCtrls[1].signal });
  assert.equal(streamB.status, 200);
  assert.equal(streamC.status, 200);

  const ctrlOver = new AbortController();
  t.after(() => ctrlOver.abort());
  const streamOver = await request('/api/events', { cookie: cookie2, signal: ctrlOver.signal });
  assert.equal(streamOver.status, 429);

  controller2.abort();
  for (const ctrl of extraCtrls) ctrl.abort();
});

test('sesiones paralelas del mismo miembro: revocar una mediante /api/logout aisla la primera y mantiene la segunda', async t => {
  const { request, login } = await start(t);

  const cookie1 = await login('demo-aurora');
  const cookie2 = await login('demo-aurora');
  assert.notEqual(cookie1, cookie2);

  const ctrl1 = new AbortController();
  const ctrl2 = new AbortController();
  t.after(() => { ctrl1.abort(); ctrl2.abort(); });

  const res1 = await request('/api/events', { cookie: cookie1, signal: ctrl1.signal });
  const res2 = await request('/api/events', { cookie: cookie2, signal: ctrl2.signal });
  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);

  const reader1 = res1.body.getReader();
  const reader2 = res2.body.getReader();
  const decoder = new TextDecoder();

  await reader1.read();
  await reader2.read();

  // Revocar solo la primera sesión con /api/logout
  const logoutRes = await request('/api/logout', { cookie: cookie1, data: {} });
  assert.equal(logoutRes.status, 200);

  let text1 = '';
  while (true) {
    const { done, value } = await reader1.read();
    if (done) break;
    text1 += decoder.decode(value);
  }
  assert.match(text1, /event: revoke/);

  // La cookie1 responde 401
  assert.equal((await request('/api/snapshot', { cookie: cookie1 })).status, 401);

  // La cookie2 sigue autenticada
  const snap2 = await request('/api/snapshot', { cookie: cookie2 });
  assert.equal(snap2.status, 200);

  // La segunda sesión recibe señales permitidas (p. ej. señal de espacio tras comando)
  const createRoomCmd = {
    type: 'room.create',
    idempotency_key: 'room-1',
    expected_revision: 0,
    room_id: 'lobby',
    label: 'Lobby',
    scope: 'common',
    width: 10,
    height: 10
  };
  const cmdRes = await request('/api/space/command', {
    cookie: cookie2,
    data: createRoomCmd
  });
  assert.equal(cmdRes.status, 200);

  const chunk2 = await reader2.read();
  assert.match(decoder.decode(chunk2.value), /event: space/);

  ctrl2.abort();
});

test('transición con política inválida/ausente entre logout y nueva autenticación: falla cerrado sin fugas', async t => {
  let policy = clone(demoPolicy);
  const { request, login } = await start(t, { policyLoader: () => policy });

  const cookie1 = await login('demo-aurora');

  const ctrl1 = new AbortController();
  t.after(() => ctrl1.abort());
  const res1 = await request('/api/events', { cookie: cookie1, signal: ctrl1.signal });
  assert.equal(res1.status, 200);

  assert.equal((await request('/api/logout', { cookie: cookie1, data: {} })).status, 200);

  // Alterar política a inválida entre logout y reautenticación
  policy = null;

  // Acceso con cookie1 revocada con política rota -> falla cerrado (503) sin fugas de datos
  const snapRes = await request('/api/snapshot', { cookie: cookie1 });
  assert.equal(snapRes.status, 503);
  const snapText = await snapRes.text();
  assert.doesNotMatch(snapText, /observatorio|keyHash|demo-aurora/);

  // Intento de nueva autenticación con política rota -> 503
  const loginFail = await request('/api/session', { data: { key: 'demo-aurora' } });
  assert.equal(loginFail.status, 503);
  const loginFailText = await loginFail.text();
  assert.doesNotMatch(loginFailText, /observatorio|keyHash|demo-aurora/);

  // Intento de SSE sin autenticación con política rota -> 503
  const eventsFail = await request('/api/events');
  assert.equal(eventsFail.status, 503);
  const eventsFailText = await eventsFail.text();
  assert.doesNotMatch(eventsFailText, /event:|data:|keyHash/);

  // Restaurar política
  policy = clone(demoPolicy);

  // Reautenticación tras restaurar política funciona normalmente
  const cookie2 = await login('demo-aurora');
  assert.notEqual(cookie1, cookie2);

  const snapOk = await request('/api/snapshot', { cookie: cookie2 });
  assert.equal(snapOk.status, 200);
});
