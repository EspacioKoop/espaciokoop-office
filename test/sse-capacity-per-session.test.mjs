import test from 'node:test';
import assert from 'node:assert/strict';
import { createOffice } from '../src/server.mjs';
import { DemoSource, demoPolicy } from '../src/fixtures.mjs';

async function start(t, options = {}) {
  const app = createOffice({ mode: 'live', policyLoader: () => demoPolicy, source: new DemoSource(), ...options });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const request = (path, { data, cookie, headers = {}, ...rest } = {}) =>
    fetch(origin + path, {
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

async function openStream(origin, cookie, t) {
  const controller = new AbortController();
  t.after(() => controller.abort());
  const res = await fetch(`${origin}/api/events`, {
    headers: { cookie },
    signal: controller.signal
  });
  if (res.status !== 200) {
    return { status: res.status, res, controller };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const { value } = await reader.read();
  const initialChunk = value ? decoder.decode(value) : '';
  const abort = async () => {
    controller.abort();
    try { await reader.cancel(); } catch {}
  };
  return { status: 200, res, reader, initialChunk, controller, abort };
}

test('límite de cupo SSE por sesión: 3 permitidas, la cuarta responde 429 sin degradar las existentes', async t => {
  const { origin, login, request } = await start(t);
  const cookie = await login('demo-aurora');

  const s1 = await openStream(origin, cookie, t);
  const s2 = await openStream(origin, cookie, t);
  const s3 = await openStream(origin, cookie, t);

  assert.equal(s1.status, 200);
  assert.equal(s2.status, 200);
  assert.equal(s3.status, 200);
  assert.match(s1.initialChunk, /: Office:/);
  assert.match(s2.initialChunk, /: Office:/);
  assert.match(s3.initialChunk, /: Office:/);

  // La cuarta conexión del mismo propietario/sesión debe responder 429 RATE_LIMIT
  const res4 = await request('/api/events', { cookie });
  assert.equal(res4.status, 429);
  const body4 = await res4.json();
  assert.equal(body4.error, 'RATE_LIMIT');

  // Verificar que las tres primeras conexiones siguen activas
  assert.equal((await request('/api/snapshot', { cookie })).status, 200);
});

test('aislamiento de cupos entre propietarios: demo-marea y demo-aurora no comparten el límite SSE ni heredan datos', async t => {
  const { origin, login } = await start(t);
  const auroraCookie = await login('demo-aurora');
  const mareaCookie = await login('demo-marea');

  // demo-aurora agota sus 3 cupos SSE
  const a1 = await openStream(origin, auroraCookie, t);
  const a2 = await openStream(origin, auroraCookie, t);
  const a3 = await openStream(origin, auroraCookie, t);
  assert.equal(a1.status, 200);
  assert.equal(a2.status, 200);
  assert.equal(a3.status, 200);

  // demo-marea abre sus propias conexiones SSE sin verse afectada por el límite de aurora
  const m1 = await openStream(origin, mareaCookie, t);
  const m2 = await openStream(origin, mareaCookie, t);
  assert.equal(m1.status, 200);
  assert.equal(m2.status, 200);

  // Los mensajes SSE iniciales no deben contener claves sintéticas, datos privados ni información del otro propietario
  for (const stream of [a1, a2, a3, m1, m2]) {
    assert.doesNotMatch(stream.initialChunk, /demo-aurora|demo-marea|keyHash|observatorio/);
  }
});

test('liberación de cupo tras abortar SSE: cerrar una conexión reabre el cupo a 200 sin degradar otra sesión', async t => {
  const { origin, login, request } = await start(t);
  const auroraCookie = await login('demo-aurora');
  const mareaCookie = await login('demo-marea');

  // Marea abre una conexión SSE activa
  const m1 = await openStream(origin, mareaCookie, t);
  assert.equal(m1.status, 200);

  // Aurora abre 3 conexiones SSE agotando su cupo
  const a1 = await openStream(origin, auroraCookie, t);
  const a2 = await openStream(origin, auroraCookie, t);
  const a3 = await openStream(origin, auroraCookie, t);
  assert.equal(a1.status, 200);
  assert.equal(a2.status, 200);
  assert.equal(a3.status, 200);

  // Intento 4 de aurora falla con 429
  assert.equal((await request('/api/events', { cookie: auroraCookie })).status, 429);

  // Aurora aborta una de sus conexiones (a2)
  await a2.abort();

  // Esperar a que el servidor libere la conexión sin sleeps fijos
  let s4;
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    s4 = await openStream(origin, auroraCookie, t);
    if (s4.status === 200) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(s4.status, 200);
  assert.match(s4.initialChunk, /: Office:/);

  // La sesión de marea sigue intacta
  assert.equal((await request('/api/snapshot', { cookie: mareaCookie })).status, 200);
});

test('clientes anónimos y cookies revocadas/inválidas no ocupan cupos ni reciben SSE', async t => {
  const { origin, login, request } = await start(t);
  const cookie = await login('demo-aurora');

  // Petición anónima (sin cookie) a /api/events responde 401
  const anon = await request('/api/events');
  assert.equal(anon.status, 401);

  // Cookie revocada / inválida responde 401
  const invalid = await request('/api/events', { cookie: 'office=0000000000000000000000000000000000000000000000000000000000000000' });
  assert.equal(invalid.status, 401);

  // Comprobar que los 3 cupos de la sesión válida de aurora siguen disponibles sin verse afectados
  const a1 = await openStream(origin, cookie, t);
  const a2 = await openStream(origin, cookie, t);
  const a3 = await openStream(origin, cookie, t);
  assert.equal(a1.status, 200);
  assert.equal(a2.status, 200);
  assert.equal(a3.status, 200);

  // Tras logout, la sesión queda revocada y la conexión SSE es denegada
  await request('/api/logout', { cookie, data: {} });
  assert.equal((await request('/api/events', { cookie })).status, 401);
});
