import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createOffice } from '../src/server.mjs';
import { DemoSource, demoPolicy } from '../src/fixtures.mjs';

const clone = x => structuredClone(x);

// --- Helpers para servidor real integrado ---
async function startServer(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'sse-revocation-lifecycle-'));
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
      // Stream finalizado o abortado
    }
  })();
  return {
    getText: () => text,
    wait: (needle, timeoutMs = 3000) => {
      if (text.includes(needle)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          listeners.delete(check);
          reject(new Error(`Tiempo agotado esperando SSE: ${JSON.stringify(needle)}`));
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

// --- Helpers para cliente UI en VM ---
class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.value = '';
    this.hidden = false;
    this.open = false;
    this.text = '';
  }
  set textContent(value) { this.text = String(value); this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(' '); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.text = ''; this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  showModal() { this.open = true; }
  close() { if (this.open) { this.open = false; this.listeners.close?.(); } }
}

const appSource = readFileSync(new URL('../web/app.mjs', import.meta.url), 'utf8');

function deferred() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

async function createClientContext() {
  let time = 1000;
  let nextTimer = 0;
  let transport;
  const timers = new Map();
  const elements = new Map();
  const calls = [];
  const streams = [];

  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };

  const document = {
    hidden: false,
    listeners: {},
    getElementById: get,
    createElement: tag => new Element(tag),
    querySelectorAll: () => [],
    addEventListener(name, listener) { this.listeners[name] = listener; }
  };

  const window = {
    listeners: {},
    addEventListener(name, listener) { this.listeners[name] = listener; }
  };

  const snapshot = () => ({
    mode: 'live', memberId: 'marea', generatedAt: time, expiresAt: time + 12000,
    members: [{ id: 'marea', label: 'Equipo Marea', githubLogin: 'nico-demo' }],
    projects: [{ repo: 'demo/observatorio', label: 'Observatorio', tasks: [] }], demo: null
  });

  const queue = () => ({
    memberId: 'marea', generatedAt: time, expiresAt: time + 12000,
    queue: []
  });

  const presence = () => ({
    projectId: 'demo/observatorio', generatedAt: time, expiresAt: time + 1000,
    agents: [
      { id: 'marea/worker', label: 'Worker Marea', ownerId: 'marea', status: 'online', seenAt: time },
      { id: 'aurora/worker', label: 'Worker Aurora', ownerId: 'aurora', status: 'stale', seenAt: time - 6000 }
    ]
  });

  const response = (data, status = 200) => ({ ok: status < 400, json: async () => data });

  class Clock extends Date { static now() { return time; } }

  class Events {
    constructor(url) {
      this.url = url;
      this.listeners = {};
      this.closed = false;
      streams.push(this);
    }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    close() { this.closed = true; }
    emit(name, payload = {}) {
      if (this.closed) return;
      this.listeners[name]?.({ data: typeof payload === 'string' ? payload : JSON.stringify(payload) });
    }
  }

  transport = path => response({
    '/api/info': { mode: 'live', version: '1.0.0-rc.1' },
    '/api/snapshot': snapshot(),
    '/api/queue': queue(),
    '/api/presence': presence()
  }[path]);

  const api = await runInNewContext(`(async () => { ${appSource}\nreturn { refresh, clearView }; })()`, {
    document, window, Date: Clock, AbortSignal: { timeout: () => undefined }, EventSource: Events,
    fetch: async (path, options) => { calls.push({ path, options }); return transport(path, options); },
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id)
  });

  calls.length = 0;

  return {
    ...api, get, document, window, calls, streams, timers, snapshot, queue, presence, response,
    setTime: value => { time = value; },
    setTransport: fn => { transport = fn; }
  };
}

// --- PRUEBAS DE CICLO DE VIDA DE REVOCACIÓN SSE, LOGOUT Y PRUEBAS OFFLINE ---

test('cierre real de EventSource y limpieza de cachés tras logout explícito', async () => {
  const ui = await createClientContext();
  await ui.refresh();

  assert.equal(ui.streams.length, 1);
  const stream = ui.streams[0];
  assert.equal(stream.closed, false);
  assert.match(ui.get('office-view').textContent, /PRESENCIA AUTENTICADA/);

  // Simular clic en logout
  ui.setTransport(path => {
    if (path === '/api/logout') return ui.response({});
    return ui.response({ error: 'AUTH' }, 401);
  });

  await ui.get('logout').listeners.click();

  // Verificar que EventSource se ha cerrado explícitamente y que no queda estado previo ni presencia fantasma
  assert.equal(stream.closed, true);
  assert.equal(ui.get('office-view').textContent, '');
  assert.equal(ui.get('board').textContent, '');
  assert.equal(ui.get('account-name').textContent, 'Sin sesión');
});

