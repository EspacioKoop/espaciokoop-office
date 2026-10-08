import test from 'node:test';
import assert from 'node:assert/strict';
import { demoPolicy } from '../src/fixtures.mjs';
import { createPresenceRegistry, validateAgentDirectory } from '../src/presence.mjs';

const directory = [
  { id: 'aurora/atlas', label: 'Atlas', ownerId: 'aurora', projects: ['demo/observatorio', 'demo/archivo'] },
  { id: 'aurora/lumen', label: 'Lumen', ownerId: 'aurora', projects: ['demo/observatorio'] },
  { id: 'marea/bruma', label: 'Bruma', ownerId: 'marea', projects: ['demo/observatorio'] }
];

test('directorio separa agentes del mismo propietario sin inventar cuentas GitHub', () => {
  const agents = validateAgentDirectory(directory, demoPolicy);
  assert.deepEqual(agents.map(a => a.id), ['aurora/atlas', 'aurora/lumen', 'marea/bruma']);
  assert.equal(agents[0].ownerId, agents[1].ownerId);
});

for (const [name, mutate] of [
  ['id duplicado', agents => { agents[1].id = agents[0].id; }],
  ['namespace ajeno', agents => { agents[0].id = 'marea/atlas'; }],
  ['propietario inexistente', agents => { agents[0].ownerId = 'unknown'; agents[0].id = 'unknown/atlas'; }],
  ['proyecto no autorizado', agents => { agents[2].projects = ['demo/archivo']; }],
  ['proyecto duplicado', agents => { agents[0].projects = ['demo/observatorio', 'demo/observatorio']; }]
]) test(`directorio rechaza ${name}`, () => {
  const agents = structuredClone(directory); mutate(agents);
  assert.throws(() => validateAgentDirectory(agents, demoPolicy));
});

test('presencia pasa de online a stale y offline sin tocar identidad ni posición', () => {
  let time = 1000;
  const registry = createPresenceRegistry({ directory, policy: demoPolicy, now: () => time, onlineFor: 5, ttl: 10 });
  registry.heartbeat({ agentId: 'aurora/atlas', projectId: 'demo/observatorio', sequence: 1 });
  assert.equal(registry.snapshot({ memberId: 'marea', projectId: 'demo/observatorio' }).find(a => a.id === 'aurora/atlas').status, 'online');
  time = 1006;
  assert.equal(registry.snapshot({ memberId: 'marea', projectId: 'demo/observatorio' }).find(a => a.id === 'aurora/atlas').status, 'stale');
  time = 1011;
  const offline = registry.snapshot({ memberId: 'marea', projectId: 'demo/observatorio' }).find(a => a.id === 'aurora/atlas');
  assert.equal(offline.status, 'offline');
  assert.equal(offline.seenAt, 1000);
});

test('heartbeat exige secuencia estrictamente creciente', () => {
  const registry = createPresenceRegistry({ directory, policy: demoPolicy });
  registry.heartbeat({ agentId: 'marea/bruma', projectId: 'demo/observatorio', sequence: 7 });
  assert.throws(() => registry.heartbeat({ agentId: 'marea/bruma', projectId: 'demo/observatorio', sequence: 7 }), { code: 'PRESENCE_CONFLICT' });
  assert.throws(() => registry.heartbeat({ agentId: 'marea/bruma', projectId: 'demo/observatorio', sequence: 6 }), { code: 'PRESENCE_CONFLICT' });
});

test('agente no puede publicar presencia en un proyecto fuera de su directorio', () => {
  const registry = createPresenceRegistry({ directory, policy: demoPolicy });
  assert.throws(() => registry.heartbeat({ agentId: 'marea/bruma', projectId: 'demo/archivo', sequence: 1 }), { code: 'PRESENCE_FORBIDDEN' });
});

test('lector ajeno no puede enumerar presencia de un proyecto privado', () => {
  const registry = createPresenceRegistry({ directory, policy: demoPolicy });
  assert.throws(() => registry.snapshot({ memberId: 'marea', projectId: 'demo/archivo' }), { code: 'PRESENCE_FORBIDDEN' });
});

test('revocar agente o proyecto retira presencia sin borrar el directorio', () => {
  const registry = createPresenceRegistry({ directory, policy: demoPolicy });
  registry.heartbeat({ agentId: 'aurora/atlas', projectId: 'demo/observatorio', sequence: 1 });
  registry.heartbeat({ agentId: 'marea/bruma', projectId: 'demo/observatorio', sequence: 1 });
  registry.revokeAgent('aurora/atlas');
  let view = registry.snapshot({ memberId: 'aurora', projectId: 'demo/observatorio' });
  assert.equal(view.find(a => a.id === 'aurora/atlas').status, 'offline');
  assert.equal(view.find(a => a.id === 'marea/bruma').status, 'online');
  registry.revokeProject('demo/observatorio');
  assert.throws(() => registry.snapshot({ memberId: 'aurora', projectId: 'demo/observatorio' }),
    { code: 'PRESENCE_FORBIDDEN' });
});

test('revocación de agente impide reconexión sin afectar al otro propietario', () => {
  const registry = createPresenceRegistry({ directory, policy: demoPolicy });
  registry.heartbeat({ agentId: 'aurora/atlas', projectId: 'demo/observatorio', sequence: 7 });
  registry.revokeAgent('aurora/atlas');
  for (const sequence of [1, 8]) assert.throws(() => registry.heartbeat({
    agentId: 'aurora/atlas', projectId: 'demo/observatorio', sequence,
  }), { code: 'PRESENCE_FORBIDDEN' });
  registry.heartbeat({ agentId: 'marea/bruma', projectId: 'demo/observatorio', sequence: 1 });
  assert.equal(registry.snapshot({ memberId: 'marea', projectId: 'demo/observatorio' })
    .find(a => a.id === 'marea/bruma').status, 'online');
});

test('revocación de proyecto impide lectura y publicación, conserva otros proyectos', () => {
  const registry = createPresenceRegistry({ directory, policy: demoPolicy });
  registry.revokeProject('demo/observatorio');
  assert.throws(() => registry.snapshot({ memberId: 'aurora', projectId: 'demo/observatorio' }),
    { code: 'PRESENCE_FORBIDDEN' });
  assert.throws(() => registry.heartbeat({ agentId: 'marea/bruma', projectId: 'demo/observatorio', sequence: 1 }),
    { code: 'PRESENCE_FORBIDDEN' });
  registry.heartbeat({ agentId: 'aurora/atlas', projectId: 'demo/archivo', sequence: 1 });
  assert.equal(registry.snapshot({ memberId: 'aurora', projectId: 'demo/archivo' })[0].status, 'online');
});

test('política del registry no se amplía al mutar el objeto del llamador', () => {
  const policy = structuredClone(demoPolicy);
  const registry = createPresenceRegistry({ directory, policy });
  policy.projects[1].readers.push('marea');
  assert.throws(() => registry.snapshot({ memberId: 'marea', projectId: 'demo/archivo' }),
    { code: 'PRESENCE_FORBIDDEN' });
});
