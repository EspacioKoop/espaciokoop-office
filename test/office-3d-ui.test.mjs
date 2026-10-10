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

async function client() {
  let time = 1000; let transport;
  const elements = new Map(); const calls = [];
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const document = { hidden: false, listeners: {}, getElementById: get, createElement: tag => new Element(tag),
    querySelectorAll: () => [], addEventListener(name, listener) { this.listeners[name] = listener; } };
  const window = { listeners: {}, addEventListener(name, listener) { this.listeners[name] = listener; } };
  const snapshot = () => ({ mode: 'live', memberId: 'marea', generatedAt: time, expiresAt: time + 12000,
    members: [{ id: 'marea', label: 'Equipo Marea', githubLogin: 'nico-demo' }],
    projects: [{ repo: 'demo/observatorio', label: 'Observatorio', tasks: [] }], demo: null });
  const queue = tasks => ({ memberId: 'marea', generatedAt: time, expiresAt: time + 12000, queue: tasks });
  const response = (data, status = 200) => ({ ok: status < 400, json: async () => data });
  class Clock extends Date { static now() { return time; } }
  class Events { addEventListener() {} close() {} }
  transport = path => path === '/api/info' ? response({ mode: 'live' }) : response({ error: 'AUTH' }, 401);
  const api = await runInNewContext(`(async () => { ${source}\nreturn { refresh }; })()`, {
    document, window, Date: Clock, AbortSignal: { timeout: () => undefined }, EventSource: Events,
    fetch: async (path, options) => { calls.push({ path, options }); return transport(path, options); },
    setTimeout: () => 1, clearTimeout: () => {}
  });
  calls.length = 0;
  return { ...api, get, calls, snapshot, queue, response, setTransport: fn => { transport = fn; } };
}

function all(root) { return [root, ...root.children.flatMap(all)]; }

const reservedTask = {
  id: 'demo/observatorio#24', project_id: 'demo/observatorio', team_id: 'marea', issue: 24,
  title: 'Reservar la sala de revisión', stage: 'accepted', acceptance: 'assigned',
  url: 'https://github.com/demo/observatorio/issues/24', assignee: 'nico-demo',
  pull_request: null, reasons: [], evidence: [{ kind: 'accepted', label: 'Asignación verificable', url: 'https://github.com/demo/observatorio/issues/24' }]
};

test('vista 3D: estado vacío no dibuja agentes ni colaboración fingida', async () => {
  const ui = await client();
  ui.setTransport(path => {
    if (path === '/api/snapshot') return ui.response(ui.snapshot());
    if (path === '/api/queue') return ui.response(ui.queue([]));
    if (path === '/api/presence') return ui.response({ error: 'NOT_FOUND', message: 'Presencia no configurada.' }, 404);
    return ui.response({ error: 'NOT_FOUND' }, 404);
  });
  await ui.refresh();
  const text = ui.get('office-view').textContent;
  assert.match(text, /Vista 3D mínima/);
  assert.match(text, /Presencia real no configurada: no se dibujan agentes/);
  assert.match(text, /0 · Reservas aceptadas/);
  assert.doesNotMatch(text, /Worker Marea · online/);
  assert.equal(all(ui.get('office-view')).filter(element => String(element.attributes.class ?? '').includes('life-agent')).length, 0);
});

test('vista 3D: presencia y reserva proceden de APIs reales de la sesión', async () => {
  const ui = await client();
  ui.setTransport(path => {
    if (path === '/api/snapshot') return ui.response(ui.snapshot());
    if (path === '/api/queue') return ui.response(ui.queue([structuredClone(reservedTask)]));
    if (path === '/api/presence') return ui.response({ generatedAt: 1000, expiresAt: 2000,
      agents: [{ id: 'marea/worker', label: 'Worker Marea', ownerId: 'marea', status: 'online' }] });
    return ui.response({ error: 'NOT_FOUND' }, 404);
  });
  await ui.refresh();
  assert.deepEqual(ui.calls.map(call => call.path), ['/api/snapshot', '/api/queue', '/api/presence']);
  const text = ui.get('office-view').textContent;
  assert.match(text, /1 · Reservas aceptadas/);
  assert.match(text, /#24 Reservar la sala de revisión/);
  assert.match(text, /Worker Marea · online/);
  assert.match(text, /Presencia online/);
});
