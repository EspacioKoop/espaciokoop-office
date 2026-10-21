import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, projectSnapshot, validatePolicy } from '../src/domain.mjs';
import { makeIssue } from '../src/fixtures.mjs';
import { buildTeamQueue, validateTeamRoutes } from '../src/team-queue.mjs';
import { createPresenceRegistry } from '../src/presence.mjs';

// Identidades y proyectos ficticios: no hay agentes conectados ni acceso a red.
const policy = validatePolicy({
  version: 1,
  members: ['atlas', 'brisa', 'cauce'].map(id => ({
    id, label: `Equipo ${id}`, githubLogin: `demo-${id}`, keyHash: digest(`fixture-${id}`),
  })),
  projects: [
    { repo: 'example/publico', label: 'Colaboración', readers: ['atlas', 'brisa', 'cauce'],
      tasks: [{ issue: 11, pullRequest: null }, { issue: 12, pullRequest: null }] },
    { repo: 'example/privado-brisa', label: 'Proyecto reservado B', readers: ['brisa'],
      tasks: [{ issue: 21, pullRequest: null }] },
    { repo: 'example/privado-cauce', label: 'Proyecto reservado C', readers: ['cauce'],
      tasks: [{ issue: 31, pullRequest: null }] },
  ],
});

const routes = [
  { project_id: 'example/publico', issue: 11, team_id: 'atlas' },
  { project_id: 'example/publico', issue: 12, team_id: 'brisa' },
  { project_id: 'example/privado-brisa', issue: 21, team_id: 'brisa' },
  { project_id: 'example/privado-cauce', issue: 31, team_id: 'cauce' },
];
const snapshots = policy.projects.map(project => projectSnapshot(project,
  Object.fromEntries(project.tasks.map((task, i) => [
    `i${i}`, makeIssue(task.issue, `EVIDENCIA_INTERNA_${project.repo}_${task.issue}`, false),
  ])), policy));

const agents = [
  { id: 'atlas/uno', label: 'Agente A', ownerId: 'atlas', projects: ['example/publico'] },
  { id: 'brisa/dos', label: 'Agente B', ownerId: 'brisa', projects: ['example/publico', 'example/privado-brisa'] },
  { id: 'cauce/tres', label: 'Agente C', ownerId: 'cauce', projects: ['example/privado-cauce'] },
];

function queue(teamId, customRoutes = routes, customSnapshots = snapshots) {
  return buildTeamQueue({ teamId, routes: customRoutes, snapshots: customSnapshots, policy });
}

test('aislamiento de 3 equipos: la cola y evidencias de otros equipos no aparecen', () => {
  const expected = {
    atlas: ['example/publico#11'],
    brisa: ['example/publico#12', 'example/privado-brisa#21'],
    cauce: ['example/privado-cauce#31'],
  };
  for (const [teamId, ids] of Object.entries(expected)) {
    const result = queue(teamId);
    assert.deepEqual(result.map(item => item.id), ids);
    assert.deepEqual(result.map(item => item.team_id), ids.map(() => teamId));
    const serialized = JSON.stringify(result);
    for (const other of Object.values(expected).flat().filter(id => !ids.includes(id))) {
      assert.equal(serialized.includes(`EVIDENCIA_INTERNA_${other.replace('#', '_')}`), false);
    }
  }
});

test('denegación por defecto: rutas ajenas y miembros desconocidos', () => {
  assert.throws(() => queue('ausente'), { code: 'FORBIDDEN' });
  assert.throws(() => validateTeamRoutes([
    { project_id: 'example/privado-brisa', issue: 21, team_id: 'atlas' },
  ], policy), { code: 'TASK_ROUTE' });
  assert.throws(() => queue('atlas', [
    ...routes, { project_id: 'example/privado-cauce', issue: 31, team_id: 'atlas' },
  ]), { code: 'TASK_ROUTE' });
});

