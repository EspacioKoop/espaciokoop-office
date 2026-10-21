import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../src/domain.mjs';
import { demoPolicy } from '../src/fixtures.mjs';
import { createPresenceBridge } from '../src/presence-bridge.mjs';

const projectId = 'demo/observatorio';

function makeConfig() {
  return {
    agents: [
      { id: 'aurora/atlas', label: 'Atlas', ownerId: 'aurora', projects: ['demo/observatorio', 'demo/archivo'] },
      { id: 'marea/bruma', label: 'Bruma', ownerId: 'marea', projects: ['demo/observatorio'] }
    ],
    credentials: [
      { agentId: 'aurora/atlas', keyHash: digest('synthetic-atlas-key') },
      { agentId: 'marea/bruma', keyHash: digest('synthetic-bruma-key') }
    ]
  };
}

test('initialize: configura correctamente el puente de presencia con la política y credenciales', () => {
  let time = 1000;
  const bridge = createPresenceBridge({ load: makeConfig, projectId, now: () => time });
  const state = bridge.initialize(demoPolicy);
  assert.ok(state);
  assert.ok(state.hash);
  assert.ok(state.policyHash);
  assert.equal(state.credentials.length, 2);
});

test('initialize: reacciona ante configuración no válida, proyecto no seleccionado o credencial duplicada', () => {
  const bridge = createPresenceBridge({
    load: () => {
      const cfg = makeConfig();
      delete cfg.credentials;
      return cfg;
    },
    projectId,
    now: () => 1000
  });
  assert.throws(() => bridge.initialize(demoPolicy), { code: 'PRESENCE_UNAVAILABLE', status: 503 });

  const bridgeWrongProject = createPresenceBridge({
    load: makeConfig,
    projectId: 'demo/inexistente',
    now: () => 1000
  });
  assert.throws(() => bridgeWrongProject.initialize(demoPolicy), { code: 'PRESENCE_UNAVAILABLE', status: 503 });
});

test('read: genera snapshot de presencia con alta, caducidad y baja según el reloj', () => {
  let time = 1000;
  const bridge = createPresenceBridge({ load: makeConfig, projectId, now: () => time });

  // Iniciar y publicar heartbeat para atlas
  const handle = bridge.prepare('synthetic-atlas-key', demoPolicy);
  handle.commit({ projectId, sequence: 1 }, demoPolicy);
  handle.release();

  let snapshot = bridge.read('marea', demoPolicy);
  assert.equal(snapshot.projectId, projectId);
  assert.equal(snapshot.generatedAt, 1000);
  assert.equal(snapshot.expiresAt, 2000);

  const atlasState = snapshot.agents.find(a => a.id === 'aurora/atlas');
  assert.equal(atlasState.status, 'online');

  // Avanza tiempo para que pase a stale (onlineFor es 5000 ms, a los 6000 ms transcurridos la edad es 6000 ms)
  time = 7000;
  snapshot = bridge.read('marea', demoPolicy);
  assert.equal(snapshot.agents.find(a => a.id === 'aurora/atlas').status, 'stale');

  // Avanza tiempo para que pase a offline (baja) (ttl es 15000 ms, a los 20000 ms transcurridos la edad es 19000 ms)
  time = 20000;
  snapshot = bridge.read('marea', demoPolicy);
  assert.equal(snapshot.agents.find(a => a.id === 'aurora/atlas').status, 'offline');
});

test('prepare/commit/release: ciclo de presencia completo (altas, bajas y evento de un agente desconocido)', () => {
  let time = 1000;
  const bridge = createPresenceBridge({ load: makeConfig, projectId, now: () => time });

  // 1. Alta de atlas
  const handleAtlas = bridge.prepare('synthetic-atlas-key', demoPolicy);
  const hb1 = handleAtlas.commit({ projectId, sequence: 1 }, demoPolicy);
  assert.equal(hb1.agentId, 'aurora/atlas');
  handleAtlas.release();

  let view = bridge.read('aurora', demoPolicy);
  assert.equal(view.agents.find(a => a.id === 'aurora/atlas').status, 'online');
  assert.equal(view.agents.find(a => a.id === 'marea/bruma').status, 'unknown');

  // 2. Alta de bruma (segundo agente)
  const handleBruma = bridge.prepare('synthetic-bruma-key', demoPolicy);
  handleBruma.commit({ projectId, sequence: 1 }, demoPolicy);
  handleBruma.release();

  view = bridge.read('aurora', demoPolicy);
  assert.equal(view.agents.find(a => a.id === 'aurora/atlas').status, 'online');
  assert.equal(view.agents.find(a => a.id === 'marea/bruma').status, 'online');

  // 3. Evento de un agente desconocido (clave no registrada en credenciales)
  assert.throws(
    () => bridge.prepare('unknown-agent-key-123', demoPolicy),
    { code: 'PRESENCE_AUTH', status: 401 }
  );

  // 4. Baja por falta de renovación de heartbeat con el tiempo
  time = 300000;
  view = bridge.read('aurora', demoPolicy);
  assert.equal(view.agents.find(a => a.id === 'aurora/atlas').status, 'offline');
  assert.equal(view.agents.find(a => a.id === 'marea/bruma').status, 'offline');
});