test('revocación mid-SSE a mitad de transmisión cierra el stream con evento revoke e invalida la cookie', async t => {
  const { request, login } = await startServer(t);

  const cookie = await login('demo-aurora');

  // Conexión SSE 1 activa
  const ctrl = new AbortController();
  t.after(() => ctrl.abort());
  const res = await request('/api/events', { cookie, signal: ctrl.signal });
  const stream = await createStreamConsumer(res);
  await stream.wait(': Office:');

  // Disparar un comando de espacio a mitad del stream
  await request('/api/space/command', {
    cookie,
    data: {
      type: 'room.create',
      idempotency_key: 'rev-room-1',
      expected_revision: 0,
      room_id: 'rev-room',
      label: 'Sala Revocacion',
      scope: 'common',
      width: 5,
      height: 5
    }
  });
  await stream.wait('event: space');

  // Logout a mitad de la sesión SSE activa
  const logoutRes = await request('/api/logout', { cookie, data: {} });
  assert.equal(logoutRes.status, 200);

  // El stream en vivo debe recibir inmediatamente 'event: revoke' y cerrarse sin volcar secretos ni datos
  await stream.wait('event: revoke');
  await stream.done();

  // Consultas posteriores con la cookie revocada devuelven 401
  const snapRes = await request('/api/snapshot', { cookie });
  assert.equal(snapRes.status, 401);
});

test('pruebas offline: pérdida de conexión cierra EventSource, borra caché y previene presencia fantasma', async () => {
  const ui = await createClientContext();
  await ui.refresh();

  assert.equal(ui.streams.length, 1);
  const stream1 = ui.streams[0];
  assert.equal(stream1.closed, false);
  assert.match(ui.get('office-view').textContent, /PRESENCIA AUTENTICADA.*Worker Marea/);

  // Simular evento window 'offline'
  ui.window.listeners.offline?.();

  // El EventSource activo se cierra inmediatamente y la UI limpia todas las vistas
  assert.equal(stream1.closed, true);
  assert.equal(ui.get('office-view').textContent, '');
  assert.equal(ui.get('board').textContent, '');
  assert.equal(ui.get('account-name').textContent, 'Sin sesión');
  assert.match(ui.get('notice').textContent, /Sin conexión/);

  // Intentos de emisión de eventos en el stream antiguo durante estado offline se ignoran
  ui.calls.length = 0;
  stream1.emit('space');
  await new Promise(r => setTimeout(r, 10));

  assert.equal(ui.calls.length, 0);
  assert.equal(ui.get('office-view').textContent, '');
  assert.equal(ui.get('account-name').textContent, 'Sin sesión');
});

test('respuestas demoradas de /api/presence o snapshot durante offline/revocación son descartadas sin restaurar estado ni presencia fantasma', async () => {
  const ui = await createClientContext();
  await ui.refresh();

  const presenceGate = deferred();
  const presenceEntered = deferred();

  // Configurar transporte donde /api/presence se queda en espera
  ui.setTransport(path => {
    if (path === '/api/snapshot') return ui.response(ui.snapshot());
    if (path === '/api/queue') return ui.response(ui.queue());
    if (path === '/api/presence') {
      presenceEntered.release();
      return presenceGate.promise;
    }
    return ui.response({});
  });

  const pendingRefresh = ui.refresh();
  await presenceEntered.promise;

  // Mientras la llamada a presencia está pendiente en red, ocurre evento offline / revocación
  ui.window.listeners.offline?.();

  assert.equal(ui.get('office-view').textContent, '');
  assert.equal(ui.get('account-name').textContent, 'Sin sesión');

  // Ahora la llamada demorada de red /api/presence finalmente se resuelve con datos de presencia antiguos
  presenceGate.release(ui.response(ui.presence()));
  await pendingRefresh;

  // Verificar que la respuesta tardía no restaura los datos, vistas ni presencia fantasma
  assert.equal(ui.get('office-view').textContent, '');
  assert.equal(ui.get('board').textContent, '');
  assert.equal(ui.get('account-name').textContent, 'Sin sesión');
  assert.match(ui.get('notice').textContent, /Sin conexión/);
});

test('no visualización de presencia fantasma tras cambio de permisos o política en caliente mid-stream', async t => {
  let policy = clone(demoPolicy);
  const { request, login } = await startServer(t, {
    mode: 'live',
    policyLoader: () => policy,
    source: new DemoSource(),
    watchInterval: 20
  });

  const cookieMarea = await login('demo-marea');

  const ctrl = new AbortController();
  t.after(() => ctrl.abort());
  const res = await request('/api/events', { cookie: cookieMarea, signal: ctrl.signal });
  const stream = await createStreamConsumer(res);
  await stream.wait(': Office:');

  // Modificar la política en caliente para revocar a Marea mid-stream
  policy = clone(demoPolicy);
  policy.members = policy.members.filter(m => m.id !== 'marea');

  // El stream activo recibe 'event: revoke' y se destruye sin fuga de estado
  await stream.wait('event: revoke');
  await stream.done();

  // Solicitud posterior con la cookie revocada por watcher de política responde 503 o 401 fail-closed sin fugas
  const snapRes = await request('/api/snapshot', { cookie: cookieMarea });
  assert.ok([401, 503].includes(snapRes.status));
});
