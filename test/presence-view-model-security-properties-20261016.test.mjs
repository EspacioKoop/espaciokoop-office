import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPresenceViewModel } from '../web/presence-view-model.mjs';

test('seguridad y aislamientos: snapshots malformados y entradas primitivas/corruptas retornan fail-closed sin lanzar excepciones', () => {
  const malformedSnapshots = [
    null,
    undefined,
    'string-payload',
    12345,
    true,
    false,
    [],
    {},
    { agents: null },
    { agents: 'invalid-string' },
    { agents: 42 },
    { agents: {} }
  ];

  for (const snapshot of malformedSnapshots) {
    const result = projectPresenceViewModel(snapshot, { authorized: true });
    assert.equal(result.status, 'error');
    assert.equal(result.isAvailable, false);
    assert.equal(result.hasAgents, false);
    assert.deepEqual(result.agents, []);
    assert.equal(result.generatedAt, null);
    assert.equal(result.expiresAt, null);
  }

  // Si agents es un array pero no contiene ningún agente válido, proyecta status: 'empty', isAvailable: true
  const emptyAgentArraySnapshots = [
    { agents: [] },
    { agents: [null, undefined, 123, 'string-agent', true, []] }
  ];

  for (const snapshot of emptyAgentArraySnapshots) {
    const result = projectPresenceViewModel(snapshot, { authorized: true });
    assert.equal(result.status, 'empty');
    assert.equal(result.isAvailable, true);
    assert.equal(result.hasAgents, false);
    assert.deepEqual(result.agents, []);
  }
});

test('seguridad y autorizaciones: authorized: false y estados HTTP 401/403/500 derivan en respuestas fail-closed vacías', () => {
  const unauthResult = projectPresenceViewModel(
    { agents: [{ id: 'owner/agent-1', ownerId: 'owner', label: 'Agent 1', status: 'online' }] },
    { authorized: false }
  );
  assert.deepEqual(unauthResult, {
    status: 'unauthorized',
    isAvailable: false,
    hasAgents: false,
    title: 'Presencia no disponible',
    message: 'Acceso no autorizado o sesión no disponible.',
    agents: [],
    generatedAt: null,
    expiresAt: null
  });

  const errorSnapshots = [
    { status: 401, error: 'UNAUTHORIZED' },
    { status: 403, error: 'FORBIDDEN' },
    { status: 500, error: 'INTERNAL_SERVER_ERROR' },
    { status: 503, error: 'SERVICE_UNAVAILABLE' },
    { error: 'UNKNOWN_ERROR' }
  ];

  for (const snapshot of errorSnapshots) {
    const res = projectPresenceViewModel(snapshot, { authorized: true });
    assert.equal(res.status, 'error');
    assert.equal(res.isAvailable, false);
    assert.equal(res.hasAgents, false);
    assert.deepEqual(res.agents, []);
  }

  // 404 es la única respuesta de error HTTP que se interpreta como 'empty' (disponible pero sin agentes)
  const notFoundRes = projectPresenceViewModel({ status: 404, generatedAt: 100, expiresAt: 200 }, { authorized: true });
  assert.equal(notFoundRes.status, 'empty');
  assert.equal(notFoundRes.isAvailable, true);
  assert.equal(notFoundRes.hasAgents, false);
  assert.equal(notFoundRes.generatedAt, 100);
  assert.equal(notFoundRes.expiresAt, 200);
});

test('aislamiento de propietarios y validación de prefijos: IDs de agentes deben coincidir con ownerId y cumplir formato estricto', () => {
  const snapshot = {
    generatedAt: 1000,
    expiresAt: 2000,
    agents: [
      // Agente válido
      { id: 'aurora/worker-1', ownerId: 'aurora', label: 'Worker 1', status: 'online', seenAt: 100 },
      // Suplantación de propietario: ownerId es marea pero el id empieza por aurora/
      { id: 'aurora/impostor', ownerId: 'marea', label: 'Impostor', status: 'online', seenAt: 100 },
      // ownerId inválido por caracteres o mayúsculas
      { id: 'Aurora/worker-2', ownerId: 'Aurora', label: 'Uppercase Owner', status: 'online' },
      { id: 'owner_special/agent', ownerId: 'owner_special', label: 'Invalid Chars Owner', status: 'online' },
      // id con formato inválido
      { id: 'marea/bad_underscore', ownerId: 'marea', label: 'Bad Chars', status: 'online' },
      { id: 'marea/too/many/slashes', ownerId: 'marea', label: 'Multi Slash', status: 'online' },
      { id: 'marea-no-slash', ownerId: 'marea', label: 'No Slash', status: 'online' }
    ]
  };

  const result = projectPresenceViewModel(snapshot, { authorized: true });
  assert.equal(result.status, 'available');
  assert.equal(result.agents.length, 1);
  assert.equal(result.agents[0].id, 'aurora/worker-1');
  assert.equal(result.agents[0].ownerId, 'aurora');
});

