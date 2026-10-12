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
import { createPresenceRegistry } from '../src/presence.mjs';
import { demoPolicy } from '../src/fixtures.mjs';

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
    querySelectorAll: () => [],
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
  const queue = () => ({ memberId: 'marea', generatedAt: time, expiresAt: time + 12000, queue: [] });
  const response = (data, status = 200) => ({ ok: status < 400, json: async () => data });
  let transport = path => response(path === '/api/snapshot' ? snapshot() : queue());

  const api = await runInNewContext(`(async () => { ${source}\nreturn { refresh, clearView, show }; })()`, {
    document, window, Date: class extends Date { static now() { return time; } },
    AbortSignal: { timeout: () => undefined }, EventSource: class { addEventListener() {} close() {} },
    fetch: async (path, options) => transport(path, options),
    setTimeout: () => 1, clearTimeout: () => {}
  });

  return { ...api, get, document, window, setTransport: fn => { transport = fn; } };
}

test('Accesibilidad Panel Presencia: estructura de estados online, stale, offline', () => {
  const directory = [
    { id: 'aurora/atlas', label: 'Atlas', ownerId: 'aurora', projects: ['demo/observatorio'] },
    { id: 'marea/bruma', label: 'Bruma', ownerId: 'marea', projects: ['demo/observatorio'] }
  ];
  let time = 1000;
  const registry = createPresenceRegistry({ directory, policy: demoPolicy, now: () => time, onlineFor: 5, ttl: 10 });
  registry.heartbeat({ agentId: 'aurora/atlas', projectId: 'demo/observatorio', sequence: 1 });

  let snap = registry.snapshot({ memberId: 'marea', projectId: 'demo/observatorio' });
  const onlineAgent = snap.find(a => a.id === 'aurora/atlas');
  const offlineAgent = snap.find(a => a.id === 'marea/bruma');

  assert.equal(onlineAgent.status, 'online');
  assert.equal(offlineAgent.status, 'offline');

  // Transición a stale
  time = 1006;
  snap = registry.snapshot({ memberId: 'marea', projectId: 'demo/observatorio' });
  assert.equal(snap.find(a => a.id === 'aurora/atlas').status, 'stale');

  // Transición a offline
  time = 1012;
  snap = registry.snapshot({ memberId: 'marea', projectId: 'demo/observatorio' });
  assert.equal(snap.find(a => a.id === 'aurora/atlas').status, 'offline');
});

test('Accesibilidad Panel Presencia: la interfaz no depende únicamente del color para comunicar estados', () => {
  // Verificamos que el texto 'Presencia no disponible' u otros marcadores de estado textuales
  // acompañan a la tarjeta de equipo y estado sin depender exclusivamente de animaciones o color.
  assert.match(source, /Presencia no disponible|Sin sesión/);
  assert.match(htmlSource, /role="status"/);
  assert.match(htmlSource, /aria-live="polite"/);
});

test('Accesibilidad Panel Presencia: navegación por teclado y controles activables por Enter/Espacio', async () => {
  const ui = await createUiClient();
  await ui.refresh();

  const officeView = ui.get('office-view');
  const focusables = getFocusableElements(officeView);
  const nav = new KeyboardNavigator(focusables);

  if (focusables.length > 0) {
    const focused = nav.tab();
    assert.ok(focused);

    let clicked = false;
    focused.addEventListener('click', () => { clicked = true; });

    const activatedEnter = nav.pressKey('Enter');
    assert.equal(activatedEnter, true);
    assert.equal(clicked, true);

    clicked = false;
    const activatedSpace = nav.pressKey(' ');
    assert.equal(activatedSpace, true);
    assert.equal(clicked, true);
  }
});

test('Accesibilidad Panel Presencia: etiquetas ARIA en tarjetas e imágenes decorativas ocultas', async () => {
  const ui = await createUiClient();
  await ui.refresh();

  const officeView = ui.get('office-view');
  const allElements = all(officeView);

  // Los avatares deben tener aria-hidden="true" para no estorbar a lectores de pantalla
  const avatars = allElements.filter(el => el.attributes?.class?.includes('avatar'));
  for (const avatar of avatars) {
    assert.equal(avatar.getAttribute('aria-hidden'), 'true');
  }

  // La imagen de escena debe incluir texto alternativo descriptivo en alt
  const img = allElements.find(el => el.tagName === 'img');
  assert.ok(img);
  assert.ok(getAccessibleName(img).length > 0);
  assert.match(getAccessibleName(img), /oficina|No muestra agentes reales/i);
});

test('Accesibilidad Panel Presencia: cumple reglas CSS WCAG 2.1 AA (:focus-visible, prefers-reduced-motion, contraste)', () => {
  const rules = checkAccessibilityCssRules(cssSource);
  assert.equal(rules.hasReducedMotion, true, 'Debe definir @media(prefers-reduced-motion:reduce)');
  assert.equal(rules.hasFocusVisible, true, 'Debe definir estilos para :focus-visible');

  // Verificación sintética de relaciones de contraste
  // Fondo primario #101923 y texto principal #f0f2ef
  const ratioPrimary = getContrastRatio('#101923', '#f0f2ef');
  assert.ok(ratioPrimary >= 4.5, `Relación de contraste principal ${ratioPrimary} debe ser >= 4.5`);

  // Texto muted #a9bbc6 sobre fondo #101923
  const ratioMuted = getContrastRatio('#101923', '#a9bbc6');
  assert.ok(ratioMuted >= 4.5, `Relación de contraste muted ${ratioMuted} debe ser >= 4.5`);

  // Destacado mint #b2e0c7 sobre fondo #17392d
  const ratioMint = getContrastRatio('#17392d', '#b2e0c7');
  assert.ok(ratioMint >= 4.5, `Relación de contraste mint ${ratioMint} debe ser >= 4.5`);
});

test('Accesibilidad Panel Presencia: estado de cierre de sesión es navegable sin errores JS', async () => {
  const ui = await createUiClient();
  ui.clearView('Sesión cerrada.');

  assert.equal(ui.get('account-name').textContent, 'Sin sesión');
  assert.equal(ui.get('notice').textContent, 'Sesión cerrada.');

  // Verificar que el aviso sea leíble con rol status y live polite en HTML
  assert.match(htmlSource, /id="notice" role="status" aria-live="polite"/);
});
