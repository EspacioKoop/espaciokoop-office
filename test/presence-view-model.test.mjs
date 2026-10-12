import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPresenceViewModel } from '../web/presence-view-model.mjs';

test('presence-view-model: ausencia de sesión o authorized: false retorna fail-closed (unauthorized)', () => {
  const snapshot = {
    projectId: 'demo/observatorio',
    generatedAt: 1000,
    expiresAt: 2000,
    agents: [
      { id: 'aurora/worker', label: 'Worker Aurora', ownerId: 'aurora', status: 'online', seenAt: 1000 }
    ]
  };

  const result = projectPresenceViewModel(snapshot, { authorized: false });
  assert.equal(result.status, 'unauthorized');
  assert.equal(result.isAvailable, false);
  assert.equal(result.hasAgents, false);
  assert.equal(result.title, 'Presencia no disponible');
  assert.deepEqual(result.agents, []);
  assert.equal(result.generatedAt, null);
  assert.equal(result.expiresAt, null);
});

test('presence-view-model: errores 401, 403, 503, snapshot corrupto o revocación producen fail-closed (error)', () => {
  const cases = [
    { error: 'AUTH', status: 401 },
    { error: 'FORBIDDEN', status: 403 },
    { error: 'PRESENCE_UNAVAILABLE', status: 503 },
    null,
    undefined,
    'not-an-object',
    [],
    { status: 500, error: 'SERVER_ERROR' },
    { agents: 'invalid-agents-array' }
  ];

  for (const snapshot of cases) {
    const result = projectPresenceViewModel(snapshot, { authorized: true });
    assert.equal(result.status, result.status === 'unauthorized' ? 'unauthorized' : 'error');
    assert.equal(result.isAvailable, false);
    assert.equal(result.hasAgents, false);
    assert.equal(result.title, 'Presencia no disponible');
    assert.deepEqual(result.agents, []);
    assert.equal(result.generatedAt, null);
    assert.equal(result.expiresAt, null);
  }
});

test('presence-view-model: respuesta 404 o lista vacía genera tarjeta "Sin agentes registrados", nunca inventa agentes', () => {
  const notFoundSnapshot = {
    error: 'NOT_FOUND',
    status: 404,
    generatedAt: 1000,
    expiresAt: 2000
  };

  const emptySnapshot = {
    projectId: 'demo/observatorio',
    generatedAt: 1000,
    expiresAt: 2000,
    agents: []
  };

  for (const snapshot of [notFoundSnapshot, emptySnapshot]) {
    const result = projectPresenceViewModel(snapshot, { authorized: true });
    assert.equal(result.status, 'empty');
    assert.equal(result.isAvailable, true);
    assert.equal(result.hasAgents, false);
    assert.equal(result.title, 'Sin agentes registrados');
    assert.equal(result.message, 'Sin agentes registrados');
    assert.deepEqual(result.agents, []);
    assert.equal(result.generatedAt, 1000);
    assert.equal(result.expiresAt, 2000);
  }
});

test('presence-view-model: proyección determinista de estados online, stale, offline con saneamiento y orden por ID', () => {
  const snapshot = {
    projectId: 'demo/observatorio',
    generatedAt: 1000,
    expiresAt: 2000,
    agents: [
      { id: 'marea/worker', label: 'Worker <b>Marea</b>', ownerId: 'marea', status: 'stale', seenAt: 800, privateToken: 'SECRET_123' },
      { id: 'aurora/bot', label: 'Bot Aurora & Co', ownerId: 'aurora', status: 'online', seenAt: 1000, internalPath: '/var/secret' },
      { id: 'marea/archiver', label: 'Archiver', ownerId: 'marea', status: 'offline', seenAt: null }
    ]
  };

  const result = projectPresenceViewModel(snapshot, { authorized: true });
  assert.equal(result.status, 'available');
  assert.equal(result.isAvailable, true);
  assert.equal(result.hasAgents, true);
  assert.equal(result.agents.length, 3);

  // Orden estable por ID: aurora/bot, marea/archiver, marea/worker
  assert.deepEqual(result.agents.map(a => a.id), ['aurora/bot', 'marea/archiver', 'marea/worker']);

  // Verificación de saneamiento de etiquetas (HTML) y exclusión de propiedades privadas
  assert.deepEqual(result.agents[0], {
    id: 'aurora/bot',
    label: 'Bot Aurora &amp; Co',
    ownerId: 'aurora',
    status: 'online',
    seenAt: 1000
  });

  assert.deepEqual(result.agents[1], {
    id: 'marea/archiver',
    label: 'Archiver',
    ownerId: 'marea',
    status: 'offline',
    seenAt: null
  });

  assert.deepEqual(result.agents[2], {
    id: 'marea/worker',
    label: 'Worker &lt;b&gt;Marea&lt;/b&gt;',
    ownerId: 'marea',
    status: 'stale',
    seenAt: 800
  });

  // Ningún agente expone tokens o paths privados
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /SECRET_123|\/var\/secret/);
});

