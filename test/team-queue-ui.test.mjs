import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Execute the real client against an isolated DOM, transport and clock.
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
const task = {
  id: 'demo/observatorio#11', project_id: 'demo/observatorio', team_id: 'marea', issue: 11,
  title: 'Cola <b>literal</b>', stage: 'delivered', acceptance: 'confirmed',
  url: 'https://github.com/demo/observatorio/issues/11', assignee: 'nico-demo',
  pull_request: { number: 21, url: 'https://github.com/demo/observatorio/pull/21', sha: 'a'.repeat(40), ci: 'SUCCESS', reviewer: null },
  reasons: [], evidence: [{ kind: 'delivered', label: 'Entrega comprobable', url: 'https://github.com/demo/observatorio/pull/21' }]
};
const source = readFileSync(new URL('../web/app.mjs', import.meta.url), 'utf8');
async function client() {
  let time = 1000; let nextTimer = 0; let transport;
  const timers = new Map(); const elements = new Map(); const calls = []; const streams = [];
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const document = { hidden: false, listeners: {}, getElementById: get, createElement: tag => new Element(tag),
    querySelectorAll: () => [], addEventListener(name, listener) { this.listeners[name] = listener; } };
  const window = { listeners: {}, addEventListener(name, listener) { this.listeners[name] = listener; } };
  const snapshot = () => ({ mode: 'live', memberId: 'marea', generatedAt: time, expiresAt: time + 12000,
    members: [{ id: 'marea', label: 'Equipo Marea', githubLogin: 'nico-demo' }],
    projects: [{ repo: 'demo/observatorio', label: 'Observatorio', tasks: [] }], demo: null });
  const queue = () => ({ memberId: 'marea', generatedAt: time, expiresAt: time + 12000, queue: [structuredClone(task)] });
  const response = (data, status = 200) => ({ ok: status < 400, json: async () => data });
  transport = path => path === '/api/info' ? response({ mode: 'live' }) : response({ error: 'AUTH' }, 401);
  class Clock extends Date { static now() { return time; } }
  class Events {
    constructor() { this.listeners = {}; streams.push(this); }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    close() { this.closed = true; }
  }
  const api = await runInNewContext(`(async () => { ${source}\nreturn { refresh, clearView }; })()`, {
    document, window, Date: Clock, AbortSignal: { timeout: () => undefined }, EventSource: Events,
    fetch: async (path, options) => { calls.push({ path, options }); return transport(path, options); },
    setTimeout: (fn, delay) => { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id)
  });
  calls.length = 0;
  return { ...api, get, document, window, calls, streams, timers, snapshot, queue, response,
    setTime: value => { time = value; }, setTransport: fn => { transport = fn; },
    normal: () => { transport = path => response(path === '/api/snapshot' ? snapshot() : queue()); } };
}
function all(root) { return [root, ...root.children.flatMap(all)]; }
function deferred() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }

test('UI: cola del equipo, búsqueda, texto literal y detalle de evidencia accesible', async () => {
  const ui = await client(); ui.normal(); await ui.refresh();
  assert.deepEqual(ui.calls.map(call => call.path), ['/api/snapshot', '/api/queue']);
  assert.ok(ui.calls.every(call => call.options.cache === 'no-store' && call.options.credentials === 'same-origin'));
  assert.match(ui.get('board').textContent, /Cola de Equipo Marea.*Cola <b>literal<\/b>.*Entregada/);
  const button = all(ui.get('board')).find(element => element.tagName === 'button');
  assert.ok(button); button.listeners.click();
  assert.equal(ui.get('detail').open, true);
  assert.match(ui.get('detail-content').textContent, /SUCCESS|Entrega comprobable/);
  assert.equal(all(ui.get('detail-content')).find(element => element.tagName === 'a').href, task.evidence[0].url);
  ui.get('search').value = 'inexistente'; ui.get('search').listeners.input();
  assert.doesNotMatch(ui.get('board').textContent, /Cola <b>/);
  assert.match(ui.get('board').textContent, /coincidan con la búsqueda/);
  ui.get('search').value = '#11'; ui.get('search').listeners.input();
  assert.match(ui.get('board').textContent, /Cola <b>/);
});