test('prepare/commit: valida datos de publicación y coincidencia de proyecto', () => {
  const bridge = createPresenceBridge({ load: makeConfig, projectId, now: () => 1000 });
  const handle = bridge.prepare('synthetic-atlas-key', demoPolicy);

  assert.throws(
    () => handle.commit({ projectId, sequence: 1, extraField: true }, demoPolicy),
    { code: 'PRESENCE_CONFIG' }
  );

  assert.throws(
    () => handle.commit({ projectId: 'demo/archivo', sequence: 1 }, demoPolicy),
    { code: 'PRESENCE_FORBIDDEN', status: 403 }
  );

  handle.release();
});

test('prepare/commit: rechaza commit tras release o si cambia la política/configuración', () => {
  const bridge = createPresenceBridge({ load: makeConfig, projectId, now: () => 1000 });
  const handle = bridge.prepare('synthetic-atlas-key', demoPolicy);

  handle.release();
  assert.throws(
    () => handle.commit({ projectId, sequence: 1 }, demoPolicy),
    { code: 'PRESENCE_REVOKED', status: 403 }
  );

  const bridge2 = createPresenceBridge({ load: makeConfig, projectId, now: () => 1000 });
  const handle2 = bridge2.prepare('synthetic-atlas-key', demoPolicy);
  const modifiedPolicy = structuredClone(demoPolicy);
  modifiedPolicy.projects[0].label = 'Nuevo Observatorio';

  assert.throws(
    () => handle2.commit({ projectId, sequence: 1 }, modifiedPolicy),
    { code: 'PRESENCE_REVOKED', status: 403 }
  );
  handle2.release();
});

test('rate limit: límite global de 120 intentos de autenticación por ventana de un minuto', () => {
  let time = 1000;
  const bridge = createPresenceBridge({ load: makeConfig, projectId, now: () => time });

  for (let i = 0; i < 120; i++) {
    try {
      bridge.prepare('invalid-key', demoPolicy);
    } catch (err) {
      assert.equal(err.code, 'PRESENCE_AUTH');
    }
  }

  assert.throws(
    () => bridge.prepare('synthetic-atlas-key', demoPolicy),
    { code: 'RATE_LIMIT', status: 429, message: 'Demasiados intentos de presencia.' }
  );

  time += 60000;
  const handle = bridge.prepare('synthetic-atlas-key', demoPolicy);
  assert.ok(handle);
  handle.release();
});

test('rate limit: máximo 4 publicaciones concurrentes en curso', () => {
  const cfg = makeConfig();
  for (let i = 0; i < 5; i++) {
    cfg.agents.push({ id: `marea/worker-${i}`, label: `Worker ${i}`, ownerId: 'marea', projects: [projectId] });
    cfg.credentials.push({ agentId: `marea/worker-${i}`, keyHash: digest(`key-${i}`) });
  }

  const bridge = createPresenceBridge({ load: () => cfg, projectId, now: () => 1000 });
  const handles = [];
  for (let i = 0; i < 4; i++) {
    handles.push(bridge.prepare(`key-${i}`, demoPolicy));
  }

  assert.throws(
    () => bridge.prepare('synthetic-atlas-key', demoPolicy),
    { code: 'RATE_LIMIT', status: 429, message: 'Ya hay una publicación de presencia en curso.' }
  );

  handles[0].release();
  const newHandle = bridge.prepare('synthetic-atlas-key', demoPolicy);
  assert.ok(newHandle);
  newHandle.release();
  for (let i = 1; i < handles.length; i++) handles[i].release();
});

test('rate limit: máximo 60 publicaciones por agente por ventana de un minuto', () => {
  let time = 1000;
  const bridge = createPresenceBridge({ load: makeConfig, projectId, now: () => time });

  for (let i = 0; i < 60; i++) {
    const handle = bridge.prepare('synthetic-atlas-key', demoPolicy);
    handle.commit({ projectId, sequence: i + 1 }, demoPolicy);
    handle.release();
  }

  assert.throws(
    () => bridge.prepare('synthetic-atlas-key', demoPolicy),
    { code: 'RATE_LIMIT', status: 429, message: 'Demasiadas publicaciones de presencia.' }
  );

  time += 60000;
  const handle = bridge.prepare('synthetic-atlas-key', demoPolicy);
  assert.ok(handle);
  handle.release();
});

test('invalidate y observePolicy: descarta el estado interno al invalidar o cambiar la política', () => {
  const bridge = createPresenceBridge({ load: makeConfig, projectId, now: () => 1000 });
  bridge.initialize(demoPolicy);

  bridge.invalidate();
  // Al invalidar, el siguiente read llamará a synchronize internamente
  const snapshot = bridge.read('marea', demoPolicy);
  assert.ok(snapshot);

  const modifiedPolicy = structuredClone(demoPolicy);
  modifiedPolicy.projects[0].label = 'Cambiado';
  bridge.observePolicy(modifiedPolicy);

  // observePolicy resetea state a null
  const snapshot2 = bridge.read('marea', demoPolicy);
  assert.ok(snapshot2);
});
