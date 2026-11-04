import test from 'node:test';
import assert from 'node:assert/strict';
import { digest } from '../src/domain.mjs';
import { demoPolicy } from '../src/fixtures.mjs';
import { createPresenceRegistry } from '../src/presence.mjs';
import { createPresenceBridge } from '../src/presence-bridge.mjs';
import { projectPresenceViewModel } from '../web/presence-view-model.mjs';

// Fixtures inventados: no claves operativas, agentes reales ni solicitudes exteriores.
const projectId = 'demo/observatorio';
const directory = [
  { id: 'aurora/atlas', label: 'Atlas', ownerId: 'aurora', projects: [projectId, 'demo/archivo'] },
  { id: 'marea/bruma', label: 'Bruma', ownerId: 'marea', projects: [projectId] }
];

function registry(clock) {
  return createPresenceRegistry({
    directory, policy: demoPolicy, now: clock, onlineFor: 5, ttl: 10
  });
}

test('sin heartbeat autenticado: unknown, no online ni offline inventados', () => {
  const state = registry(() => 1000);
  for (const teamId of ['aurora', 'marea']) {
    const list = state.snapshot({ memberId: teamId, projectId });
    assert.deepEqual(list.map(x => [x.status, x.seenAt]),
      [['unknown', null], ['unknown', null]]);
  }
  assert.throws(() => state.snapshot({ memberId: 'marea', projectId: 'demo/archivo' }),
    { code: 'PRESENCE_FORBIDDEN' });
});

test('heartbeat válido: ventanas exactas online, stale y offline', () => {
  let clock = 1000;
  const state = registry(() => clock);
  state.heartbeat({ agentId: 'aurora/atlas', projectId, sequence: 1 });
  const get = () => state.snapshot({ memberId: 'marea', projectId })[0];
  assert.deepEqual([get().status, get().seenAt], ['online', 1000]);
  clock = 1005;
  assert.equal(get().status, 'online');
  clock = 1006;
  assert.equal(get().status, 'stale');
  clock = 1010;
  assert.equal(get().status, 'stale');
  clock = 1011;
  assert.deepEqual([get().status, get().seenAt], ['offline', 1000]);
  assert.equal(state.snapshot({ memberId: 'marea', projectId })[1].status, 'unknown');
  clock = 1012;
  state.heartbeat({ agentId: 'aurora/atlas', projectId, sequence: 2 });
  assert.deepEqual([get().status, get().seenAt], ['online', 1012]);
});

test('reloj retrocedido o inválido no acredita presencia online', () => {
  let clock = 1000;
  const state = registry(() => clock);
  state.heartbeat({ agentId: 'aurora/atlas', projectId, sequence: 4 });
  clock = 999;
  assert.equal(state.snapshot({ memberId: 'marea', projectId })[0].status, 'unknown');
  assert.throws(() => state.heartbeat({ agentId: 'aurora/atlas', projectId, sequence: 5 }),
    { code: 'PRESENCE_TIME' });
  clock = Number.NaN;
  assert.equal(state.snapshot({ memberId: 'marea', projectId })[0].status, 'unknown');
  clock = 1000;
  assert.equal(state.snapshot({ memberId: 'marea', projectId })[0].status, 'online');
  assert.throws(() => state.heartbeat({ agentId: 'aurora/atlas', projectId, sequence: 4 }),
    { code: 'PRESENCE_CONFLICT' });
});

test('revocación previa o posterior al heartbeat da offline sin resucitar el agente', () => {
  let clock = 1000;
  const state = registry(() => clock);
  state.revokeAgent('aurora/atlas');
  const read = () => state.snapshot({ memberId: 'marea', projectId });
  assert.deepEqual([read()[0].status, read()[0].seenAt], ['offline', null]);
  assert.deepEqual([read()[1].status, read()[1].seenAt], ['unknown', null]);
  assert.throws(() => state.heartbeat({ agentId: 'aurora/atlas', projectId, sequence: 1 }),
    { code: 'PRESENCE_FORBIDDEN' });
  state.heartbeat({ agentId: 'marea/bruma', projectId, sequence: 1 });
  assert.equal(read()[1].status, 'online');
  clock = 1020;
  assert.equal(read()[1].status, 'offline');
});

test('puente autenticado: unknown hasta publicación válida y sin filtrar credenciales', () => {
  let clock = 1000;
  const load = () => ({
    agents: directory,
    credentials: [
      { agentId: 'aurora/atlas', keyHash: digest('fixture-atlas-key') },
      { agentId: 'marea/bruma', keyHash: digest('fixture-bruma-key') }
    ]
  });
  const bridge = createPresenceBridge({ load, projectId, now: () => clock });
  assert.deepEqual(bridge.read('marea', demoPolicy).agents.map(a => a.status),
    ['unknown', 'unknown']);
  assert.throws(() => bridge.prepare('wrong-fixture-key', demoPolicy),
    { code: 'PRESENCE_AUTH' });
  const beat = bridge.prepare('fixture-atlas-key', demoPolicy);
  beat.commit({ projectId, sequence: 1 }, demoPolicy);
  beat.release();
  const snapshot = bridge.read('marea', demoPolicy);
  assert.deepEqual(snapshot.agents.map(a => a.status), ['online', 'unknown']);
  assert.doesNotMatch(JSON.stringify(snapshot), /keyHash|fixture-atlas-key|sequence/);
  clock = 16001;
  assert.deepEqual(bridge.read('marea', demoPolicy).agents.map(a => a.status),
    ['offline', 'unknown']);
});

test('view model admite unknown autorizado sin convertirlo en presencia real', () => {
  const raw = { generatedAt: 1000, expiresAt: 2000, agents: [
    { id: 'aurora/atlas', ownerId: 'aurora', label: 'Atlas <test>', status: 'unknown',
      seenAt: null, privateToken: 'SHOULD_NOT_APPEAR' },
    { id: 'marea/bruma', ownerId: 'marea', label: 'Bruma', status: 'offline',
      seenAt: 500 }
  ] };
  const result = projectPresenceViewModel(raw, { authorized: true });
  assert.equal(result.status, 'available');
  assert.equal(result.hasAgents, true);
  assert.deepEqual(result.agents.map(agent => agent.status), ['unknown', 'offline']);
  assert.equal(result.agents[0].seenAt, null);
  assert.equal(result.agents[0].label, 'Atlas &lt;test&gt;');
  assert.equal(JSON.stringify(result).includes('SHOULD_NOT_APPEAR'), false);
  assert.deepEqual(projectPresenceViewModel(raw, { authorized: false }).agents, []);
});
