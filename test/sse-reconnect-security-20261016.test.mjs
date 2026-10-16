import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { createOffice } from '../src/server.mjs';
import { DemoSource, demoPolicy } from '../src/fixtures.mjs';

// --- Helper para servidor SSE ---
async function startServer(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'sse-reconnect-space-'));
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

// --- Helper para cliente UI fake ---
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

  const task = {
    id: 'demo/observatorio#11', project_id: 'demo/observatorio', team_id: 'marea', issue: 11,
    title: 'Cola de prueba', stage: 'delivered', acceptance: 'confirmed',
    url: 'https://github.com/demo/observatorio/issues/11', assignee: 'nico-demo',
    pull_request: { number: 21, url: 'https://github.com/demo/observatorio/pull/21', sha: 'a'.repeat(40), ci: 'SUCCESS', reviewer: null },
    reasons: [], evidence: [{ kind: 'delivered', label: 'Entrega comprobable', url: 'https://github.com/demo/observatorio/pull/21' }]
  };

  const queue = () => ({
    memberId: 'marea', generatedAt: time, expiresAt: time + 12000,
    queue: [structuredClone(task)]
  });

  const response = (data, status = 200) => ({ ok: status < 400, json: async () => data });
  transport = path => path === '/api/info' ? response({ mode: 'live' }) : response({ error: 'AUTH' }, 401);

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

  const api = await runInNewContext(`(async () => { ${appSource}\nreturn { refresh, clearView }; })()`, {
    document, window, Date: Clock, AbortSignal: { timeout: () => undefined }, EventSource: Events,
    fetch: async (path, options) => { calls.push({ path, options }); return transport(path, options); },
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id)
  });

  calls.length = 0;

  return {
    ...api, get, document, window, calls, streams, timers, snapshot, queue, response,
    setTime: value => { time = value; },
    setTransport: fn => { transport = fn; },
    normal: () => { transport = path => response(path === '/api/snapshot' ? snapshot() : queue()); }
  };
}

// --- Pruebas de seguridad SSE ---

test('reconexión SSE tras revocación no reemite eventos antiguos ni contamina el historial', async t => {
  const { request, login } = await startServer(t);

  // 1. Aurora inicia sesión y abre stream SSE 1
  const cookie1 = await login('demo-aurora');
  const ctrl1 = new AbortController();
  t.after(() => ctrl1.abort());
  const res1 = await request('/api/events', { cookie: cookie1, signal: ctrl1.signal });
  const stream1 = await createStreamConsumer(res1);
  await stream1.wait(': Office:');

  // Emitir evento de espacio
  const cmdRes = await request('/api/space/command', {
    cookie: cookie1,
    data: {
      type: 'room.create',
      idempotency_key: 'room-rec-1',
      expected_revision: 0,
      room_id: 'rec-room',
      label: 'Sala Reconexión',
      scope: 'common',
      width: 10,
      height: 10
    }
  });
  assert.equal(cmdRes.status, 200);
  await stream1.wait('event: space');

  // 2. Logout revoca sesión y cierra stream 1 con 'event: revoke'
  const logoutRes = await request('/api/logout', { cookie: cookie1, data: {} });
  assert.equal(logoutRes.status, 200);
  await stream1.wait('event: revoke');

  // 3. Reconexión: Aurora vuelve a iniciar sesión con nueva cookie
  const cookie2 = await login('demo-aurora');
  assert.notEqual(cookie1, cookie2);

  const ctrl2 = new AbortController();
  t.after(() => ctrl2.abort());
  const res2 = await request('/api/events', { cookie: cookie2, signal: ctrl2.signal });
  const stream2 = await createStreamConsumer(res2);
  await stream2.wait(': Office:');

  // Esperar un momento para verificar que no reemite eventos pasados
  await new Promise(r => setTimeout(r, 100));

  // Confirmar que el nuevo stream solo contiene la cabecera limpia inicial y NO ha reemitido 'event: space' ni 'event: revoke' antiguos
  const text2 = stream2.getText();
  assert.doesNotMatch(text2, /event: space/);
  assert.doesNotMatch(text2, /event: revoke/);
  assert.doesNotMatch(text2, /rec-room/);

  // Un nuevo comando de espacio si genera un nuevo evento en stream2 únicamente
  const cmdRes2 = await request('/api/space/command', {
    cookie: cookie2,
    data: {
      type: 'room.create',
      idempotency_key: 'room-rec-2',
      expected_revision: 0,
      room_id: 'rec-room-2',
      label: 'Sala 2',
      scope: 'common',
      width: 10,
      height: 10
    }
  });
  assert.equal(cmdRes2.status, 200);
  await stream2.wait('event: space');
});

