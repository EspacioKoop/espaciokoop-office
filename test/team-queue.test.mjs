import test from 'node:test';
import assert from 'node:assert/strict';
import { OfficeError, projectSnapshot } from '../src/domain.mjs';
import { demoPolicy, makeIssue, makePR } from '../src/fixtures.mjs';
import { buildTeamQueue, validateTeamRoutes } from '../src/team-queue.mjs';

const routes = [
  { project_id: 'demo/observatorio', issue: 11, team_id: 'marea' },
  { project_id: 'demo/observatorio', issue: 12, team_id: 'aurora' },
  { project_id: 'demo/archivo', issue: 31, team_id: 'aurora' },
];

function snapshots() {
  return [
    projectSnapshot(demoPolicy.projects[0], {
      i0: makeIssue(11, 'Tarea aceptada'),
      i1: makeIssue(12, 'Tarea revisada'),
      p1: makePR(22, true),
    }, demoPolicy),
    projectSnapshot(demoPolicy.projects[1], {
      i0: makeIssue(31, 'Tarea privada de Aurora'),
      p0: makePR(41, true),
    }, demoPolicy),
  ];
}

test('cola: routing local es estricto y no admite estados inventados', () => {
  assert.throws(() => validateTeamRoutes([
    { project_id: 'demo/observatorio', issue: 11, team_id: 'marea', stage: 'reviewed' },
  ], demoPolicy), error => error instanceof OfficeError && error.code === 'TASK_ROUTE');
});

test('cola: un equipo solo ve tareas dirigidas a su cola y autorizadas por proyecto', () => {
  const queue = buildTeamQueue({ routes, policy: demoPolicy, teamId: 'marea', snapshots: snapshots() });
  assert.deepEqual(queue.map(item => item.id), ['demo/observatorio#11']);
  assert.equal(queue[0].team_id, 'marea');
  assert.equal(queue[0].source, 'github-projection');

  assert.throws(() => validateTeamRoutes([
    { project_id: 'demo/archivo', issue: 31, team_id: 'marea' },
  ], demoPolicy), error => error instanceof OfficeError && error.code === 'TASK_ROUTE');
});

test('cola: requested/accepted/delivered/reviewed vienen de la proyección GitHub', () => {
  const queue = buildTeamQueue({ routes, policy: demoPolicy, teamId: 'aurora', snapshots: snapshots() });
  const reviewed = queue.find(item => item.issue === 12);

  assert.equal(reviewed.stage, 'reviewed');
  assert.equal(reviewed.pull_request.number, 22);
  assert.equal(reviewed.pull_request.ci, 'SUCCESS');
  assert.ok(reviewed.evidence.some(item => item.kind === 'reviewed'));
});

test('cola: cambiar routing cambia visibilidad, no la fase de trabajo', () => {
  const shared = snapshots();
  const toMarea = buildTeamQueue({
    routes: [{ project_id: 'demo/observatorio', issue: 12, team_id: 'marea' }],
    policy: demoPolicy,
    teamId: 'marea',
    snapshots: shared,
  });
  const toAurora = buildTeamQueue({
    routes: [{ project_id: 'demo/observatorio', issue: 12, team_id: 'aurora' }],
    policy: demoPolicy,
    teamId: 'aurora',
    snapshots: shared,
  });

  assert.equal(toMarea[0].stage, 'reviewed');
  assert.equal(toAurora[0].stage, 'reviewed');
});

test('cola: snapshot ausente no se convierte en aceptación local', () => {
  const queue = buildTeamQueue({
    routes: [{ project_id: 'demo/observatorio', issue: 11, team_id: 'marea' }],
    policy: demoPolicy,
    teamId: 'marea',
    snapshots: [],
  });

  assert.equal(queue[0].stage, 'unavailable');
  assert.equal(queue[0].acceptance, 'unconfirmed');
  assert.equal(queue[0].pull_request, null);
});

test('cola: duplicados y tareas fuera de la selección canónica se rechazan', () => {
  assert.throws(() => validateTeamRoutes([
    { project_id: 'demo/observatorio', issue: 11, team_id: 'marea' },
    { project_id: 'demo/observatorio', issue: 11, team_id: 'aurora' },
  ], demoPolicy), error => error instanceof OfficeError && error.code === 'TASK_ROUTE');

  assert.throws(() => validateTeamRoutes([
    { project_id: 'demo/observatorio', issue: 999, team_id: 'marea' },
  ], demoPolicy), error => error instanceof OfficeError && error.code === 'TASK_ROUTE');
});