test('UI: cola vacía se distingue de un error de carga', async () => {
  const ui = await client(); ui.setTransport(path => ui.response(path === '/api/snapshot' ? ui.snapshot() : { ...ui.queue(), queue: [] }));
  await ui.refresh(); assert.match(ui.get('board').textContent, /no tiene tareas dirigidas/);
  assert.equal(ui.get('login').hidden, true);
});

for (const error of ['QUEUE_CHANGED', 'QUEUE_UNAVAILABLE', 'AUTH']) {
  test(`UI: ${error} durante segunda consulta retira cola, proyectos y diálogo`, async () => {
    const ui = await client(); ui.normal(); await ui.refresh();
    all(ui.get('board')).find(element => element.tagName === 'button').listeners.click();
    ui.setTransport(path => path === '/api/snapshot' ? ui.response(ui.snapshot()) : ui.response({ error }, error === 'AUTH' ? 401 : 503));
    await ui.refresh();
    assert.equal(ui.get('board').textContent, ''); assert.equal(ui.get('office-view').textContent, '');
    assert.equal(ui.get('detail-content').textContent, ''); assert.equal(ui.get('detail').open, false);
    assert.equal(ui.get('account-name').textContent, 'Sin sesión'); assert.equal(ui.streams[0].closed, true);
  });
}

for (const signal of ['revoke', 'offline', 'visibilitychange']) {
  test(`UI: una respuesta retrasada después de ${signal} no restaura datos`, async () => {
    const ui = await client(); ui.normal(); await ui.refresh();
    const gate = deferred(); const entered = deferred();
    ui.setTransport(path => { if (path === '/api/snapshot') return ui.response(ui.snapshot()); entered.release(); return gate.promise; });
    const pending = ui.refresh(); await entered.promise;
    if (signal === 'revoke') ui.streams[0].listeners.revoke();
    else if (signal === 'offline') ui.window.listeners.offline();
    else { ui.document.hidden = true; ui.document.listeners.visibilitychange(); }
    gate.release(ui.response(ui.queue())); await pending;
    assert.equal(ui.get('board').textContent, ''); assert.equal(ui.get('office-view').textContent, '');
    assert.equal(ui.get('account-name').textContent, 'Sin sesión');
  });
}

test('UI: caducidad del snapshot mientras espera la cola no pinta una vista parcial', async () => {
  const ui = await client(); const gate = deferred(); const entered = deferred();
  ui.setTransport(path => { if (path === '/api/snapshot') return ui.response({ ...ui.snapshot(), expiresAt: 1100 }); entered.release(); return gate.promise; });
  const pending = ui.refresh(); await entered.promise;
  assert.equal(ui.get('board').textContent, '');
  ui.setTime(1200); gate.release(ui.response(ui.queue())); await pending;
  assert.equal(ui.get('board').textContent, ''); assert.match(ui.get('notice').textContent, /caducado/);
});

test('UI: la caducidad usa el menor TTL y retira ambas vistas y evidencia', async () => {
  const ui = await client();
  ui.setTransport(path => ui.response(path === '/api/snapshot' ? ui.snapshot() : { ...ui.queue(), expiresAt: 1500 }));
  await ui.refresh(); const expiry = [...ui.timers.values()].find(timer => timer.delay === 500);
  assert.ok(expiry); expiry.fn();
  assert.equal(ui.get('board').textContent, ''); assert.equal(ui.get('office-view').textContent, '');
});

test('UI: equipos distintos entre respuestas no se mezclan', async () => {
  const ui = await client(); ui.setTransport(path => ui.response(path === '/api/snapshot' ? ui.snapshot() : { ...ui.queue(), memberId: 'aurora' }));
  await ui.refresh(); assert.equal(ui.get('board').textContent, ''); assert.match(ui.get('notice').textContent, /cambiado/);
});

test('UI: un error retrasado tras revocación no borra el aviso de revocación', async () => {
  const ui = await client(); ui.normal(); await ui.refresh(); const gate = deferred(); const entered = deferred();
  ui.setTransport(path => { if (path === '/api/snapshot') return ui.response(ui.snapshot()); entered.release(); return gate.promise; });
  const pending = ui.refresh(); await entered.promise; ui.streams[0].listeners.revoke();
  gate.release(ui.response({ error: 'INTERNAL', message: 'Aviso antiguo' }, 500)); await pending;
  assert.match(ui.get('notice').textContent, /acceso ha cambiado/); assert.doesNotMatch(ui.get('notice').textContent, /Aviso antiguo/);
});
