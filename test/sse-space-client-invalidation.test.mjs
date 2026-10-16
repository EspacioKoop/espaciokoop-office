import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

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

const task = {
  id: 'demo/observatorio#11', project_id: 'demo/observatorio', team_id: 'marea', issue: 11,
  title: 'Cola de prueba', stage: 'delivered', acceptance: 'confirmed',
  url: 'https://github.com/demo/observatorio/issues/11', assignee: 'nico-demo',
  pull_request: { number: 21, url: 'https://github.com/demo/observatorio/pull/21', sha: 'a'.repeat(40), ci: 'SUCCESS', reviewer: null },
  reasons: [], evidence: [{ kind: 'delivered', label: 'Entrega comprobable', url: 'https://github.com/demo/observatorio/pull/21' }]
};

const source = readFileSync(new URL('../web/app.mjs', import.meta.url), 'utf8');

async function client() {
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

  const api = await runInNewContext(`(async () => { ${source}\nreturn { refresh, clearView }; })()`, {
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

function deferred() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

test('SSE space: señal space autenticada dispara recarga por rutas read-only existentes y no crea un segundo EventSource', async () => {
  const ui = await client();
  ui.normal();
  await ui.refresh();

  assert.equal(ui.streams.length, 1);
  assert.equal(ui.streams[0].closed, false);
  assert.ok(ui.streams[0].listeners.space);

  ui.calls.length = 0;

  // Disparar evento SSE 'space' con un payload arbitrario (e.g. { room: 'common', malicious: true })
  ui.streams[0].emit('space', { room: 'common', malicious: true });

  await new Promise(r => setTimeout(r, 10));

  assert.deepEqual(ui.calls.map(c => c.path), ['/api/snapshot', '/api/queue']);
  assert.ok(ui.calls.every(c => c.options.cache === 'no-store' && c.options.credentials === 'same-origin'));
  assert.equal(ui.streams.length, 1, 'No debe crear un segundo EventSource al recargar');
});

test('SSE space: eventos repetidos mientras refreshing es true no provocan tormenta de llamadas', async () => {
  const ui = await client();
  ui.normal();
  await ui.refresh();

  const gate = deferred();
  const entered = deferred();

  ui.setTransport(path => {
    if (path === '/api/snapshot') entered.release();
    return gate.promise;
  });

  ui.calls.length = 0;

  // Disparar primer evento SSE 'space' que inicia refresh()
  ui.streams[0].emit('space');
  await entered.promise;

  assert.equal(ui.calls.length, 1);
  assert.equal(ui.calls[0].path, '/api/snapshot');

  // Disparar eventos 'space' adicionales mientras se está refrescando
  ui.streams[0].emit('space');
  ui.streams[0].emit('space');

  // Desbloquear la respuesta del primer fetch
  gate.release(ui.response(ui.snapshot()));

  // Esperar a que la primera recarga complete (incluyendo api('/api/queue'))
  ui.setTransport(path => ui.response(path === '/api/snapshot' ? ui.snapshot() : ui.queue()));
  await new Promise(r => setTimeout(r, 20));

  // Confirmar que solo se realizaron las 2 llamadas estándar (snapshot + queue) del primer refresh
  assert.deepEqual(ui.calls.map(c => c.path), ['/api/snapshot', '/api/queue']);
});

test('SSE space: evento space tras revocación, pestaña oculta o error no fuga datos ni reanima estado', async () => {
  const ui = await client();
  ui.normal();
  await ui.refresh();

  const stream = ui.streams[0];
  assert.ok(stream);

  // Simular evento revoke
  stream.emit('revoke');
  assert.equal(stream.closed, true);
  assert.equal(ui.get('account-name').textContent, 'Sin sesión');

  ui.calls.length = 0;

  // Intentar emitir 'space' en la stream revocado/cerrado
  stream.emit('space');

  await new Promise(r => setTimeout(r, 10));

  assert.equal(ui.calls.length, 0, 'No debe realizar llamadas a API si el stream está cerrado por revocación');
  assert.equal(ui.get('account-name').textContent, 'Sin sesión');

  // Simular re-inicio de sesión para probar pestaña oculta
  ui.normal();
  await ui.refresh();

  const activeStream = ui.streams[1] || ui.streams[0];
  ui.document.hidden = true;
  ui.document.listeners.visibilitychange();

  assert.equal(ui.get('account-name').textContent, 'Sin sesión');
  ui.calls.length = 0;

  activeStream.emit('space');

  await new Promise(r => setTimeout(r, 10));

  assert.equal(ui.calls.length, 0, 'Pestaña oculta no debe hacer fetch al recibir space SSE');
});