test('deduplicación de alias e IDs: prevalece la primera aparición y se descartan duplicados', () => {
  const snapshot = {
    generatedAt: 1000,
    expiresAt: 2000,
    agents: [
      { id: 'marea/bot-alpha', ownerId: 'marea', label: 'Original Label Alpha', status: 'online', seenAt: 100 },
      { id: 'marea/bot-alpha', ownerId: 'marea', label: 'Duplicate Label Alpha', status: 'stale', seenAt: 200 },
      { id: 'marea/bot-beta', ownerId: 'marea', label: 'Original Label Beta', status: 'offline', seenAt: null },
      { id: 'marea/bot-beta', ownerId: 'marea', label: 'Duplicate Label Beta', status: 'online', seenAt: 300 }
    ]
  };

  const result = projectPresenceViewModel(snapshot, { authorized: true });
  assert.equal(result.agents.length, 2);
  assert.equal(result.agents[0].id, 'marea/bot-alpha');
  assert.equal(result.agents[0].label, 'Original Label Alpha');
  assert.equal(result.agents[0].status, 'online');
  assert.equal(result.agents[1].id, 'marea/bot-beta');
  assert.equal(result.agents[1].label, 'Original Label Beta');
  assert.equal(result.agents[1].status, 'offline');
});

test('saneamiento de HTML e inyección de caracteres de control en etiquetas y campos de entrada', () => {
  const snapshot = {
    generatedAt: 1000,
    expiresAt: 2000,
    agents: [
      {
        id: 'aurora/agent-xss',
        ownerId: 'aurora',
        label: '<script>alert("XSS")</script> & "quotes" \'single\'',
        status: 'online'
      },
      {
        id: 'aurora/agent-control',
        ownerId: 'aurora',
        label: 'Clean\u0000Text\u001fWith\u007fControl\u009fChars',
        status: 'stale'
      },
      {
        id: 'aurora/agent-long',
        ownerId: 'aurora',
        label: 'A'.repeat(120),
        status: 'online'
      }
    ]
  };

  const result = projectPresenceViewModel(snapshot, { authorized: true });
  assert.equal(result.agents.length, 3);

  const xssAgent = result.agents.find(a => a.id === 'aurora/agent-xss');
  assert.equal(xssAgent.label, '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt; &amp; &quot;quotes&quot; &#39;single&#39;');

  const controlAgent = result.agents.find(a => a.id === 'aurora/agent-control');
  assert.equal(controlAgent.label, 'CleanTextWithControlChars');

  const longAgent = result.agents.find(a => a.id === 'aurora/agent-long');
  assert.equal(longAgent.label.length, 80);
});

test('proyección determinista de estados (online, stale, offline) con ordenación ascendente por ID', () => {
  const snapshot = {
    generatedAt: 500,
    expiresAt: 1500,
    agents: [
      { id: 'marea/worker-z', ownerId: 'marea', label: 'Zeta Worker', status: 'stale', seenAt: 400 },
      { id: 'aurora/worker-a', ownerId: 'aurora', label: 'Alpha Worker', status: 'online', seenAt: 500 },
      { id: 'marea/worker-m', ownerId: 'marea', label: 'Mike Worker', status: 'offline', seenAt: null }
    ]
  };

  const result = projectPresenceViewModel(snapshot, { authorized: true });
  assert.equal(result.status, 'available');
  assert.equal(result.hasAgents, true);

  // Ordenación ascendente por ID: aurora/worker-a < marea/worker-m < marea/worker-z
  assert.deepEqual(
    result.agents.map(a => a.id),
    ['aurora/worker-a', 'marea/worker-m', 'marea/worker-z']
  );

  assert.deepEqual(
    result.agents.map(a => a.status),
    ['online', 'offline', 'stale']
  );
});

test('invariancia e inmutabilidad: el objeto snapshot no es mutado y soportar Object.freeze sin fugar propiedades privadas', () => {
  const rawSnapshot = {
    projectId: 'demo/observatorio',
    generatedAt: 1000,
    expiresAt: 2000,
    agents: [
      {
        id: 'aurora/bot',
        ownerId: 'aurora',
        label: 'Bot Aurora',
        status: 'online',
        seenAt: 1000,
        secretToken: 'SUPER_SECRET',
        internalConfig: { path: '/etc/passwd' }
      }
    ]
  };

  const frozenAgents = rawSnapshot.agents.map(a => Object.freeze({ ...a }));
  const frozenSnapshot = Object.freeze({ ...rawSnapshot, agents: Object.freeze(frozenAgents) });

  const result = projectPresenceViewModel(frozenSnapshot, { authorized: true });
  assert.equal(result.agents.length, 1);

  const projectedAgent = result.agents[0];
  assert.deepEqual(Object.keys(projectedAgent).sort(), ['id', 'label', 'ownerId', 'seenAt', 'status']);
  assert.equal(projectedAgent.secretToken, undefined);
  assert.equal(projectedAgent.internalConfig, undefined);

  // Verificar que la serialización a JSON de la respuesta no fuga datos privados
  const jsonStr = JSON.stringify(result);
  assert.doesNotMatch(jsonStr, /SUPER_SECRET|\/etc\/passwd/);
});
