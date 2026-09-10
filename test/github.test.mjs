import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, GitHubSource } from '../src/github.mjs';
import { demoPolicy } from '../src/fixtures.mjs';
const project = demoPolicy.projects[0]; const token = 'synthetic-test-token-not-a-real-secret';
const response = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
test('GraphQL solo pide campos y números seleccionados', () => {
  const q = buildQuery(project); assert.deepEqual(q.variables, { owner: 'demo', name: 'observatorio' });
  assert.match(q.query, /issue\(number: 11\)/); assert.match(q.query, /pullRequest\(number: 22\)/);
  assert.doesNotMatch(q.query, /\b(body|bodyHTML|comments|files|diff|email|search|mutation)\b/);
  assert.doesNotMatch(q.query, /issue\(number: 31\)/);
});
test('destino de red fijo y redirecciones desactivadas', async () => {
  const source = new GitHubSource({ token, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.github.com/graphql'); assert.equal(options.redirect, 'error'); assert.equal(options.method, 'POST');
    assert.equal(options.headers.authorization, `Bearer ${token}`); return response({ data: { repository: { i0: { number: 11 } } } });
  } });
  assert.deepEqual(await source.read(project), { i0: { number: 11 } });
});
test('cero consultas si no hay tareas seleccionadas', async () => {
  const source = new GitHubSource({ token, fetchImpl: () => { throw new Error('No debe llamarse'); } });
  assert.deepEqual(await source.read({ ...project, tasks: [] }), {});
});
for (const [name, payload, status] of [
  ['errores GraphQL con HTTP 200', { errors: [{ message: 'PRIVATE_SENTINEL' }], data: { repository: {} } }, 200],
  ['repositorio inaccesible', { data: { repository: null } }, 200],
  ['credencial revocada', {}, 401], ['sin permiso', {}, 403], ['límite', {}, 429], ['error de origen', {}, 500]
]) test(`origen falla cerrado ante ${name}`, async () => {
  const source = new GitHubSource({ token, fetchImpl: async () => response(payload, status) });
  await assert.rejects(source.read(project), error => !error.message.includes('PRIVATE_SENTINEL'));
});
test('error de red no revela URL, credenciales ni contenido del proveedor', async () => {
  const source = new GitHubSource({ token, fetchImpl: async () => { throw new Error('PRIVATE_SENTINEL'); } });
  await assert.rejects(source.read(project), error => error.code === 'SOURCE_UNAVAILABLE' && !error.message.includes('PRIVATE_SENTINEL'));
});
test('JSON inválido y respuesta excesiva se rechazan', async () => {
  const invalid = new GitHubSource({ token, fetchImpl: async () => new Response('not JSON') });
  await assert.rejects(invalid.read(project), { code: 'SOURCE_FORMAT' });
  const large = new GitHubSource({ token, fetchImpl: async () => new Response('x'.repeat(2_000_001)) });
  await assert.rejects(large.read(project), { code: 'SOURCE_LIMIT' });
});
