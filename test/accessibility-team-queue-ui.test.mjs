import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  getContrastRatio,
  getFocusableElements,
  KeyboardNavigator,
  checkAccessibilityCssRules,
  getAccessibleName
} from './fixtures/accessibility.mjs';

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
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  showModal() { this.open = true; }
  close() { if (this.open) { this.open = false; this.listeners.close?.(); } }
}

function all(root) { return [root, ...root.children.flatMap(all)]; }

const source = readFileSync(new URL('../web/app.mjs', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../web/style.css', import.meta.url), 'utf8');
const htmlSource = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');

const sampleTask = {
  id: 'demo/observatorio#11',
  project_id: 'demo/observatorio',
  team_id: 'marea',
  issue: 11,
  title: 'Tarea de accesibilidad sintética',
  stage: 'delivered',
  acceptance: 'confirmed',
  url: 'https://github.com/demo/observatorio/issues/11',
  assignee: 'nico-demo',
  pull_request: {
    number: 21,
    url: 'https://github.com/demo/observatorio/pull/21',
    sha: 'a'.repeat(40),
    ci: 'SUCCESS',
    reviewer: 'ada-demo'
  },
  reasons: [],
  evidence: [{ kind: 'delivered', label: 'Entrega de accesibilidad comprobable', url: 'https://github.com/demo/observatorio/pull/21' }]
};

async function createUiClient() {
  let time = 1000;
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const document = {
    hidden: false,
    listeners: {},
    getElementById: get,
    createElement: tag => new Element(tag),
    querySelectorAll: selector => {
      if (selector === '[data-login]') return [get('demo-login-aurora'), get('demo-login-marea')];
      return [];
    },
    addEventListener(name, listener) { this.listeners[name] = listener; }
  };
  const window = {
    listeners: {},
    addEventListener(name, listener) { this.listeners[name] = listener; }
  };
  const snapshot = () => ({
    mode: 'live', memberId: 'marea', generatedAt: time, expiresAt: time + 12000,
    members: [
      { id: 'aurora', label: 'Equipo Aurora', githubLogin: 'ada-demo' },
      { id: 'marea', label: 'Equipo Marea', githubLogin: 'nico-demo' }
    ],
    projects: [{ repo: 'demo/observatorio', label: 'Observatorio', tasks: [] }],
    demo: null
  });
  const queue = () => ({ memberId: 'marea', generatedAt: time, expiresAt: time + 12000, queue: [structuredClone(sampleTask)] });
  const response = (data, status = 200) => ({ ok: status < 400, json: async () => data });
  let transport = path => response(path === '/api/snapshot' ? snapshot() : queue());

  const api = await runInNewContext(`(async () => { ${source}\nreturn { refresh, clearView, show, detail }; })()`, {
    document, window, Date: class extends Date { static now() { return time; } },
    AbortSignal: { timeout: () => undefined }, EventSource: class { addEventListener() {} close() {} },
    fetch: async (path, options) => transport(path, options),
    setTimeout: () => 1, clearTimeout: () => {}
  });

  return { ...api, get, document, window, snapshot, queue, response, setTransport: fn => { transport = fn; } };
}

test('Accesibilidad Cola de Equipo: orden de foco por Tab / Shift+Tab en tablero de cola', async () => {
  const ui = await createUiClient();
  await ui.refresh();

  const board = ui.get('board');
  const focusables = getFocusableElements(board);
  assert.ok(focusables.length > 0, 'Debe existir al menos un elemento enfocable en la cola');

  const nav = new KeyboardNavigator(focusables);

  // Avanzar con Tab
  const firstFocused = nav.tab();
  assert.equal(firstFocused, focusables[0]);

  // Retroceder con Shift+Tab
  const previousFocused = nav.shiftTab();
  assert.equal(previousFocused, focusables[focusables.length - 1]);
});

test('Accesibilidad Cola de Equipo: activación de tarjeta de tarea por Enter y Espacio abre diálogo de evidencia', async () => {
  const ui = await createUiClient();
  await ui.refresh();

  const board = ui.get('board');
  const focusables = getFocusableElements(board);
  const taskBtn = focusables.find(el => el.tagName === 'button');
  assert.ok(taskBtn, 'La tarjeta de tarea debe ser un botón enfocable');

  const nav = new KeyboardNavigator([taskBtn]);
  nav.tab(); // Enfocar el botón de tarea

  // Activar con Enter
  const handledEnter = nav.pressKey('Enter');
  assert.equal(handledEnter, true);
  assert.equal(ui.get('detail').open, true, 'Al presionar Enter se abre el diálogo modal de evidencia');

  // Cerrar el diálogo
  ui.get('detail').close();
  assert.equal(ui.get('detail').open, false);

  // Activar con Espacio
  const handledSpace = nav.pressKey(' ');
  assert.equal(handledSpace, true);
  assert.equal(ui.get('detail').open, true, 'Al presionar Espacio se abre el diálogo modal de evidencia');
});

test('Accesibilidad Cola de Equipo: el diálogo modal de detalle posee atributos ARIA adecuados', () => {
  assert.match(htmlSource, /<dialog id="detail" aria-labelledby="detail-title">/);
  assert.match(htmlSource, /<button id="close-detail" aria-label="Cerrar detalle">/);
});

test('Accesibilidad Cola de Equipo: campo de búsqueda tiene etiqueta accesible asociada y tipo correcto', () => {
  assert.match(htmlSource, /<label class="search-label" for="search">Buscar tarea/);
  assert.match(htmlSource, /<input id="search" type="search"/);
});

test('Accesibilidad Cola de Equipo: estado de cola vacía es accesible y no rompe JS', async () => {
  const ui = await createUiClient();
  ui.setTransport(path => ui.response(path === '/api/snapshot' ? ui.snapshot() : { ...ui.queue(), queue: [] }));
  await ui.refresh();

  const boardText = ui.get('board').textContent;
  assert.match(boardText, /Tu equipo no tiene tareas dirigidas a esta cola|no tiene tareas dirigidas/);
});

test('Accesibilidad Cola de Equipo: contraste WCAG 2.1 AA en etiquetas de fase (pill) y fondo de tarjeta', () => {
  // Pill delivered (purple): background #37334a, color #c8bee2
  const contrastDelivered = getContrastRatio('#37334a', '#c8bee2');
  assert.ok(contrastDelivered >= 4.5, `Contraste pill delivered ${contrastDelivered} debe ser >= 4.5`);

  // Pill reviewed (mint): background #253d35, color #b2e0c7
  const contrastReviewed = getContrastRatio('#253d35', '#b2e0c7');
  assert.ok(contrastReviewed >= 4.5, `Contraste pill reviewed ${contrastReviewed} debe ser >= 4.5`);

  // Botón de tarea (task-button): background #1b2b37, text #f0f2ef
  const contrastTaskBtn = getContrastRatio('#1b2b37', '#f0f2ef');
  assert.ok(contrastTaskBtn >= 4.5, `Contraste task button ${contrastTaskBtn} debe ser >= 4.5`);
});

test('Accesibilidad Cola de Equipo: enlace de salto al contenido principal (skip link) accesible por teclado', () => {
  assert.match(htmlSource, /<a class="skip" href="#main">Saltar al contenido<\/a>/);
  assert.match(cssSource, /\.skip:focus\s*\{\s*top:\s*10px/);
});
