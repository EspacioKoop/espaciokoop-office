import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.value = ''; this.hidden = false; this.open = false; this.text = ''; }
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

const source = readFileSync(new URL('../web/app.mjs', import.meta.url), 'utf8');
function deferred() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }

async function client() {
  let time = 1000; let transport; let nextTimer = 0;
  const timers = new Map(); const elements = new Map(); const calls = []; const streams = [];
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const document = { hidden: false, listeners: {}, getElementById: get, createElement: tag => new Element(tag),
    querySelectorAll: () => [], addEventListener(name, listener) { this.listeners[name] = listener; } };
  const window = { listeners: {}, addEventListener(name, listener) { this.listeners[name] = listener; } };
  const snapshot = () => ({ mode: 'live', memberId: 'marea', generatedAt: time, expiresAt: time + 12000,
    members: [{ id: 'marea', label: 'Equipo Marea', githubLogin: 'nico-demo' }],
    projects: [{ repo: 'demo/observatorio', label: 'Observatorio', tasks: [] }], demo: null });
  const queue = () => ({ memberId: 'marea', generatedAt: time, expiresAt: time + 12000, queue: [] });
  const presence = () => ({ projectId: 'demo/observatorio', generatedAt: time, expiresAt: time + 1000, agents: [
    { id: 'marea/worker', label: 'Worker Marea', ownerId: 'marea', status: 'online', seenAt: time },
    { id: 'aurora/worker', label: 'Worker Aurora', ownerId: 'aurora', status: 'stale', seenAt: time - 6000 },
    { id: 'aurora/review', label: 'Review Aurora', ownerId: 'aurora', status: 'offline', seenAt: null }
  ] });
  const response = (data, status = 200) => ({ ok: status < 400, json: async () => data });
  class Clock extends Date { static now() { return time; } }
  class Events {
    constructor() { this.listeners = {}; streams.push(this); }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    close() { this.closed = true; }
  }
  transport = path => response({ '/api/info': { mode: 'live', version: '1.0.0-rc.1' },
    '/api/snapshot': snapshot(), '/api/queue': queue(), '/api/presence': presence() }[path]);
  const api = await runInNewContext(`(async () => { ${source}\nreturn { refresh, clearView }; })()`, {
    document, window, Date: Clock, AbortSignal: { timeout: () => undefined }, EventSource: Events,
    fetch: async (path, options) => { calls.push({ path, options }); return transport(path, options); },
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id)
  });
  calls.length = 0;
  return { ...api, get, window, calls, streams, timers, snapshot, queue, presence, response,
    setTime: value => { time = value; }, setTransport: fn => { transport = fn; } };
}

test('UI presencia: consume GET /api/presence y muestra solo estados públicos', async () => {
  const ui = await client(); await ui.refresh();
  assert.deepEqual(ui.calls.map(call => call.path), ['/api/snapshot', '/api/queue', '/api/presence']);
  assert.match(ui.get('office-view').textContent, /PRESENCIA AUTENTICADA.*Worker Marea.*online.*Worker Aurora.*stale.*Review Aurora.*offline/);
  assert.doesNotMatch(ui.get('office-view').textContent, /synthetic|keyHash|sequence|demo-marea|Bearer/);
});

test('UI presencia: usa su TTL y limpia Office/cola al caducar', async () => {
  const ui = await client(); await ui.refresh();
  const expiry = [...ui.timers.values()].find(timer => timer.delay === 1000);
  assert.ok(expiry); expiry.fn();
  assert.equal(ui.get('office-view').textContent, ''); assert.equal(ui.get('board').textContent, '');
});

for (const [name, status] of [['ausencia de endpoint', 404], ['sesión caducada', 401], ['acceso prohibido', 403], ['presencia no disponible', 503]]) {
  test(`UI presencia: ${name} limpia inmediatamente la vista`, async () => {
    const ui = await client(); await ui.refresh();
    ui.setTransport(path => {
      if (path === '/api/snapshot') return ui.response(ui.snapshot());
      if (path === '/api/queue') return ui.response(ui.queue());
      return ui.response({ error: 'PRESENCE_UNAVAILABLE', message: 'Presencia no disponible.' }, status);
    });
    await ui.refresh();
    assert.equal(ui.get('office-view').textContent, ''); assert.equal(ui.get('board').textContent, '');
    assert.equal(ui.get('account-name').textContent, 'Sin sesión'); assert.equal(ui.streams[0].closed, true);
  });
}

test('UI presencia: ausencia de agentes no se pinta como presencia falsa', async () => {
  const ui = await client();
  ui.setTransport(path => ui.response({
    '/api/snapshot': ui.snapshot(), '/api/queue': ui.queue(), '/api/presence': { ...ui.presence(), agents: [] }
  }[path]));
  await ui.refresh();
  assert.equal(ui.get('office-view').textContent, ''); assert.match(ui.get('notice').textContent, /caducado|cambiado/);
});

test('UI presencia: una respuesta tardía tras revocación no restaura datos', async () => {
  const ui = await client(); await ui.refresh();
  const gate = deferred(); const entered = deferred();
  ui.setTransport(path => {
    if (path === '/api/snapshot') return ui.response(ui.snapshot());
    if (path === '/api/queue') return ui.response(ui.queue());
    entered.release(); return gate.promise;
  });
  const pending = ui.refresh(); await entered.promise; ui.streams[0].listeners.revoke();
  gate.release(ui.response(ui.presence())); await pending;
  assert.equal(ui.get('office-view').textContent, ''); assert.equal(ui.get('board').textContent, '');
  assert.match(ui.get('notice').textContent, /acceso ha cambiado/);
});
