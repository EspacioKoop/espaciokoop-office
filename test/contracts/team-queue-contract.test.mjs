import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { projectSnapshot } from '../../src/domain.mjs';
import { demoPolicy, makeIssue, makePR } from '../../src/fixtures.mjs';
import { buildTeamQueue, validateTeamRoutes } from '../../src/team-queue.mjs';

const validRoutes = [
  { project_id: 'demo/observatorio', issue: 11, team_id: 'marea' },
  { project_id: 'demo/observatorio', issue: 12, team_id: 'aurora' },
  { project_id: 'demo/archivo', issue: 31, team_id: 'aurora' },
];

function sampleSnapshots() {
  return [
    projectSnapshot(demoPolicy.projects[0], {
      i0: makeIssue(11, 'Tarea 11'),
      i1: makeIssue(12, 'Tarea 12'),
      p1: makePR(22, true),
    }, demoPolicy),
    projectSnapshot(demoPolicy.projects[1], {
      i0: makeIssue(31, 'Tarea 31'),
      p0: makePR(41, true),
    }, demoPolicy),
  ];
}

test('propiedad: projectQueue deriva de GitHub sin mutar los snapshots de entrada', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('marea', 'aurora'),
      (teamId) => {
        const snapshots = sampleSnapshots();
        const copy = structuredClone(snapshots);

        const queue = buildTeamQueue({
          routes: validRoutes,
          policy: demoPolicy,
          teamId,
          snapshots,
        });

        assert.deepEqual(snapshots, copy); // no muta snapshot
        assert(Array.isArray(queue));
        for (const item of queue) {
          assert.equal(item.source, 'github-projection');
          assert.equal(item.team_id, teamId);
        }
      }
    )
  );
});

test('propiedad: validateTeamRoutes es determinista, puro y valida autorización por lectura', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('demo/observatorio', 'demo/archivo'),
      fc.constantFrom('aurora', 'marea'),
      (projectId, teamId) => {
        const issue = projectId === 'demo/observatorio' ? 11 : 31;
        const rawRoutes = [{ project_id: projectId, issue, team_id: teamId }];
        const copy = structuredClone(rawRoutes);

        const project = demoPolicy.projects.find(p => p.repo === projectId);
        const isAuthorized = project.readers.includes(teamId);

        if (isAuthorized) {
          const res1 = validateTeamRoutes(rawRoutes, demoPolicy);
          const res2 = validateTeamRoutes(rawRoutes, demoPolicy);
          assert.deepEqual(res1, res2);
          assert.deepEqual(rawRoutes, copy);
        } else {
          assert.throws(
            () => validateTeamRoutes(rawRoutes, demoPolicy),
            err => err && err.code === 'TASK_ROUTE'
          );
        }
      }
    )
  );
});

test('propiedad: evita colas locales duplicadas para el mismo issue', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('aurora', 'marea'),
      fc.constantFrom('aurora', 'marea'),
      (team1, team2) => {
        const rawRoutes = [
          { project_id: 'demo/observatorio', issue: 11, team_id: team1 },
          { project_id: 'demo/observatorio', issue: 11, team_id: team2 },
        ];

        // Incluso si team1 !== team2, el mismo issue en el mismo repo no puede estar en dos colas simultáneas
        assert.throws(
          () => validateTeamRoutes(rawRoutes, demoPolicy),
          err => err && err.code === 'TASK_ROUTE'
        );
      }
    )
  );
});

test('propiedad: snapshots ausentes o desalineados devuelven estado unavailable determinista', () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      (emptySnapshots) => {
        const snapshots = emptySnapshots ? [] : [
          { repo: 'demo/observatorio', tasks: [] },
        ];

        const queue = buildTeamQueue({
          routes: [{ project_id: 'demo/observatorio', issue: 11, team_id: 'marea' }],
          policy: demoPolicy,
          teamId: 'marea',
          snapshots,
        });

        assert.equal(queue.length, 1);
        const item = queue[0];
        assert.equal(item.stage, 'unavailable');
        assert.equal(item.title, 'Metadato no disponible');
        assert.equal(item.acceptance, 'unconfirmed');
        assert.equal(item.assignee, null);
        assert.equal(item.pull_request, null);
        assert.equal(item.source, 'github-projection');
        assert(Array.isArray(item.reasons));
      }
    )
  );
});

test('propiedad: aislamiento estricto por equipo sin filtración de tareas entre equipos', () => {
  fc.assert(
    fc.property(
      fc.constantFrom('marea', 'aurora'),
      (teamId) => {
        const queue = buildTeamQueue({
          routes: validRoutes,
          policy: demoPolicy,
          teamId,
          snapshots: sampleSnapshots(),
        });

        for (const item of queue) {
          assert.equal(item.team_id, teamId);
          const expectedRoute = validRoutes.find(
            r => r.project_id === item.project_id && r.issue === item.issue
          );
          assert.equal(expectedRoute.team_id, teamId);
        }
      }
    )
  );
});

test('propiedad: estructura de tareas y estadios de cola conformes con las etapas del sistema', () => {
  const allowedStages = new Set(['requested', 'accepted', 'delivered', 'reviewed', 'blocked', 'unavailable']);

  fc.assert(
    fc.property(
      fc.constantFrom('marea', 'aurora'),
      (teamId) => {
        const queue = buildTeamQueue({
          routes: validRoutes,
          policy: demoPolicy,
          teamId,
          snapshots: sampleSnapshots(),
        });

        for (const task of queue) {
          assert(allowedStages.has(task.stage));
          assert.equal(typeof task.id, 'string');
          assert.equal(typeof task.project_id, 'string');
          assert.equal(typeof task.issue, 'number');
          assert.equal(typeof task.team_id, 'string');
          assert.equal(typeof task.title, 'string');
          assert.equal(typeof task.url, 'string');
          assert(Array.isArray(task.evidence));
          assert(Array.isArray(task.reasons));
          assert.equal(task.source, 'github-projection');
        }
      }
    )
  );
});