test('snapshot de otro proyecto no abre rutas ni expone evidencias', () => {
  const tampered = structuredClone(snapshots);
  tampered.unshift({ repo: 'example/privado-brisa', tasks: [
    { number: 21, title: 'FILTRACION_DESDE_SNAPSHOT', stage: 'reviewed',
      url: 'https://github.com/example/privado-brisa/issues/21', evidence: [{ secret: 'NO_EXPORTAR' }] },
  ] });
  const result = queue('atlas', routes, tampered);
  assert.deepEqual(result.map(item => item.id), ['example/publico#11']);
  assert.equal(JSON.stringify(result).includes('NO_EXPORTAR'), false);
  assert.equal(JSON.stringify(result).includes('FILTRACION_DESDE_SNAPSHOT'), false);
});

test('snapshot ausente no fabrica entregas ni evidencias', () => {
  const result = queue('brisa', routes, []);
  assert.equal(result.length, 2);
  for (const task of result) {
    assert.equal(task.stage, 'unavailable');
    assert.equal(task.acceptance, 'unconfirmed');
    assert.deepEqual(task.evidence, []);
    assert.equal(task.pull_request, null);
  }
});

test('presencia: lectores privados aislados, secuencia de estados y suplantación bloqueada', () => {
  let clock = 1000;
  const presence = createPresenceRegistry({ directory: agents, policy, now: () => clock,
    onlineFor: 5, ttl: 10 });
  presence.heartbeat({ agentId: 'brisa/dos', projectId: 'example/privado-brisa', sequence: 1 });
  presence.heartbeat({ agentId: 'cauce/tres', projectId: 'example/privado-cauce', sequence: 1 });
  presence.heartbeat({ agentId: 'atlas/uno', projectId: 'example/publico', sequence: 1 });
  assert.deepEqual(presence.snapshot({ memberId: 'atlas', projectId: 'example/publico' })
    .map(agent => agent.id), ['atlas/uno', 'brisa/dos']);
  assert.throws(() => presence.snapshot({ memberId: 'atlas', projectId: 'example/privado-brisa' }),
    { code: 'PRESENCE_FORBIDDEN' });
  assert.throws(() => presence.snapshot({ memberId: 'brisa', projectId: 'example/privado-cauce' }),
    { code: 'PRESENCE_FORBIDDEN' });
  assert.throws(() => presence.snapshot({ memberId: 'ausente', projectId: 'example/publico' }),
    { code: 'PRESENCE_FORBIDDEN' });
  assert.throws(() => presence.heartbeat({ agentId: 'atlas/uno', projectId: 'example/privado-brisa', sequence: 1 }),
    { code: 'PRESENCE_FORBIDDEN' });
  clock = 1006;
  assert.equal(presence.snapshot({ memberId: 'brisa', projectId: 'example/privado-brisa' })[0].status, 'stale');
  clock = 1011;
  assert.equal(presence.snapshot({ memberId: 'brisa', projectId: 'example/privado-brisa' })[0].status, 'offline');
  assert.equal(presence.snapshot({ memberId: 'cauce', projectId: 'example/privado-cauce' })[0].status, 'offline');
});

test('revocación de un agente no afecta al otro propietario', () => {
  const presence = createPresenceRegistry({ directory: agents, policy, now: () => 1000 });
  presence.heartbeat({ agentId: 'brisa/dos', projectId: 'example/publico', sequence: 1 });
  presence.heartbeat({ agentId: 'atlas/uno', projectId: 'example/publico', sequence: 1 });
  presence.revokeAgent('brisa/dos');
  const view = presence.snapshot({ memberId: 'atlas', projectId: 'example/publico' });
  assert.equal(view.find(x => x.id === 'brisa/dos').status, 'offline');
  assert.equal(view.find(x => x.id === 'brisa/dos').seenAt, null);
  assert.equal(view.find(x => x.id === 'atlas/uno').status, 'online');
  assert.throws(() => presence.heartbeat({ agentId: 'brisa/dos', projectId: 'example/publico', sequence: 2 }),
    { code: 'PRESENCE_FORBIDDEN' });
});