test('rotación entre propietarios aislada: reconexión de Marea no hereda eventos, datos ni presencia fantasma de Aurora', async t => {
  const { request, login } = await startServer(t);

  // 1. Aurora inicia sesión y realiza operaciones
  const auroraCookie = await login('demo-aurora');
  const ctrlAurora = new AbortController();
  t.after(() => ctrlAurora.abort());
  const resAurora = await request('/api/events', { cookie: auroraCookie, signal: ctrlAurora.signal });
  const streamAurora = await createStreamConsumer(resAurora);
  await streamAurora.wait(': Office:');

  // Emitir orden de espacio como Aurora
  await request('/api/space/command', {
    cookie: auroraCookie,
    data: {
      type: 'room.create',
      idempotency_key: 'aurora-room-1',
      expected_revision: 0,
      room_id: 'aurora-private',
      label: 'Zona Aurora',
      scope: 'common',
      width: 8,
      height: 8
    }
  });
  await streamAurora.wait('event: space');

  // Aurora cierra sesión
  await request('/api/logout', { cookie: auroraCookie, data: {} });
  await streamAurora.wait('event: revoke');

  // 2. Marea inicia sesión tras la revocación de Aurora
  const mareaCookie = await login('demo-marea');
  const ctrlMarea = new AbortController();
  t.after(() => ctrlMarea.abort());
  const resMarea = await request('/api/events', { cookie: mareaCookie, signal: ctrlMarea.signal });
  const streamMarea = await createStreamConsumer(resMarea);
  await streamMarea.wait(': Office:');

  await new Promise(r => setTimeout(r, 100));

  // Verificar que el stream SSE de Marea está limpio: no contiene menciones a Aurora, salas o eventos previos
  const textMarea = streamMarea.getText();
  assert.doesNotMatch(textMarea, /aurora/);
  assert.doesNotMatch(textMarea, /aurora-private/);
  assert.doesNotMatch(textMarea, /event: space/);
  assert.doesNotMatch(textMarea, /event: revoke/);

  // Marea dispone de sus 3 cupos SSE limpios
  const extraCtrls = [new AbortController(), new AbortController()];
  for (const ctrl of extraCtrls) t.after(() => ctrl.abort());
  const resM2 = await request('/api/events', { cookie: mareaCookie, signal: extraCtrls[0].signal });
  const resM3 = await request('/api/events', { cookie: mareaCookie, signal: extraCtrls[1].signal });
  assert.equal(resM2.status, 200);
  assert.equal(resM3.status, 200);

  // Un 4º intento de Marea devuelve 429
  const resM4 = await request('/api/events', { cookie: mareaCookie });
  assert.equal(resM4.status, 429);
});

test('UI cliente: reconexión offline o evento revoke limpia vista y previene eventos fantasma', async () => {
  const ui = await createClientContext();
  ui.normal();
  await ui.refresh();

  assert.equal(ui.streams.length, 1);
  const initialStream = ui.streams[0];
  assert.equal(initialStream.closed, false);

  // Simular pérdida de conexión offline
  ui.window.listeners.offline?.();

  // Se retira la vista tras evento offline
  assert.equal(ui.get('account-name').textContent, 'Sin sesión');

  // Disparar evento en el stream antiguo durante offline no reanima vista ni realiza llamadas
  ui.calls.length = 0;
  initialStream.emit('space');
  await new Promise(r => setTimeout(r, 10));

  assert.equal(ui.calls.length, 0);
  assert.equal(ui.get('account-name').textContent, 'Sin sesión');

  // Simular evento online / reconexión
  ui.window.listeners.online?.();
  await ui.refresh();

  // Comprobar que se ha creado un nuevo EventSource y se han refrescado las vistas
  assert.equal(ui.streams.length, 2);
  assert.equal(ui.get('account-name').textContent, 'Equipo Marea');

  const activeStream = ui.streams[1];

  // Si el stream activo recibe 'revoke', limpia la vista y cierra el stream
  activeStream.emit('revoke');
  assert.equal(activeStream.closed, true);
  assert.equal(ui.get('account-name').textContent, 'Sin sesión');

  // Eventos posteriores en el stream cerrado no hacen nada
  ui.calls.length = 0;
  activeStream.emit('space');
  await new Promise(r => setTimeout(r, 10));

  assert.equal(ui.calls.length, 0);
  assert.equal(ui.get('account-name').textContent, 'Sin sesión');
});