test('presence-view-model: deduplicación de IDs, filtrado de agentes no válidos e inyección HTML/control', () => {
  const snapshot = {
    projectId: 'demo/observatorio',
    generatedAt: 1000,
    expiresAt: 2000,
    agents: [
      { id: 'aurora/bot', label: 'Bot Aurora', ownerId: 'aurora', status: 'online', seenAt: 1000 },
      { id: 'aurora/bot', label: 'Bot Aurora Duplicado', ownerId: 'aurora', status: 'online', seenAt: 1000 }, // Duplicado de ID
      { id: 'marea/bot', label: 'Bot Marea\u0000\u001f\u007f', ownerId: 'marea', status: 'online', seenAt: 1000 }, // Caracteres de control
      { id: 'invalid-id-without-owner-prefix', label: 'Bad Agent', ownerId: 'marea', status: 'online', seenAt: 1000 },
      { id: 'marea/hacker', label: '<script>alert("xss")</script>', ownerId: 'marea', status: 'online', seenAt: 1000 },
      { id: 'marea/wrong-owner', label: 'Wrong Owner', ownerId: 'aurora', status: 'online', seenAt: 1000 }, // ID no empieza con ownerId/
      { id: 'marea/fake-status', label: 'Fake Status', ownerId: 'marea', status: 'invented-status', seenAt: 1000 } // Estado inválido
    ]
  };

  const result = projectPresenceViewModel(snapshot, { authorized: true });
  assert.equal(result.agents.length, 3);
  assert.deepEqual(result.agents.map(a => a.id), ['aurora/bot', 'marea/bot', 'marea/hacker']);

  assert.equal(result.agents.find(a => a.id === 'marea/bot').label, 'Bot Marea');
  assert.equal(result.agents.find(a => a.id === 'marea/hacker').label, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
});

test('presence-view-model: acotación estricta de colecciones excesivas (máximo 100) para evitar congelar el navegador', () => {
  const hugeAgentsList = [];
  for (let i = 0; i < 150; i++) {
    hugeAgentsList.push({
      id: `marea/worker-${String(i).padStart(3, '0')}`,
      label: `Worker ${i} ${'x'.repeat(200)}`,
      ownerId: 'marea',
      status: 'online',
      seenAt: 1000
    });
  }

  const snapshot = {
    projectId: 'demo/observatorio',
    generatedAt: 1000,
    expiresAt: 2000,
    agents: hugeAgentsList
  };

  const result = projectPresenceViewModel(snapshot, { authorized: true });
  assert.equal(result.agents.length, 100);
  assert.ok(result.agents.every(a => a.label.length <= 80));
});

test('presence-view-model: pureza del módulo - no realiza llamadas a red ni escribe heartbeats', () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = () => { fetchCalled = true; throw new Error('Fetch no debe ser invocado'); };

  try {
    const snapshot = {
      projectId: 'demo/observatorio',
      generatedAt: 1000,
      expiresAt: 2000,
      agents: [{ id: 'aurora/bot', label: 'Bot Aurora', ownerId: 'aurora', status: 'online', seenAt: 1000 }]
    };

    const result = projectPresenceViewModel(snapshot, { authorized: true });
    assert.equal(fetchCalled, false);
    assert.equal(result.agents.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
