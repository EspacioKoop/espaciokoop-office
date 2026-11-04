import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOffice } from '../src/server.mjs';
import { demoPolicy, DemoSource } from '../src/fixtures.mjs';

// Tráfico local y sintético: lectores HTTP deliberadamente pausados,
// sin sockets externos, usuarios reales ni datos operativos.
test('SSE: lectores pausados no bloquean 30 cambios, límites y revocación por equipo', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'office-sse-slow-fixture-'));
  const app = createOffice({
    mode: 'live',
    policyLoader: () => demoPolicy,
    source: new DemoSource(),
    config: { OFFICE_SPACE_PROJECT: 'demo/archivo', OFFICE_SPACE_DIR: directory }
  });
  const controllers = [];
  t.after(async () => {
    controllers.forEach(controller => controller.abort());
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;

  const request = (path, { cookie, data } = {}) => fetch(origin + path, {
    signal: AbortSignal.timeout(8000),
    headers: { ...(cookie ? { cookie } : {}),
      ...(data === undefined ? {} : { origin, 'content-type': 'application/json' }) },
    ...(data === undefined ? {} : { method: 'POST', body: JSON.stringify(data) })
  });
  const login = async team => {
    const response = await request('/api/session', { data: { key: `demo-${team}` } });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  };
  const openPaused = async cookie => {
    const controller = new AbortController();
    controllers.push(controller);
    const response = await fetch(origin + '/api/events', {
      headers: { cookie }, signal: controller.signal
    });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    const first = await reader.read();
    assert.match(new TextDecoder().decode(first.value), /: Office:/);
    // No consumimos posteriores eventos durante la ráfaga.
    return { controller, reader, initial: new TextDecoder().decode(first.value) };
  };
  const readThroughClose = async stream => {
    const guard = setTimeout(() => stream.controller.abort(), 5000);
    let text = stream.initial;
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await stream.reader.read();
        if (done) break;
        text += decoder.decode(value);
      }
      return text;
    } finally { clearTimeout(guard); }
  };

  const ownerCookie = await login('aurora');
  const guestCookie = await login('marea');
  const ownerStreams = [
    await openPaused(ownerCookie), await openPaused(ownerCookie), await openPaused(ownerCookie)
  ];
  const guestStream = await openPaused(guestCookie);
  const fourth = await request('/api/events', { cookie: ownerCookie });
  assert.equal(fourth.status, 429);
  assert.equal((await fourth.json()).error, 'RATE_LIMIT');

  const command = async data => {
    const response = await request('/api/space/command', { cookie: ownerCookie, data });
    assert.equal(response.status, 200, `Comando ${data.type} rev ${data.expected_revision}`);
    const result = await response.json();
    assert.equal(result.duplicate, false);
  };
  await command({
    type: 'room.create', idempotency_key: 'slow-create', expected_revision: 0,
    room_id: 'stress-room', label: 'Sala de ensayo', scope: 'common',
    width: 10, height: 10
  });
  for (let revision = 1; revision <= 29; revision++) {
    await command({
      type: 'room.update', idempotency_key: `slow-update-${revision}`,
      expected_revision: revision, room_id: 'stress-room',
      label: `Sala de ensayo ${revision}`, width: 10, height: 10
    });
  }
  // El servicio sigue sirviendo HTTP pese a los consumidores sin leer.
  assert.equal((await request('/api/space', { cookie: ownerCookie })).status, 200);
  assert.equal((await request('/api/snapshot', { cookie: guestCookie })).status, 200);
  assert.equal((await request('/api/space', { cookie: guestCookie })).status, 403);

  const logoutGuest = await request('/api/logout', { cookie: guestCookie, data: {} });
  assert.equal(logoutGuest.status, 200);
  const guestText = await readThroughClose(guestStream);
  assert.match(guestText, /event: revoke\ndata: \{\}/);
  assert.doesNotMatch(guestText, /event: space|stress-room|archivo|keyHash/);

  const logoutOwner = await request('/api/logout', { cookie: ownerCookie, data: {} });
  assert.equal(logoutOwner.status, 200);
  for (const stream of ownerStreams) {
    const text = await readThroughClose(stream);
    assert.match(text, /event: space\ndata: \{\}/);
    assert.match(text, /event: revoke\ndata: \{\}/);
    assert.doesNotMatch(text, /stress-room|Sala de ensayo|demo-aurora|keyHash/);
  }
  assert.equal((await request('/api/events', { cookie: ownerCookie })).status, 401);

  const nextCookie = await login('aurora');
  assert.notEqual(nextCookie, ownerCookie);
  const newStream = await openPaused(nextCookie);
  assert.match(newStream.initial, /: Office:/);
  assert.doesNotMatch(newStream.initial, /event: space|event: revoke/);
});

// No garantiza saturación del buffer TCP: para eso hace falta un ensayo de
// presión de transporte con límites explícitos y entorno autorizado.
