import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePolicy, authenticate, authorizedProjects, projectTask, projectSnapshot, digest } from '../src/domain.mjs';
import { demoPolicy, makeIssue, makePR, SHA } from '../src/fixtures.mjs';
const clone = x => structuredClone(x);
const project = demoPolicy.projects[0]; const selected = { issue: 11, pullRequest: 21 };
function task(change = () => {}) { const issue = makeIssue(11); const pr = makePR(21); change(issue, pr); return projectTask(project, selected, issue, pr, demoPolicy); }

test('la cadena completa exige autoasignación bilateral, PR, revisión y CI del SHA actual', () => {
  const result = task(); assert.equal(result.stage, 'reviewed'); assert.equal(result.pullRequest.sha, SHA); assert.equal(result.evidence.length, 4);
});
test('una solicitud sin asignación no es trabajo empezado', () => assert.equal(projectTask(project, { issue: 11, pullRequest: null }, makeIssue(11, 'Ejemplo', false), null, demoPolicy).stage, 'requested'));
test('autoasignación sin PR solo acredita aceptación', () => assert.equal(projectTask(project, { issue: 11, pullRequest: null }, makeIssue(11), null, demoPolicy).stage, 'accepted'));
for (const [name, modify] of [
  ['asignación realizada por el solicitante', i => { i.assignments.nodes[0].actor.login = 'ada-demo'; }],
  ['último evento revoca la asignación', i => { i.assignments.nodes.push({ __typename: 'UnassignedEvent', actor: { login: 'ada-demo' }, assignee: { login: 'nico-demo' } }); }],
  ['sin prueba de aceptación', i => { i.assignments.nodes = []; }],
  ['varios responsables', i => { i.assignees.nodes.push({ login: 'ada-demo' }); }],
  ['asignaciones truncadas', i => { i.assignees.pageInfo.hasNextPage = true; }],
  ['un solo equipo no acredita bilateralidad', i => { i.author.login = 'nico-demo'; }],
  ['autor no incorporado', i => { i.author.login = 'unknown-demo'; }],
  ['entrega por otro autor', (i, p) => { p.author.login = 'ada-demo'; }]
]) test(`no se completa con ${name}`, () => assert.notEqual(task(modify).stage, 'reviewed'));
for (const [name, modify] of [
  ['CI ausente', (i, p) => { p.commits.nodes[0].commit.statusCheckRollup = null; }],
  ['CI rojo', (i, p) => { p.commits.nodes[0].commit.statusCheckRollup.state = 'FAILURE'; }],
  ['CI pendiente', (i, p) => { p.commits.nodes[0].commit.statusCheckRollup.state = 'PENDING'; }],
  ['CI de otro commit', (i, p) => { p.commits.nodes[0].commit.oid = '0'.repeat(40); }],
  ['aprobación antigua', (i, p) => { p.latestReviews.nodes[0].commit.oid = '0'.repeat(40); }],
  ['autorrevisión', (i, p) => { p.latestReviews.nodes[0].author.login = 'nico-demo'; }],
  ['revisión de usuario ajeno', (i, p) => { p.latestReviews.nodes[0].author.login = 'external-demo'; }],
  ['cambios solicitados', (i, p) => { p.latestReviews.nodes.push({ state: 'CHANGES_REQUESTED', author: { login: 'third-demo' }, commit: { oid: SHA } }); }],
  ['revisión obligatoria pendiente', (i, p) => { p.reviewDecision = 'REVIEW_REQUIRED'; }],
  ['revisiones incompletas', (i, p) => { p.latestReviews.pageInfo.hasNextPage = true; }],
  ['revisiones duplicadas', (i, p) => { p.latestReviews.nodes.push(clone(p.latestReviews.nodes[0])); }],
  ['borrador', (i, p) => { p.isDraft = true; }],
  ['PR cerrado sin integrar', (i, p) => { p.state = 'CLOSED'; }]
]) test(`no se completa con ${name}`, () => assert.notEqual(task(modify).stage, 'reviewed'));
test('cerrar el issue no sustituye la revisión', () => assert.equal(task((i, p) => { i.state = 'CLOSED'; p.latestReviews.nodes = []; }).stage, 'blocked'));
test('un PR fusionado no sustituye el CI', () => assert.equal(task((i, p) => { p.state = 'MERGED'; p.commits.nodes = []; }).stage, 'delivered'));
test('datos inexistentes fallan cerrados', () => {
  assert.equal(projectTask(project, selected, null, null, demoPolicy).stage, 'unavailable');
  assert.equal(projectTask(project, selected, makeIssue(11), null, demoPolicy).stage, 'unavailable');
  assert.equal(task((i, p) => { p.headRefOid = 'not-a-sha'; }).stage, 'unavailable');
});
test('la proyección no copia contenido no autorizado', () => {
  const result = task((i, p) => { i.body = 'PRIVATE_SENTINEL'; p.body = 'PRIVATE_SENTINEL'; p.files = ['PRIVATE_SENTINEL']; p.latestReviews.nodes[0].body = 'PRIVATE_SENTINEL'; });
  assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
});
test('solo se proyectan las selecciones explícitas y no sus recuentos excluidos', () => {
  const result = projectSnapshot({ ...project, tasks: [{ issue: 11, pullRequest: null }] }, { i0: makeIssue(11), excluded: makeIssue(99, 'PRIVATE_SENTINEL') }, demoPolicy);
  assert.equal(result.tasks.length, 1); assert.ok(!JSON.stringify(result).includes('PRIVATE_SENTINEL'));
});
test('identidad vinculada a clave y separación por proyecto', () => {
  assert.equal(authenticate(demoPolicy, 'demo-aurora').id, 'aurora'); assert.equal(authenticate(demoPolicy, 'bad'), null);
  assert.equal(authorizedProjects(demoPolicy, 'marea').length, 1); assert.equal(authorizedProjects(demoPolicy, 'aurora').length, 2);
  assert.throws(() => authorizedProjects(demoPolicy, 'unknown'));
});
for (const [name, modify] of [
  ['campos ajenos', p => { p.shell = 'bad'; }],
  ['versión desconocida', p => { p.version = 2; }],
  ['identidad duplicada', p => { p.members.push(clone(p.members[0])); }],
  ['cuenta duplicada', p => { p.members[1].githubLogin = p.members[0].githubLogin.toUpperCase(); }],
  ['clave reutilizada', p => { p.members[1].keyHash = p.members[0].keyHash; }],
  ['lector inexistente', p => { p.projects[0].readers.push('unknown'); }],
  ['repositorio no válido', p => { p.projects[0].repo = '../secrets'; }],
  ['issue no entero', p => { p.projects[0].tasks[0].issue = '1) { body }'; }],
  ['PR compartido por tareas', p => { p.projects[0].tasks[0].pullRequest = 22; }]
]) test(`política rechaza ${name}`, () => { const p = clone(demoPolicy); modify(p); assert.throws(() => validatePolicy(p)); });
test('política devuelve copia aislada y hash estable', () => { const p = validatePolicy(demoPolicy); p.projects.length = 0; assert.equal(demoPolicy.projects.length, 2); assert.equal(digest('x').length, 64); });

test('la política exige todos los campos y tipos de identidad explícitos', () => {
  for (const key of ['id', 'label', 'githubLogin', 'keyHash']) {
    const p = clone(demoPolicy); delete p.members[0][key]; assert.throws(() => validatePolicy(p));
  }
  const p = clone(demoPolicy); p.members[0].id = 42; p.projects[0].readers[0] = 42; p.projects[1].readers[0] = 42;
  assert.throws(() => validatePolicy(p));
});
test('la revisión y asignación incompletas no se dan por confirmadas', () => {
  assert.notEqual(task(i => { delete i.assignees.pageInfo; }).stage, 'reviewed');
  assert.notEqual(task(i => { i.assignees.nodes.push({ login: null }); }).stage, 'reviewed');
  assert.notEqual(task((i, p) => { p.latestReviews.nodes.push({ state: 'APPROVED', author: null, commit: { oid: SHA } }); }).stage, 'reviewed');
  assert.equal(task((i, p) => { delete p.isDraft; }).stage, 'unavailable');
});
